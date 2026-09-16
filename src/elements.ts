/** Bounded, static-HTML element inventories. Nothing is executed or downloaded here. */
import { safeHTTP } from './url.js';
import type { PageElements, ImageElement, ResourceElement } from './types.js';

export const ELEMENT_LIMIT = 500;
const clean = (value: string | null | undefined, max = 2000): string => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Read common srcset syntax without splitting commas embedded in a data URL. */
export function srcsetURLs(value: string): string[] {
  const result: string[] = [];
  let rest = value.trim();
  while (rest && result.length < 50) {
    rest = rest.replace(/^[,\s]+/, '');
    const match = /^[^\s]+/.exec(rest);
    if (!match) break;
    let candidate = match[0]; rest = rest.slice(candidate.length);
    if (candidate.endsWith(',')) candidate = candidate.replace(/,+$/, '');
    else { const comma = rest.indexOf(','); rest = comma < 0 ? '' : rest.slice(comma + 1); }
    if (candidate && !candidate.startsWith('data:')) result.push(candidate);
  }
  return result;
}

/** Capture attributes only: form values, passwords, script bodies and inline CSS are excluded. */
export function extractElements(doc: Document, pageURL: string): PageElements {
  const base = safeHTTP(doc.querySelector('base[href]')?.getAttribute('href') ?? '', pageURL) ?? pageURL;
  const resolve = (value: string | null | undefined): string => value?.trim() ? (value.trim().length <= 8192 ? safeHTTP(value.trim(), base) ?? '' : '') : '';
  let truncated = false;
  const take = (selector: string): Element[] => {
    const all = doc.querySelectorAll(selector);
    if (all.length > ELEMENT_LIMIT) truncated = true;
    return Array.from(all).slice(0, ELEMENT_LIMIT);
  };
  const headings = take('h1,h2,h3,h4,h5,h6').map(el => ({ level: Number(el.tagName.slice(1)), text: clean(el.textContent), id: clean(el.id, 200) }));
  const images: ImageElement[] = take('img').map(el => {
    const candidates = [el.getAttribute('src'), el.getAttribute('data-src'), el.getAttribute('data-original'),
      ...srcsetURLs(el.getAttribute('srcset') ?? ''), ...srcsetURLs(el.getAttribute('data-srcset') ?? '')];
    // Picture sources belong to the same image occurrence and share its accessible description.
    if (el.parentElement?.tagName === 'PICTURE') for (const source of Array.from(el.parentElement.querySelectorAll('source')).slice(0, 20)) {
      candidates.push(...srcsetURLs(source.getAttribute('srcset') ?? ''));
    }
    const urls = [...new Set(candidates.map(resolve).filter(Boolean))].slice(0, 50);
    const dimension = (name: string): number | null => { const v = Number(el.getAttribute(name)); return Number.isFinite(v) && v > 0 ? Math.min(v, 100000) : null; };
    return { src: urls[0] ?? '', candidates: urls, alt: el.hasAttribute('alt') ? clean(el.getAttribute('alt')) : null,
      title: clean(el.getAttribute('title')), srcset: clean(el.getAttribute('srcset'), 4000),
      width: dimension('width'), height: dimension('height'), loading: clean(el.getAttribute('loading'), 30) };
  }).filter(el => el.src);
  const links = take('a[href],area[href]').map(el => ({ url: resolve(el.getAttribute('href')), text: clean(el.textContent || el.getAttribute('alt')),
    title: clean(el.getAttribute('title')), discovery: 'raw' as const, rel: clean(el.getAttribute('rel'), 200), target: clean(el.getAttribute('target'), 50) })).filter(el => el.url);
  const resources: ResourceElement[] = [];
  for (const el of take('script[src],link[href],video[src],video[poster],audio[src],source[src],iframe[src],embed[src],object[data]')) {
    const tag = el.tagName.toLowerCase();
    let kind: ResourceElement['kind'] = 'other';
    if (tag === 'script') kind = 'script';
    else if (tag === 'link') { if (!el.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('stylesheet')) continue; kind = 'stylesheet'; }
    else if (tag === 'iframe') kind = 'frame';
    else if (tag === 'video' || el.parentElement?.tagName === 'VIDEO') kind = 'video';
    else if (tag === 'audio' || el.parentElement?.tagName === 'AUDIO') kind = 'audio';
    const url = resolve(el.getAttribute(tag === 'link' ? 'href' : tag === 'object' ? 'data' : 'src'));
    if (url) resources.push({ kind, url, type: clean(el.getAttribute('type'), 100) });
    const poster = resolve(el.getAttribute('poster'));
    if (poster) resources.push({ kind: 'poster', url: poster, type: '' });
  }
  for (const link of links) if (/\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt)(?:$|[?#])/i.test(link.url)) resources.push({ kind: 'document', url: link.url, type: '' });
  if (resources.length > ELEMENT_LIMIT) truncated = true;
  const forms = take('form').map(el => {
    const controls = el.querySelectorAll('input,select,textarea,button');
    if (controls.length > 100) truncated = true;
    return { enctype: clean(el.getAttribute('enctype') || 'application/x-www-form-urlencoded', 100), action: el.getAttribute('action') ? resolve(el.getAttribute('action')) : pageURL, method: clean(el.getAttribute('method') || 'GET', 20).toUpperCase(),
      fields: Array.from(controls).slice(0, 100).map(field => ({ tag: field.tagName.toLowerCase(), type: clean(field.getAttribute('type') || (field.tagName === 'INPUT' ? 'text' : field.tagName === 'BUTTON' ? 'submit' : field.tagName.toLowerCase()), 50), name: clean(field.getAttribute('name'), 100), required: field.hasAttribute('required'), autocomplete: clean(field.getAttribute('autocomplete'), 100), label: clean((field as HTMLInputElement).labels?.[0]?.textContent ?? field.getAttribute('aria-label'), 200) })) };
  });
  return { headings, images, links, resources: resources.slice(0, ELEMENT_LIMIT), forms, truncated,
    language: clean(doc.documentElement.lang, 40), robots: clean(doc.querySelector('meta[name="robots" i]')?.getAttribute('content'), 500) };
}
