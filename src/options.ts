// Defines crawler defaults and validates option ranges before network work begins.

import type { CrawlOptions } from './types.js';
export const DEFAULT_OPTIONS: Readonly<CrawlOptions> = Object.freeze({
  maxConcurrency: 3, maxPages: 50, maxDepth: 10, timeoutMs: 15000, retries: 2,
  delayMs: 200, maxRetryDelayMs: 30000, maxBodyBytes: 2 * 1024 * 1024,
  maxDurationMs: 600000, maxQueryVariants: 10, maxLinksPerPage: 2000,
  pathPrefix: '', stripTracking: false, respectRobots: true, userAgent: 'BootCrawler/2.0',
});
export function validateOptions(input: Partial<CrawlOptions>): CrawlOptions {
  const o = { ...DEFAULT_OPTIONS, ...input };
  const ranges: Record<string, [number, number]> = {
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
  return o;
}
