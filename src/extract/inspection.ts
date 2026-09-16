/** Additional static analysis shares the existing inert JSDOM document. */
import { safeHTTP } from '../url.js';
import type { ExtractionRule, PageInspection, StructuredItem } from '../inspection-types.js';
const clean = (text: string | null | undefined, max = 4000) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function jsonTypes(value: unknown, into = new Set<string>(), depth = 0): string[] {
  if (depth > 12 || into.size >= 40 || !value || typeof value !== 'object') return [...into];
  if (Array.isArray(value)) { for (const v of value.slice(0, 100)) jsonTypes(v, into, depth + 1); }
  else {
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
    for (const type of types) if (typeof type === 'string') into.add(type.slice(0, 200));
    for (const v of Object.values(record).slice(0, 100)) if (typeof v === 'object') jsonTypes(v, into, depth + 1);
  }
  return [...into];
}
export function inspectDocument(doc: Document, url: string, rules: ExtractionRule[] = []): PageInspection {
  const metadata: Record<string, string[]> = Object.create(null);
  const metaNodes = Array.from(doc.querySelectorAll('meta[name],meta[property]'));
  for (const el of metaNodes.slice(0, 100)) {
    const key = clean(el.getAttribute('name') ?? el.getAttribute('property'), 150).toLowerCase();
    if (!key) continue;
    (metadata[key] ??= []).push(clean(el.getAttribute('content')));
    metadata[key] = metadata[key]!.slice(0, 8);
  }
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  body?.querySelectorAll('script,style,template,noscript,[hidden],[aria-hidden="true"]').forEach(el => el.remove());
  const fullText = clean(body?.textContent, 2 * 1024 * 1024);
  const word_count = fullText ? fullText.split(/\s+/u).length : 0;
  let truncated = metaNodes.length > 100 || fullText.length >= 2 * 1024 * 1024;
  const structured_data: StructuredItem[] = [];
  const ldNodes = Array.from(doc.querySelectorAll('script[type="application/ld+json" i]'));
  let structuredBytes = 0;
  for (const el of ldNodes.slice(0, 20)) {
    const text = el.textContent ?? ''; structuredBytes += text.length;
    if (text.length > 64000 || structuredBytes > 128000) {
      truncated = true; structured_data.push({ format: 'json-ld', types: [], valid: false, error: 'JSON-LD exceeds the capture budget (64 KB/block, 128 KB/page).' }); continue;
    }
    try { const value: unknown = JSON.parse(text); structured_data.push({ format: 'json-ld', valid: true, types: jsonTypes(value), value }); }
    catch (error) { structured_data.push({ format: 'json-ld', valid: false, types: [], error: clean(String(error), 300) }); }
  }
  if (ldNodes.length > 20) truncated = true;
  // Microdata and RDFa are inventories, not claims of vocabulary/schema validation.
  for (const [selector, format, attribute] of [['[itemscope][itemtype]', 'microdata', 'itemtype'], ['[typeof]', 'rdfa', 'typeof']] as const) {
    for (const el of Array.from(doc.querySelectorAll(selector)).slice(0, 20)) {
      structured_data.push({ format, valid: true, types: clean(el.getAttribute(attribute), 300).split(/\s+/),
        value: { text: clean(el.textContent, 1500), properties: Array.from(el.querySelectorAll('[itemprop],[property]')).slice(0, 40).map(p => ({ name: clean(p.getAttribute('itemprop') ?? p.getAttribute('property'), 100), value: clean(p.getAttribute('content') ?? p.textContent, 500) })) } });
    }
  }
  const base = safeHTTP(doc.querySelector('base[href]')?.getAttribute('href') ?? '', url) ?? url;
  const hreflang = Array.from(doc.querySelectorAll('link[hreflang][href]')).slice(0, 100).map(el => ({ language: clean(el.getAttribute('hreflang'), 40), url: safeHTTP(el.getAttribute('href') ?? '', base) ?? '' })).filter(r => r.url);
  const scripts = Array.from(doc.querySelectorAll('script[src]')).slice(0, 500).map(s => s.getAttribute('src') ?? '').join(' ');
  const technologies: PageInspection['technologies'] = [];
  const hint = (name: string, evidence: string, confidence: 'high' | 'medium' = 'medium') => technologies.push({ name, confidence, evidence });
  if (/\/_next\//i.test(scripts) || doc.querySelector('#__NEXT_DATA__')) hint('Next.js', 'Next data or /_next/ script path');
  if (doc.querySelector('#__NUXT_DATA__,#__nuxt') || /\/_nuxt\//.test(scripts)) hint('Nuxt', 'Nuxt root/data or /_nuxt/ script path');
  if (doc.querySelector('[ng-version]')) hint('Angular', 'ng-version attribute', 'high');
  if (doc.querySelector('[data-reactroot],#__next')) hint('React', 'React root marker');
  if (doc.querySelector('[data-v-app]')) hint('Vue', 'data-v-app root marker');
  if (/wp-content|wp-includes/i.test(scripts) || /wordpress/i.test(metadata.generator?.join(' ') ?? '')) hint('WordPress', 'WordPress asset or generator marker');
  if (/cdn\.shopify\.com|\/shopify\//i.test(scripts)) hint('Shopify', 'Shopify asset hostname/path');
  if (/googletagmanager\.com\/gtm/.test(scripts)) hint('Google Tag Manager', 'Tag Manager loader URL', 'high');
  if (/svelte/i.test(metadata.generator?.join(' ') ?? '') || doc.querySelector('[data-sveltekit-preload-data]')) hint('SvelteKit', 'SvelteKit preload marker or generator');
  const render_signals: string[] = [];
  const executable = doc.querySelectorAll('script[src],script[type="module"],script:not([type])').length;
  if (executable && word_count < 30) render_signals.push(`Only ${word_count} source words with executable scripts`);
  if (executable && doc.querySelector('#root:empty,#app:empty,#__next:empty,app-root:empty,#__nuxt:empty')) render_signals.push('Empty application root');
  if (executable && word_count < 100 && doc.querySelectorAll('a[href]').length < 2) render_signals.push('Minimal source navigation with JavaScript');
  if (/enable javascript|javascript (?:is )?required/i.test(doc.querySelector('noscript')?.textContent ?? '') && word_count < 100) render_signals.push('Page explicitly requires JavaScript');
  const custom: Record<string, string[]> = Object.create(null);
  const extraction_errors: string[] = [];
  for (const rule of rules) {
    try {
      const matches = doc.querySelectorAll(rule.selector);
      if (matches.length > 30) truncated = true;
      custom[rule.name] = Array.from(matches).slice(0, 30).map(el => rule.mode === 'html' ? el.outerHTML.slice(0, 2000) : rule.mode === 'attribute' ? (el.getAttribute(rule.attribute!) ?? '').slice(0, 2000) : clean(el.textContent, 2000));
    } catch { extraction_errors.push(`${rule.name}: invalid or unsupported CSS selector`); custom[rule.name] = []; }
  }
  return { word_count, text_sample: fullText.slice(0, 4000), metadata, hreflang, structured_data,
    technologies, custom, extraction_errors, render_signals, truncated };
}
