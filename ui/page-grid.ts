/** Page inventory presentation and selection. No DOM data is trusted as markup.
 * Selection is scoped to a crawl, remains explicit when filtered out, and is never persisted.
 */
import type { CrawledPage } from '../src/types.js';
import { esc } from './atlas-shared.js';

export const pageColumns = ['status', 'method', 'words', 'depth', 'internal', 'external', 'duration'] as const;
export type PageColumn = typeof pageColumns[number];
export const columnLabels: Record<PageColumn, string> = {
  status: 'Status', method: 'Method', words: 'Words', depth: 'Depth',
  internal: 'Internal links', external: 'External links', duration: 'Response time',
};
export type PageSort = 'url' | 'title' | PageColumn;
export function sortPages(pages: CrawledPage[], key: PageSort, descending = false): CrawledPage[] {
  const value = (p: CrawledPage): string | number | undefined => {
    switch (key) {
      case 'url': return p.url;
      case 'title': return p.title || p.heading || '';
      case 'status': return p.status_code;
      case 'method': return p.rendering?.method ?? 'http';
      case 'words': return p.inspection?.word_count;
      case 'depth': return p.depth;
      case 'internal': return p.internal_links.length;
      case 'external': return p.external_links.length;
      case 'duration': return p.duration_ms;
    }
  };
  return [...pages].sort((a, b) => {
    const av = value(a), bv = value(b);
    // Unknown measurements sort last in either direction, rather than becoming fake zeroes.
    if (av === undefined || bv === undefined) return av === bv ? a.url.localeCompare(b.url) : av === undefined ? 1 : -1;
    const order = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return (descending ? -order : order) || a.url.localeCompare(b.url);
  });
}
export class PageSelection {
  private crawl = '';
  readonly urls = new Set<string>();
  use(crawl: string, available: CrawledPage[]): void {
    if (crawl !== this.crawl) { this.urls.clear(); this.crawl = crawl; }
    const present = new Set(available.map(p => p.url));
    for (const url of this.urls) if (!present.has(url)) this.urls.delete(url);
  }
  toggle(url: string, checked: boolean): void { if (checked) this.urls.add(url); else this.urls.delete(url); }
  setPage(pages: CrawledPage[], checked: boolean): void { for (const p of pages) this.toggle(p.url, checked); }
  clear(): void { this.urls.clear(); }
  exportRows(all: CrawledPage[], filtered: CrawledPage[]): CrawledPage[] {
    return this.urls.size ? all.filter(p => this.urls.has(p.url)) : filtered;
  }
}
export function visibleColumns(raw: unknown): PageColumn[] {
  return Array.isArray(raw) ? pageColumns.filter(c => raw.includes(c)) : [...pageColumns];
}
export interface GridOptions {
  pages: CrawledPage[]; selected: Set<string>; columns: PageColumn[];
  sort: PageSort; descending: boolean; review: Set<string>;
}
export function pageGrid({ pages, selected, columns, sort, descending, review }: GridOptions): string {
  const header = (key: PageSort, label: string) => `<th scope="col"${sort === key ? ` aria-sort="${descending ? 'descending' : 'ascending'}"` : ''}><button type="button" data-page-sort="${key}">${label}<span aria-hidden="true">${sort === key ? descending ? '↓' : '↑' : '↕'}</span></button></th>`;
  const cell = (p: CrawledPage, c: PageColumn): string => {
    switch (c) {
      case 'status': return `<span class="http-status">${p.status_code}</span>`;
      case 'method': return `<span class="method-${p.rendering?.method ?? 'http'}" title="${esc(p.rendering?.failure || p.rendering?.reasons.join('; ') || 'Source HTML')}">${p.rendering?.method === 'browser' ? 'BROWSER' : 'HTTP'}${p.rendering?.failure ? ' !' : ''}</span>`;
      case 'words': return p.inspection?.word_count?.toLocaleString() ?? '—';
      case 'depth': return p.discovery?.method === 'sitemap' ? '<span title="Discovered in a sitemap">seed</span>' : String(p.depth);
      case 'internal': return p.internal_links.length.toLocaleString();
      case 'external': return p.external_links.length.toLocaleString();
      case 'duration': return `<span class="duration">${p.duration_ms.toLocaleString()} ms</span>`;
    }
  };
  return `<div class="table-scroll page-grid-scroll" tabindex="0" role="region" aria-label="Page inventory"><table class="page-grid"><caption class="sr-only">Crawled HTML pages. Activate column headings to sort. Use checkboxes to choose pages for export.</caption><thead><tr><th scope="col" class="selection-cell"><input type="checkbox" id="select-visible" aria-label="Select this page of results" ${pages.every(p => selected.has(p.url)) ? 'checked' : ''}></th>${header('url', 'Page / URL')}${columns.map(c => header(c, columnLabels[c])).join('')}<th scope="col"><span class="sr-only">Inspect page</span></th></tr></thead><tbody>${pages.map(p => `<tr class="${selected.has(p.url) ? 'row-selected' : ''}"><td class="selection-cell"><input type="checkbox" data-select-url="${esc(p.url)}" aria-label="Select ${esc(p.title || p.url)}" ${selected.has(p.url) ? 'checked' : ''}></td><td><div class="page-cell"><span class="page-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 3H6v18h12V7zM14 3v5h4M9 12h6m-6 4h6"/></svg></span><button class="page-link" data-page="${esc(p.url)}" title="Inspect ${esc(p.url)}"><strong>${esc(p.title || p.heading || 'Untitled page')}${review.has(p.url) ? '<span class="tiny-dot" title="Needs review"></span>' : ''}</strong><small>${esc(new URL(p.url).pathname + new URL(p.url).search)}</small></button></div></td>${columns.map(c => `<td>${cell(p,c)}</td>`).join('')}<td><button class="icon-button row-inspect" data-page="${esc(p.url)}" aria-label="Inspect ${esc(p.title || p.url)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button></td></tr>`).join('')}</tbody></table></div>`;
}
