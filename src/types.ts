// Shared TypeScript contracts for crawl results, failures, progress events, and configuration.

/** The five original Boot.dev fields remain present in every successful record. */
export interface ExtractedPageData {
  url: string;
  heading: string;
  first_paragraph: string;
  outgoing_links: string[];
  image_urls: string[];
}
export interface PageDetails extends ExtractedPageData {
  title?: string;
  description?: string;
  canonical_url?: string;
}
export interface CrawledPage extends PageDetails {
  requested_url: string;
  status_code: number;
  depth: number;
  duration_ms: number;
  content_bytes: number;
  internal_links: string[];
  external_links: string[];
}
export interface CrawlFailure {
  url: string;
  kind: string;
  message: string;
  attempts: number;
  status_code?: number;
}
export interface CrawlOptions {
  maxConcurrency: number;
  maxPages: number;
  maxDepth: number;
  timeoutMs: number;
  retries: number;
  delayMs: number;
  maxRetryDelayMs: number;
  maxBodyBytes: number;
  maxDurationMs: number;
  maxQueryVariants: number;
  maxLinksPerPage: number;
  pathPrefix: string;
  stripTracking: boolean;
  respectRobots: boolean;
  userAgent: string;
}
export interface CrawlHooks {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  extract?: (html: string, url: string) => PageDetails;
  onLog?: (message: string) => void;
  /** Observes a mutable snapshot synchronously; callers must not modify it. */
  onProgress?: (result: CrawlResult) => void;
  /** Called before each request; used by the local GUI to pause new traffic. */
  beforeRequest?: (signal: AbortSignal) => Promise<void>;
}
export interface CrawlResult {
  schema_version: 1;
  start_url: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  options: CrawlOptions;
  pages: Record<string, CrawledPage>;
  errors: CrawlFailure[];
  warnings: string[];
  skipped: Record<string, number>;
  summary: {
    pages_crawled: number;
    urls_scheduled: number;
    requests: number;
    retries: number;
    failed: number;
    unique_internal_links: number;
    unique_external_links: number;
    unique_images: number;
    limit_reached: boolean;
    stopped: boolean;
  };
}
