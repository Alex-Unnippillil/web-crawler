/** Typed, optional inspection records. Version 3/4 histories remain readable. */
export type CrawlMode = 'http' | 'smart' | 'browser';
export interface ExtractionRule {
  name: string;
  selector: string;
  mode: 'text' | 'attribute' | 'html';
  attribute?: string;
}
export interface StructuredItem {
  format: 'json-ld' | 'microdata' | 'rdfa';
  types: string[];
  valid: boolean;
  value?: unknown;
  error?: string;
  context?: string;
}
export interface PageInspection {
  word_count: number;
  text_sample: string;
  metadata: Record<string, string[]>;
  hreflang: { language: string; url: string }[];
  structured_data: StructuredItem[];
  technologies: { name: string; confidence: 'high' | 'medium'; evidence: string }[];
  custom: Record<string, string[]>;
  extraction_errors: string[];
  render_signals: string[];
  truncated: boolean;
}
export interface HttpInspection {
  status_text: string;
  mime_type: string;
  charset: string;
  headers: Record<string, string>;
  redirects: { url: string; status: number; to: string }[];
  attempts: number;
  ttfb_ms: number;
}
export interface JavascriptComparison {
  raw_words: number;
  rendered_words: number;
  word_delta: number;
  added_text_percent: number;
  raw_links: number;
  rendered_links: number;
  added_links: string[];
  removed_links: string[];
  added_images: string[];
  removed_images: string[];
  metadata_changes: { field: string; raw: string; rendered: string }[];
  raw_structured: number;
  rendered_structured: number;
}
export interface NetworkEntry {
  url: string;
  final_url: string;
  method: string;
  type: string;
  status: number | null;
  content_type: string;
  start_ms: number;
  duration_ms: number;
  body_bytes: number;
  error?: string;
  redirects: { url: string; status: number; to: string }[];
  cached?: boolean;
  attempts?: number;
}
export interface BrowserEvidence {
  final_url?: string;
  image_dimensions?: { url: string; width: number; height: number }[];
  raw_html: string;
  rendered_html: string;
  screenshot?: string; // Bounded JPEG encoded as base64, never remote HTML in the Studio DOM.
  network: NetworkEntry[];
  console: { level: string; text: string }[];
  contexts: { kind: 'frame' | 'shadow'; url: string; html: string }[];
  settled: 'stable' | 'timeout';
  duration_ms: number;
  truncated: boolean;
  notes: string[];
}
export interface RenderingInfo {
  source_url?: string;
  final_url?: string;
  method: 'http' | 'browser';
  status: 'not-needed' | 'rendered' | 'unavailable' | 'failed';
  reasons: string[];
  failure?: string;
  duration_ms?: number;
  settled?: 'stable' | 'timeout';
  artifact_id?: string;
  comparison?: JavascriptComparison;
  network?: NetworkEntry[];
  console?: { level: string; text: string }[];
  network_count?: number;
  network_errors?: number;
  console_errors?: number;
  body_bytes?: number;
  notes?: string[];
}
export interface FrontierEntry {
  url: string;
  depth: number;
  source_url: string;
  method: 'seed' | 'link' | 'sitemap';
  discovered_at: string;
  state: 'queued' | 'processing' | 'completed' | 'failed';
}
export interface SitemapEntry {
  url: string;
  sitemap: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}
export interface SitemapFile {
  url: string;
  status: number | null;
  kind: 'index' | 'urlset' | 'unknown';
  urls: number;
  error?: string;
}
export interface DiscoveryInfo {
  robots: { url: string; status: number | null; user_agent: string; text: string; sitemaps: string[]; skipped: string[]; error?: string };
  sitemaps: SitemapFile[];
  sitemap_urls: SitemapEntry[];
  frontier: FrontierEntry[];
  truncated: boolean;
}
export interface CrawlTelemetry {
  http_active: number;
  browser_active: number;
  browser_queued: number;
  http_pages: number;
  browser_pages: number;
  browser_requests: number;
  body_bytes: number;
  process_rss_mb: number;
  effective_workers: number;
  throttle_reason: string;
}
