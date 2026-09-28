/** Evidence-only analysis. No requests, side effects, synthetic scores, or modified crawl records. */
import type { CrawlResult, CrawledPage } from '../src/types.js';
export type Severity = 'error' | 'review' | 'info';
export type Category = 'Content' | 'Accessibility' | 'Links' | 'Indexability' | 'Capture';
export interface Finding { severity: Severity; category: Category; title: string; detail: string; url: string; related_url: string }
export interface Coverage { label: string; present: number; eligible: number; unit: string; percent: number | null }
export interface Bucket { label: string; count: number }
export interface DepthBucket { label: string; clear: number; review: number }
export interface PageMetric { url: string; title: string; duration: number | null; words: number | null; incoming: number; findings: number }
export interface ObservatoryModel {
  pages: number; findings: Finding[]; coverage: Coverage[]; outcomes: Bucket[]; depths: DepthBucket[];
  timings: Bucket[]; median: number | null; p95: number | null; measured: number;
  inspected: number; partial: number; fingerprinted: number; duplicateGroups: number; affected: number; metrics: PageMetric[];
}
export const categories: Category[] = ['Content', 'Accessibility', 'Links', 'Indexability', 'Capture'];
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const key = (url: string): string => { try { const value = new URL(url); value.hash = ''; return value.href; } catch { return url; } };
export function percentile(values: readonly number[], fraction: number): number | null {
  if (!Number.isFinite(fraction)) return null;
  const sorted = values.filter(v => number(v) !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(Math.max(0, Math.min(1, fraction)) * sorted.length) - 1))]!;
}
export function analyzeCrawl(result?: CrawlResult): ObservatoryModel {
  const pages = Object.values(result?.pages ?? {});
  const findings: Finding[] = [];
  const add = (p: CrawledPage, severity: Severity, category: Category, title: string, detail: string, related_url = '') => findings.push({ severity, category, title, detail, url: p.url, related_url });
  const titles = new Map<string, CrawledPage[]>(), hashes = new Map<string, CrawledPage[]>();
  const incoming = new Map<string, number>(), captured = new Set<string>();
  const aliases = new Map<string, string>();
  for (const p of pages) { const final = key(p.url); captured.add(final); aliases.set(final, final); if (p.requested_url) { const requested = key(p.requested_url); captured.add(requested); aliases.set(requested, final); } }
  const failed = new Map<string, number>();
  for (const e of result?.errors ?? []) if ((!e.stage || e.stage === 'page') && (e.status_code ?? 0) >= 400 && (e.status_code ?? 0) <= 599 && !captured.has(key(e.url))) failed.set(key(e.url), e.status_code!);
  const coverage: Coverage[] = ['Title', 'Description', 'Main heading', 'Language', 'Image alt', 'Control names'].map(label => ({ label, present: 0, eligible: 0, percent: null, unit: label === 'Image alt' ? 'images' : label === 'Control names' ? 'controls' : 'pages' }));
  const count = (axis: number, present: number, eligible: number) => { coverage[axis]!.present += present; coverage[axis]!.eligible += eligible; };
  let inspected = 0, partial = 0, fingerprinted = 0;
  for (const p of pages) {
    if (p.title !== undefined) { count(0, p.title.trim() ? 1 : 0, 1); if (!p.title.trim()) add(p, 'review', 'Content', 'Missing title', 'No nonempty HTML title was captured.'); }
    if (p.description !== undefined) { count(1, p.description.trim() ? 1 : 0, 1); if (!p.description.trim()) add(p, 'review', 'Content', 'Missing description', 'No nonempty meta description was captured.'); }
    if (p.title?.trim()) { const title = p.title.trim(); const group = titles.get(title) ?? []; group.push(p); titles.set(title, group); }
    const hash = p.inspection?.content_fingerprint;
    if (hash && /^sha256-text-v1:[a-f0-9]{64}$/.test(hash)) { fingerprinted++; const group = hashes.get(hash) ?? []; group.push(p); hashes.set(hash, group); }
    const a = p.inspection?.accessibility;
    if (a) {
      inspected++; if (a.truncated) { partial++; add(p, 'info', 'Capture', 'Accessibility sample capped', 'Static checks stopped after 5,000 elements. This page is excluded from element coverage percentages.'); }
      if (!a.language) add(p, 'review', 'Accessibility', 'Missing document language', 'The document has no nonempty lang attribute. This check does not validate language tags.');
      count(3, a.language ? 1 : 0, 1);
      if (!a.truncated) {
        count(2, a.h1_count > 0 ? 1 : 0, 1);
        count(4, a.images - a.images_missing_alt, a.images);
        count(5, a.controls - a.controls_without_name, a.controls);
        if (!a.h1_count) add(p, 'review', 'Accessibility', 'No main heading', 'No visible-in-markup H1 was found. Confirm the intended heading structure manually.');
      }
      if (a.h1_count > 1) add(p, 'info', 'Accessibility', 'Multiple main headings', `${a.h1_count} H1 elements were observed. Multiple H1s are not automatically an accessibility failure.`);
      const checks = [[a.images_missing_alt, 'Images missing alt', 'images lack an alt attribute; empty alt is accepted for decorative images.'], [a.controls_without_name, 'Controls needing names', 'form controls lack a name recognized by these static heuristics.'], [a.links_without_name, 'Links needing names', 'links lack a name recognized by these static heuristics.'], [a.buttons_without_name, 'Buttons needing names', 'buttons lack a name recognized by these static heuristics.']] as const;
      for (const [total, title, detail] of checks) if (total > 0) add(p, 'review', 'Accessibility', title, `${total} ${detail}${a.truncated ? ' Partial sample.' : ''}`);
    }
    if (/\bnoindex\b/i.test(`${p.elements?.robots ?? ''} ${p.http?.headers['x-robots-tag'] ?? ''}`)) add(p, 'info', 'Indexability', 'Noindex declared', 'Captured robots directives include noindex. This may be intentional; it is not an error.');
    if (p.canonical_url && key(p.canonical_url) !== key(p.url)) add(p, 'info', 'Indexability', 'Canonical points elsewhere', 'Review the captured canonical destination; a different canonical can be intentional.', p.canonical_url);
    if (p.rendering?.failure) add(p, 'review', 'Capture', 'Rendering incomplete', p.rendering.failure);
    let failures = 0; const targets: string[] = [];
    for (const url of new Set((p.internal_links ?? []).map(url => aliases.get(key(url)) ?? key(url)))) {
      incoming.set(url, (incoming.get(url) ?? 0) + 1);
      const status = failed.get(url);
      if (status) { failures++; if (targets.length < 5) targets.push(`HTTP ${status}: ${url}`); }
    }
    if (failures) add(p, 'error', 'Links', 'Failed internal destinations', `${failures} distinct internal destinations returned captured HTTP errors. ${targets.join(' · ')}${failures > 5 ? ' · More destinations are available in Issues.' : ''} Unvisited URLs are not classified as broken.`);
  }
  let duplicateGroups = 0;
  for (const group of titles.values()) if (group.length > 1) for (const p of group) add(p, 'review', 'Content', 'Repeated title', `${group.length} captured pages share this case-sensitive, trimmed title.`, (group[0] === p ? group[1] : group[0])?.url ?? '');
  for (const group of hashes.values()) if (group.length > 1) {
    duplicateGroups++;
    for (const p of group) add(p, 'review', 'Content', 'Matching body text', `${group.length} pages share the same complete whitespace-normalized body-text fingerprint. This is not a visual, semantic, or byte-for-byte HTML comparison.`, (group[0] === p ? group[1] : group[0])?.url ?? '');
  }
  for (const c of coverage) c.percent = c.eligible ? Math.round(c.present / c.eligible * 100) : null;
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.url, (counts.get(f.url) ?? 0) + 1);
  const metrics = pages.map(p => ({ url: p.url, title: p.title ?? '', duration: number(p.duration_ms), words: number(p.inspection?.word_count), incoming: incoming.get(key(p.url)) ?? 0, findings: counts.get(p.url) ?? 0 }));
  const elapsed = metrics.flatMap(p => p.duration === null ? [] : [p.duration]);
  const timings: Bucket[] = ['Under 250 ms', '250–999 ms', '1–2.99 s', '3 s or more', 'Unknown'].map(label => ({ label, count: 0 }));
  for (const p of metrics) timings[p.duration === null ? 4 : p.duration < 250 ? 0 : p.duration < 1000 ? 1 : p.duration < 3000 ? 2 : 3]!.count++;
  const outcomes: Bucket[] = ['2xx', '3xx', '4xx', '5xx', 'No HTTP status', 'Other status'].map(label => ({ label, count: 0 }));
  const responses = new Map<string, number | undefined>();
  for (const e of result?.errors ?? []) if ((!e.stage || e.stage === 'page') && !captured.has(key(e.url))) responses.set(key(e.url), e.status_code);
  for (const p of pages) responses.set(key(p.url), p.status_code);
  for (const status of responses.values()) outcomes[status && status >= 200 && status < 600 ? Math.floor(status / 100) - 2 : !status ? 4 : 5]!.count++;
  const depthMap = new Map<number, DepthBucket>();
  for (const p of pages) { const depth = number(p.depth) ?? -1; const d = depthMap.get(depth) ?? { label: depth < 0 ? 'Unknown' : `Depth ${depth}`, clear: 0, review: 0 }; if (counts.has(p.url)) d.review++; else d.clear++; depthMap.set(depth, d); }
  return { pages: pages.length, findings, coverage, outcomes, depths: [...depthMap].sort(([a], [b]) => a - b).map(([, value]) => value), timings,
    median: percentile(elapsed, .5), p95: percentile(elapsed, .95), measured: elapsed.length, inspected, partial, fingerprinted, duplicateGroups, affected: counts.size, metrics };
}
export interface FindingFilter { query?: string; category?: string; severity?: string; order?: string }
export function filterFindings(findings: readonly Finding[], filter: FindingFilter): Finding[] {
  const q = (filter.query ?? '').trim().toLowerCase();
  const rank: Record<Severity, number> = { error: 0, review: 1, info: 2 };
  return findings.filter(f => (!filter.category || filter.category === 'all' || filter.category === f.category) && (!filter.severity || filter.severity === 'all' || filter.severity === f.severity) && (!q || [f.url, f.title, f.detail, f.related_url].some(text => text.toLowerCase().includes(q))))
    .sort((a, b) => (filter.order === 'url' ? a.url.localeCompare(b.url) : rank[a.severity] - rank[b.severity]) || a.category.localeCompare(b.category) || a.url.localeCompare(b.url) || a.title.localeCompare(b.title));
}
export function rankPages(metrics: readonly PageMetric[], sort: string): PageMetric[] {
  return [...metrics].sort((a, b) => {
    const av = sort === 'duration' ? a.duration : sort === 'incoming' ? a.incoming : a.findings;
    const bv = sort === 'duration' ? b.duration : sort === 'incoming' ? b.incoming : b.findings;
    return (av === null ? bv === null ? 0 : 1 : bv === null ? -1 : bv - av) || a.url.localeCompare(b.url);
  });
}
