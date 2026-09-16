import type { CrawlMode, ExtractionRule, PageInspection, HttpInspection, RenderingInfo, BrowserEvidence, DiscoveryInfo, CrawlTelemetry } from "./inspection-types.js";
// Repository note: Defines shared TypeScript contracts for pages, failures, options, progress, and results.
// Shared TypeScript contracts for crawl results, failures, progress events, and configuration.

/** The five original Boot.dev fields remain present in every successful record. */
export interface ExtractedPageData {
  url: string;
  heading: string;
  first_paragraph: string;
  outgoing_links: string[];
  image_urls: string[];
}
/** Optional additions keep v3 history and the five original course fields readable. */
export interface ImageElement {
  src: string; candidates: string[]; alt: string | null;
  width: number | null; height: number | null; loading: string;
  title?: string; srcset?: string; context?: string; rendered_width?: number; rendered_height?: number;
}
export interface ResourceElement {
  kind: 'script' | 'stylesheet' | 'video' | 'audio' | 'frame' | 'document' | 'poster' | 'other';
  url: string; type: string; context?: string;
}
export interface PageElements {
  headings: { level: number; text: string; id: string }[];
  images: ImageElement[];
  links: { url: string; text: string; rel: string; target: string; title?: string; context?: string; discovery?: 'raw' | 'rendered' }[];
  resources: ResourceElement[];
  forms: { action: string; method: string; enctype?: string; fields: { tag: string; type: string; name: string; label?: string; required?: boolean; autocomplete?: string }[] }[];
  truncated: boolean; language: string; robots: string;
}
export interface PageDetails extends ExtractedPageData {
  elements?: PageElements;
  inspection?: PageInspection;
  title?: string;
  description?: string;
  canonical_url?: string;
}
export interface CrawledPage extends PageDetails {
  requested_url: string;
  http?: HttpInspection;
  rendering?: RenderingInfo;
  discovery?: { method: 'seed' | 'link' | 'sitemap'; source_url: string };
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
  mode: CrawlMode;
  browserConcurrency: number;
  renderTimeoutMs: number;
  scrollIterations: number;
  captureScreenshots: boolean;
  discoverSitemaps: boolean;
  sitemapURLs: string[];
  extractionRules: ExtractionRule[];
  adaptiveConcurrency: boolean;
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
  /** Large source snapshots live outside the hot crawl JSON when this hook is supplied. */
  onEvidence?: (url: string, evidence: BrowserEvidence) => Promise<string | undefined>;
  onPage?: (page: CrawledPage) => void;
  /** Code-level injection for local fixtures only; never accepted from a GUI request. */
  browserFactory?: import('./crawler/browser.js').BrowserFactory;
  onLog?: (message: string) => void;
  /** Observes a mutable snapshot synchronously; callers must not modify it. */
  onProgress?: (result: CrawlResult) => void;
  /** Called before each request; used by the local GUI to pause new traffic. */
  beforeRequest?: (signal: AbortSignal) => Promise<void>;
}
export interface CrawlResult {
  schema_version: 1;
  discovery?: DiscoveryInfo;
  telemetry?: CrawlTelemetry;
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
