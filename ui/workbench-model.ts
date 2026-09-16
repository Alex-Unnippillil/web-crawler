/** Presentation-neutral inspection indexes. A missing measurement stays unknown rather
 * than being reported as success, a broken image, or a whole-site orphan verdict.
 */
import type { Job } from '../src/studio/jobs.js';
import type { CrawledPage } from '../src/types.js';
export type WorkbenchTab = 'links' | 'javascript' | 'resources' | 'structured' | 'sitemaps' | 'robots' | 'custom';
export type DataRow = Record<string, unknown> & { _id: string; _page?: string; _detail?: unknown };
export interface Dataset { title: string; note: string; columns: string[]; rows: DataRow[]; filters: string[] }
export const workbenchTabs: WorkbenchTab[] = ['links', 'javascript', 'resources', 'structured', 'sitemaps', 'robots', 'custom'];
export function datasets(job?: Job): Record<WorkbenchTab, Dataset> {
  const pages = Object.values(job?.result?.pages ?? {});
  const lookup = new Map<string, CrawledPage>();
  const failures = new Map((job?.result?.errors ?? []).map(e => [e.url, e]));
  for (const p of pages) { lookup.set(p.url, p); lookup.set(p.requested_url, p); }
  const rows: Record<WorkbenchTab, DataRow[]> = { links: [], javascript: [], resources: [], structured: [], sitemaps: [], robots: [], custom: [] };
  const inlinks = new Set<string>();
  const push = (kind: WorkbenchTab, row: Omit<DataRow, '_id'>) => { if (rows[kind].length < 100000) rows[kind].push({ ...row, _id: `${kind}-${rows[kind].length}` }); };
  for (const p of pages) {
    const links = p.elements?.links ?? p.outgoing_links.map(url => ({ url, text: '', rel: '', target: '', discovery: 'raw', context: 'document' }));
    for (const link of links) {
      const internal = new URL(link.url).origin === new URL(p.url).origin;
      if (internal) inlinks.add(link.url);
      const dest = lookup.get(link.url); const err = failures.get(link.url);
      const status = dest ? (dest.requested_url === link.url && dest.requested_url !== dest.url ? 'Redirect' : String(dest.status_code)) : err ? String(err.status_code ?? err.kind) : 'Not crawled';
      push('links', { Source: p.url, Destination: link.url, Anchor: link.text, Type: internal ? 'Internal' : 'External', Status: status,
        Follow: /\bnofollow\b/i.test(link.rel) ? 'nofollow' : 'follow', Rel: link.rel, Discovery: link.discovery ?? 'raw', Context: link.context ?? 'document',
        _page: p.url, _detail: { source: p.url, destination: link.url, destination_status: status, element: link } });
    }
    const render = p.rendering; const diff = render?.comparison;
    push('javascript', { URL: p.url, Method: render?.method.toUpperCase() ?? 'HTTP', State: render?.status ?? 'Legacy HTTP',
      'Raw words': diff?.raw_words ?? p.inspection?.word_count ?? '', 'Rendered words': diff?.rendered_words ?? '',
      'Word change': diff?.word_delta ?? '', 'Added text estimate %': diff?.added_text_percent ?? '', 'JS links': diff?.added_links.length ?? 0,
      'Metadata changes': diff?.metadata_changes.length ?? 0, 'Console entries': render?.console_errors ?? 0,
      'Resource errors': render?.network_errors ?? 0, 'Settle state': render?.settled ?? '', Reason: render?.failure ?? render?.reasons.join('; ') ?? 'Saved before rendering analysis',
      _page: p.url, _detail: render ?? {} });
    const observed = render?.network ?? [];
    const seen = new Set<string>();
    for (const resource of observed) {
      seen.add(resource.url);
      push('resources', { URL: resource.url, Type: resource.type, Status: resource.error ? 'Failed/blocked' : resource.status ?? 'Unknown',
        Host: new URL(resource.url).hostname, 'Body bytes': resource.body_bytes, 'Duration ms': resource.duration_ms,
        'Source page': p.url, Evidence: resource.cached ? 'Raw response reused' : 'Browser request', Detail: resource.error ?? resource.content_type,
        _page: p.url, _detail: resource });
    }
    for (const r of p.elements?.resources ?? []) if (!seen.has(r.url)) {
      seen.add(r.url); push('resources', { URL: r.url, Type: r.kind, Status: 'Not fetched', Host: new URL(r.url).hostname,
        'Body bytes': '', 'Duration ms': '', 'Source page': p.url, Evidence: 'Declared in DOM', Detail: r.type, _page: p.url });
    }
    for (const image of p.elements?.images ?? []) for (const url of image.candidates) if (!seen.has(url)) {
      seen.add(url); push('resources', { URL: url, Type: 'image', Status: 'Not fetched', Host: new URL(url).hostname, 'Body bytes': '', 'Duration ms': '',
        'Source page': p.url, Evidence: 'Image candidate', Detail: image.alt === null ? 'Missing alt attribute' : image.alt, _page: p.url });
    }
    for (const item of p.inspection?.structured_data ?? []) push('structured', { Type: item.types.join(', ') || 'Unspecified', Format: item.format,
      Parsing: item.valid ? 'Parsed' : 'Invalid', 'Source page': p.url, Context: item.context ?? 'document', Error: item.error ?? '',
      Object: JSON.stringify(item.value ?? {}), _page: p.url, _detail: item });
    if (p.inspection && Object.keys(p.inspection.custom).length) push('custom', { URL: p.url, Method: render?.method ?? 'http', ...Object.fromEntries(Object.entries(p.inspection.custom).map(([name, values]) => [`Field: ${name}`, values.join(' | ')])), Errors: p.inspection.extraction_errors.join('; '), _page: p.url, _detail: p.inspection.custom });
  }
  for (const item of job?.result?.discovery?.sitemap_urls ?? []) {
    const p = lookup.get(item.url); const err = failures.get(item.url);
    push('sitemaps', { URL: item.url, Sitemap: item.sitemap, Status: p ? p.requested_url !== p.url ? 'Redirected' : 'Crawled' : err ? `Error ${err.status_code ?? err.kind}` : 'Not crawled',
      'Internal discovery': inlinks.has(item.url) ? 'Linked internally' : item.url === job?.url ? 'Start URL' : 'No captured inlink',
      Indexability: p ? /\bnoindex\b/i.test(`${p.elements?.robots ?? ''} ${p.http?.headers['x-robots-tag'] ?? ''}`) ? 'noindex declared' : 'No noindex observed' : 'Unknown',
      Lastmod: item.lastmod, Changefreq: item.changefreq, Priority: item.priority, _page: p?.url ?? item.url, _detail: item });
  }
  const sitemapURLs = new Set((job?.result?.discovery?.sitemap_urls ?? []).map(s => s.url));
  if (job?.options.discoverSitemaps) for (const p of pages) if (!sitemapURLs.has(p.url) && !sitemapURLs.has(p.requested_url)) push('sitemaps', { URL: p.url, Sitemap: '', Status: 'Absent from discovered sitemaps', 'Internal discovery': inlinks.has(p.url) ? 'Linked internally' : 'Start/redirect URL', Indexability: /noindex/i.test(p.elements?.robots ?? '') ? 'noindex declared' : 'No noindex observed', Lastmod: '', Changefreq: '', Priority: '', _page: p.url });
  for (const url of job?.result?.discovery?.robots.skipped ?? []) push('robots', { URL: url, Reason: 'Disallowed by applicable robots policy', _page: url });
  const result: Record<WorkbenchTab, Dataset> = {
    links: { title: 'Link explorer', note: 'Captured hyperlinks with source, destination, anchor and follow state. External destinations are not availability-checked.', columns: ['Source', 'Destination', 'Anchor', 'Type', 'Status', 'Follow', 'Discovery', 'Context', 'Rel'], rows: rows.links, filters: ['Type', 'Status', 'Follow', 'Discovery'] },
    javascript: { title: 'JavaScript analysis', note: 'HTTP first; Chromium only when required. Added text is a positive net word-count estimate, not a semantic attribution. Select a page for source, screenshots and network evidence.', columns: ['URL', 'Method', 'State', 'Raw words', 'Rendered words', 'Word change', 'Added text estimate %', 'JS links', 'Metadata changes', 'Console entries', 'Resource errors', 'Settle state', 'Reason'], rows: rows.javascript, filters: ['Method', 'State', 'Settle state'] },
    resources: { title: 'Resources & network', note: 'DOM references and observed browser requests are distinct. Body bytes are decoded response bytes, not wire transfer size. Up to 100 request rows per page are indexed; complete bounded evidence is in the inspector.', columns: ['URL', 'Type', 'Status', 'Host', 'Body bytes', 'Duration ms', 'Source page', 'Evidence', 'Detail'], rows: rows.resources, filters: ['Type', 'Status', 'Host', 'Evidence'] },
    structured: { title: 'Structured data', note: 'JSON-LD is parsed; Microdata/RDFa are bounded attribute inventories, not full semantic or rich-result validation. Expand an object to inspect the captured evidence.', columns: ['Type', 'Format', 'Parsing', 'Source page', 'Context', 'Error', 'Object'], rows: rows.structured, filters: ['Format', 'Parsing', 'Type'] },
    sitemaps: { title: 'Sitemap comparison', note: 'Comparison uses only discovered sitemaps and this bounded crawl. No captured inlink does not prove an orphan. Sitemap-seeded URLs do not establish hyperlink depth.', columns: ['URL', 'Status', 'Internal discovery', 'Indexability', 'Sitemap', 'Lastmod', 'Changefreq', 'Priority'], rows: rows.sitemaps, filters: ['Status', 'Internal discovery', 'Indexability'] },
    robots: { title: 'Robots inspector', note: 'The fetched policy, selected user agent, sitemap directives and excluded URL encounters. Excluded URLs are not generic network failures.', columns: ['URL', 'Reason'], rows: rows.robots, filters: ['Reason'] },
    custom: { title: 'Custom extraction', note: 'Bounded CSS-selector extraction, using the rendered DOM when Chromium succeeds. Rules never execute code or submit forms. Values are capped at 30 matches × 2,000 characters per rule.', columns: ['URL', 'Method', ...[...new Set(rows.custom.flatMap(r => Object.keys(r).filter(k => k.startsWith('Field: '))))], 'Errors'], rows: rows.custom, filters: ['Method'] },
  };
  return result;
}
export function filteredRows(data: Dataset, query: string, filters: Record<string, string>, sort: string, descending: boolean): DataRow[] {
  const q = query.toLowerCase().trim();
  const rows = data.rows.filter(row => (!q || data.columns.some(c => String(row[c] ?? '').toLowerCase().includes(q))) && Object.entries(filters).every(([key, value]) => !value || String(row[key]) === value));
  if (sort) rows.sort((a, b) => (typeof a[sort] === 'number' && typeof b[sort] === 'number' ? (a[sort] as number) - (b[sort] as number) : String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), undefined, { numeric: true })) * (descending ? -1 : 1));
  return rows;
}
