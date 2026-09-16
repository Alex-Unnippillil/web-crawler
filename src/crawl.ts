// Provides the compatibility wrapper that exposes the crawler through the original Boot.dev API.

import { runCrawl } from './engine.js';
import type { CrawlHooks, CrawlOptions, CrawlResult, ExtractedPageData } from './types.js';
export { normalizeURL } from './url.js';
export { getHeadingFromHTML, getFirstParagraphFromHTML, getURLsFromHTML, getImagesFromHTML, extractPageData } from './extract.js';
export type { ExtractedPageData } from './types.js';
export { runCrawl } from './engine.js';
/** Compatibility facade for the original constructor and crawlSiteAsync signature. */
export class ConcurrentCrawler {
  pages: Record<string, ExtractedPageData> = {};
  result?: CrawlResult;
  private pending?: Promise<Record<string, ExtractedPageData>>;
  constructor(public baseURL: string, public maxConcurrency: number, public maxPages: number,
    private options: Partial<CrawlOptions> = {}, private hooks: CrawlHooks = {}) {}
  crawl(): Promise<Record<string, ExtractedPageData>> {
    return this.pending ??= runCrawl(this.baseURL, { ...this.options, maxConcurrency: this.maxConcurrency, maxPages: this.maxPages }, this.hooks)
      .then(result => { this.result = result; this.pages = result.pages; return this.pages; });
  }
}
export async function crawlSiteAsync(baseURL: string, maxConcurrency: number, maxPages: number): Promise<Record<string, ExtractedPageData>> {
  return new ConcurrentCrawler(baseURL, maxConcurrency, maxPages).crawl();
}
