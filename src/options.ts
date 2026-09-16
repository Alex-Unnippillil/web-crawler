// Repository note: Defines and validates crawler defaults and runtime option limits.
// Defines crawler defaults and validates option ranges before network work begins.

import type { CrawlOptions } from './types.js';
export const DEFAULT_OPTIONS: Readonly<CrawlOptions> = Object.freeze({
  mode: 'http', browserConcurrency: 2, renderTimeoutMs: 15000, scrollIterations: 0,
  captureScreenshots: true, discoverSitemaps: false, sitemapURLs: [], extractionRules: [], adaptiveConcurrency: false,
  maxConcurrency: 3, maxPages: 50, maxDepth: 10, timeoutMs: 15000, retries: 2,
  delayMs: 200, maxRetryDelayMs: 30000, maxBodyBytes: 2 * 1024 * 1024,
  maxDurationMs: 600000, maxQueryVariants: 10, maxLinksPerPage: 2000,
  pathPrefix: '', stripTracking: false, respectRobots: true, userAgent: 'BootCrawler/2.0',
});
export function validateOptions(input: Partial<CrawlOptions>): CrawlOptions {
  const o = { ...DEFAULT_OPTIONS, ...input };
  const ranges: Record<string, [number, number]> = {
    browserConcurrency: [1, 4], renderTimeoutMs: [1000, 60000], scrollIterations: [0, 8],
    maxConcurrency: [1, 32], maxPages: [1, 10000], maxDepth: [0, 100], timeoutMs: [1, 300000],
    retries: [0, 5], delayMs: [0, 60000], maxRetryDelayMs: [0, 300000], maxBodyBytes: [1, 20 * 1024 * 1024],
    maxDurationMs: [1, 24 * 60 * 60 * 1000], maxQueryVariants: [1, 1000], maxLinksPerPage: [1, 20000],
  };
  for (const [name, [min, max]] of Object.entries(ranges)) {
    const value = o[name as keyof CrawlOptions];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }
  }
  if (o.pathPrefix && (!o.pathPrefix.startsWith('/') || /[?#]/.test(o.pathPrefix))) throw new Error('pathPrefix must be a pathname beginning with /, without a query or fragment.');
  if (!/^[A-Za-z][A-Za-z0-9_-]*(?:\/[^\r\n]+)?$/.test(o.userAgent) || o.userAgent.length > 200) throw new Error('Invalid crawler User-Agent.');
  if (typeof o.stripTracking !== 'boolean' || typeof o.respectRobots !== 'boolean') throw new Error('Boolean options must be true or false.');
  if (!['http', 'smart', 'browser'].includes(o.mode)) throw new Error('mode must be http, smart or browser.');
  for (const key of ['captureScreenshots', 'discoverSitemaps', 'adaptiveConcurrency'] as const) {
    if (typeof o[key] !== 'boolean') throw new Error(`${key} must be true or false.`);
  }
  if (!Array.isArray(o.sitemapURLs) || o.sitemapURLs.length > 10 || o.sitemapURLs.some(v => typeof v !== 'string' || v.length > 2048)) throw new Error('Supply at most 10 sitemap URLs.');
  if (!Array.isArray(o.extractionRules) || o.extractionRules.length > 12) throw new Error('At most 12 extraction rules are allowed.');
  const names = new Set<string>();
  o.extractionRules = o.extractionRules.map(rule => {
    if (!rule || typeof rule !== 'object' || typeof rule.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_ -]{0,49}$/.test(rule.name) || names.has(rule.name)) throw new Error('Extraction rules need unique, simple names (1-50 characters).');
    if (typeof rule.selector !== 'string' || !rule.selector.trim() || rule.selector.length > 300 || !['text', 'attribute', 'html'].includes(rule.mode)) throw new Error('Each extraction rule needs a CSS selector and text, attribute or html mode.');
    if (rule.mode === 'attribute' && (typeof rule.attribute !== 'string' || !/^[A-Za-z_:][A-Za-z0-9_.:-]{0,99}$/.test(rule.attribute))) throw new Error('Attribute extraction needs an attribute name.');
    names.add(rule.name);
    return { name: rule.name, selector: rule.selector.trim(), mode: rule.mode, ...(rule.mode === 'attribute' ? { attribute: rule.attribute } : {}) };
  });
  o.sitemapURLs = [...o.sitemapURLs];
  return o;
}
