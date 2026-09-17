// Repository note: Implements bounded crawl scheduling, fetching, retries, pacing, cancellation, and crawl lifecycle behavior.
// Implements the bounded crawl engine, request scheduling, retries, redirects, and crawl lifecycle.

import { challenge, canonicalTransition, diagnosticKind, redactMessage, describeError } from './crawler/diagnostics.js';
import { gunzipSync } from 'node:zlib';
import { BrowserPool, BrowserUnavailableError } from './crawler/browser.js';
import { discoverSitemaps, robotsSitemaps } from './crawler/sitemap.js';
import { inspectHeaders } from './crawler/body.js';
import { compareRendering } from './analysis/javascript.js';
import type { FrontierEntry, HttpInspection } from './inspection-types.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { httpURL, isInScope } from './url.js';
import { parseRobots, type RobotsPolicy } from './robots.js';
import { validateOptions } from './options.js';
import type { CrawlHooks, CrawlOptions, CrawlResult, PageDetails } from './types.js';

class CrawlError extends Error {
  url?: string; stage?: 'page' | 'robots' | 'sitemap'; provider?: string; guidance?: string;
  constructor(message: string, readonly kind: string, readonly status?: number,
    readonly retryable = false, readonly retryAfterMs?: number) { super(message); }
}
const errorMessage = describeError;
function retryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
async function readBody(response: Response, maxBytes: number, compressed = false): Promise<{ text: string; bytes: number }> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) {
    await response.body?.cancel(); throw new CrawlError(`Response exceeds ${maxBytes} bytes.`, 'body-limit');
  }
  const reader = response.body?.getReader();
  if (!reader) return { text: '', bytes: 0 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new CrawlError(`Response exceeds ${maxBytes} bytes.`, 'body-limit'); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const contentType = response.headers.get('content-type') ?? '';
  const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1] ?? 'utf-8';
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder('utf-8'); }
  const data = compressed ? gunzipSync(Buffer.concat(chunks), { maxOutputLength: maxBytes }) : Buffer.concat(chunks);
  return { text: decoder.decode(data), bytes: data.length };
}

/** Bounded, non-recursive work queue. Each candidate reserves a slot before any await. */
export async function runCrawl(startInput: string, input: Partial<CrawlOptions> = {}, hooks: CrawlHooks = {}): Promise<CrawlResult> {
  const options = validateOptions(input);
  const startURL = httpURL(startInput, undefined, options.stripTracking);
  let origin = new URL(startURL).origin;
  if (!isInScope(startURL, origin, options.pathPrefix)) throw new Error('The start URL is outside pathPrefix.');
  const started = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort(hooks.signal?.reason ?? new Error('Crawl interrupted.'));
  if (hooks.signal?.aborted) abort(); else hooks.signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => controller.abort(new Error('Maximum crawl duration reached.')), options.maxDurationMs);
  const result: CrawlResult = {
    schema_version: 1, start_url: startURL, started_at: new Date(started).toISOString(), finished_at: '', duration_ms: 0,
    options, pages: {}, errors: [], warnings: [], skipped: {},
    summary: { pages_crawled: 0, urls_scheduled: 0, requests: 0, retries: 0, failed: 0,
      unique_internal_links: 0, unique_external_links: 0, unique_images: 0, limit_reached: false, stopped: false },
  };
  result.discovery = { robots: { url: new URL('/robots.txt', origin).href, status: null, user_agent: options.userAgent, text: '', sitemaps: [], skipped: [] }, sitemaps: [], sitemap_urls: [], frontier: [], truncated: false };
  result.telemetry = { http_active: 0, browser_active: 0, browser_queued: 0, http_pages: 0, browser_pages: 0, browser_requests: 0, body_bytes: 0, process_rss_mb: 0, effective_workers: options.maxConcurrency, throttle_reason: '' };
  const uniqueInternal = new Set<string>(), uniqueExternal = new Set<string>(), uniqueImages = new Set<string>();
  let pageCount = 0;
  const browserPool = new BrowserPool(options.browserConcurrency, hooks.browserFactory, load => {
    result.telemetry!.browser_active = load.active; result.telemetry!.browser_queued = load.queued;
  });
  let browserUnavailable = '';
  let policy: RobotsPolicy = { allows: () => true, delayMs: 0 };
  let nextRequest = 0;
  let startGate: Promise<void> = Promise.resolve();
  let serverNotBefore = 0;
  const fetchImpl = hooks.fetchImpl ?? fetch;
  const queue: FrontierEntry[] = [];
  let queueIndex = 0;
  const seen = new Set<string>();
  const variants = new Map<string, number>();
  const active = new Set<Promise<void>>();
  const skip = (kind: string) => { result.skipped[kind] = (result.skipped[kind] ?? 0) + 1; };
  const warn = (message: string) => { if (result.warnings.length < 100 && !result.warnings.includes(message)) result.warnings.push(message); };
  const progress = () => {
    Object.assign(result.summary, { pages_crawled: pageCount, urls_scheduled: seen.size, failed: result.errors.length,
      unique_internal_links: uniqueInternal.size, unique_external_links: uniqueExternal.size, unique_images: uniqueImages.size });
    result.telemetry!.process_rss_mb = Math.round(process.memoryUsage().rss / 1048576);
    result.duration_ms = Date.now() - started;
    hooks.onProgress?.(result);
  };
  const log = (message: string) => { hooks.onLog?.(message); progress(); };
  let extractor: ((html: string, url: string, rules?: CrawlOptions['extractionRules']) => PageDetails) | undefined = hooks.extract;
  let extractorPromise: Promise<typeof import('./extract.js')> | undefined;

  async function pace(signal: AbortSignal = controller.signal): Promise<void> {
    const combined = AbortSignal.any([signal, controller.signal]);
    combined.throwIfAborted();
    // A cancelled slot remains in the FIFO chain but no longer advances the clock.
    // Its caller can return immediately; later live slots cannot jump older work.
    const work = startGate.then(async () => {
      combined.throwIfAborted();
      await hooks.beforeRequest?.(combined);
      for (;;) {
        combined.throwIfAborted();
        const wait = Math.max(nextRequest, serverNotBefore) - Date.now();
        if (wait <= 0) break;
        await sleep(wait, undefined, { signal: combined });
      }
      nextRequest = Date.now() + Math.max(options.delayMs, policy.delayMs);
    });
    startGate = work.catch(() => {});
    let cancel!: () => void;
    try {
      await Promise.race([work, new Promise<never>((_resolve, reject) => {
        cancel = () => reject(combined.reason);
        combined.addEventListener('abort', cancel, { once: true });
        if (combined.aborted) cancel();
      })]);
    } finally { combined.removeEventListener('abort', cancel); }
  }

  async function once(initial: string, kind: 'page' | 'robots' | 'sitemap', entry = false): Promise<{ text: string; bytes: number; url: string; status: number; headers: Headers; http: HttpInspection }> {
    const robots = kind === 'robots', sitemap = kind === 'sitemap';
    const detail: HttpInspection = { status_text: '', mime_type: '', charset: '', headers: {}, redirects: [], attempts: 0, ttfb_ms: 0 };
    let current = initial;
    const redirects = new Set<string>();
    for (let hop = 0; hop <= 5; hop++) {
      if (redirects.has(current)) throw new CrawlError('Redirect loop detected.', 'redirect');
      redirects.add(current);
      if (!isInScope(current, origin, robots || sitemap ? '' : options.pathPrefix) && !(robots && canonicalTransition(initial, current)) && !(entry && current === initial && canonicalTransition(initial, origin))) throw new CrawlError('Redirect blocked: destination is outside the allowed origin/path.', 'scope');
      if (!robots && !policy.allows(current)) throw new CrawlError('robots.txt disallows this URL.', 'robots');
      await pace();
      const attemptController = new AbortController();
      const relay = () => attemptController.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', relay, { once: true });
      const timeout = setTimeout(() => attemptController.abort(new Error(`Request timed out after ${options.timeoutMs} ms.`)), options.timeoutMs);
      try {
        result.summary.requests++;
        const requestStart = Date.now();
        const response = await fetchImpl(current, {
          redirect: 'manual', signal: attemptController.signal,
          headers: { 'User-Agent': options.userAgent, Accept: robots ? 'text/plain,*/*;q=0.1' : sitemap ? 'application/xml,text/xml,application/gzip,*/*;q=0.1' : 'text/html,application/xhtml+xml;q=0.9' },
        });
        detail.ttfb_ms += Date.now() - requestStart;
        detail.status_text = response.statusText; detail.headers = inspectHeaders(response.headers);
        detail.mime_type = (response.headers.get('content-type') ?? '').split(';')[0]!;
        detail.charset = /charset=([^; ]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ?? '';
        const block = challenge(response.headers, response.status);
        if (block) {
          await response.body?.cancel();
          throw Object.assign(new CrawlError(block.message, block.kind, response.status), block, { url: current, stage: kind });
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw new CrawlError('Redirect has no Location header.', 'redirect', response.status);
          if (hop === 5) throw new CrawlError('More than five redirects.', 'redirect', response.status);
          try {
            const to = httpURL(location, current, options.stripTracking);
            if (entry && new URL(to).origin !== origin && canonicalTransition(current, to) && isInScope(to, new URL(to).origin, options.pathPrefix)) {
              // Establish the destination policy BEFORE fetching any redirected page. Other crawl URLs cannot expand scope.
              const previous = origin; origin = new URL(to).origin;
              result.effective_start_url = to;
              (result.scope_redirects ??= []).push({ from: current, to, status: response.status });
              log(`canonical host: ${previous} → ${origin}; checking destination robots.txt`);
              try { await establishRobots(); } catch (error) { controller.abort(error); throw error; }
            }
            detail.redirects.push({ url: current, status: response.status, to }); current = to;
          }
          catch (error) { if (error instanceof CrawlError) throw error; throw new CrawlError(errorMessage(error), 'redirect'); }
          continue;
        }
        if (!response.ok && (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
          // Limit diagnostic sampling independently of the normal page budget.
          const reader = response.body?.getReader(); let sample = '';
          if (reader) {
            const chunks: Uint8Array[] = []; let size = 0;
            try {
              while (size < 16384) { const chunk = await reader.read(); if (chunk.done) break; const part = chunk.value.subarray(0, 16384 - size); chunks.push(part); size += part.length; }
              sample = new TextDecoder().decode(Buffer.concat(chunks));
            } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          }
          const detected = challenge(response.headers, response.status, sample);
          if (detected) throw Object.assign(new CrawlError(detected.message, detected.kind, response.status), detected, { url: current, stage: kind });
        }
        if ((robots || sitemap) && response.status >= 400 && response.status < 500 && response.status !== 429) {
          await response.body?.cancel();
          return { text: '', bytes: 0, url: current, status: response.status, headers: response.headers, http: detail };
        }
        if (!response.ok) {
          const wait = retryAfter(response.headers.get('retry-after'));
          if (wait !== undefined && [429, 503].includes(response.status)) serverNotBefore = Math.max(serverNotBefore, Date.now() + wait);
          await response.body?.cancel();
          throw new CrawlError(`HTTP ${response.status} ${response.statusText}`.trim(), 'http', response.status,
            [408, 429, 500, 502, 503, 504].includes(response.status), wait);
        }
        const mime = (response.headers.get('content-type') ?? '').split(';', 1)[0]!.trim().toLowerCase();
        if (!robots && !sitemap && !['text/html', 'application/xhtml+xml'].includes(mime)) {
          await response.body?.cancel();
          throw new CrawlError(`Skipped non-HTML response (${mime || 'missing Content-Type'}).`, 'non-html', response.status);
        }
        const body = await readBody(response, robots ? Math.min(options.maxBodyBytes, 512 * 1024) : options.maxBodyBytes, sitemap && (mime.includes('gzip') || current.endsWith('.gz')) && !response.headers.get('content-encoding'));
        result.telemetry!.body_bytes += body.bytes;
        return { ...body, url: current, status: response.status, headers: response.headers, http: detail };
      } catch (error) {
        if (error instanceof CrawlError) { error.url ??= current; error.stage ??= kind; throw error; }
        if (controller.signal.aborted) throw Object.assign(new CrawlError(errorMessage(controller.signal.reason), 'aborted'), { url: current, stage: kind });
        if (attemptController.signal.aborted) throw Object.assign(new CrawlError(errorMessage(attemptController.signal.reason), 'timeout', undefined, true), { url: current, stage: kind });
        const message = errorMessage(error);
        throw Object.assign(new CrawlError(redactMessage(message), diagnosticKind(message), undefined, !/CERT_|CERTIFICATE|TLS|SSL|Private, loopback/i.test(message)), { url: current, stage: kind });
      } finally {
        clearTimeout(timeout); controller.signal.removeEventListener('abort', relay);
      }
    }
    throw new CrawlError('Redirect limit reached.', 'redirect');
  }
  async function request(url: string, kind: 'page' | 'robots' | 'sitemap' = 'page', entry = false) {
    for (let attempt = 0; ; attempt++) {
      try { const value = await once(url, kind, entry); value.http.attempts = attempt + 1; return { ...value, attempts: attempt + 1 }; }
      catch (error) {
        const err = error instanceof CrawlError ? error : new CrawlError(errorMessage(error), controller.signal.aborted ? 'aborted' : 'internal');
        const delay = err.retryAfterMs ?? Math.min(options.maxRetryDelayMs, 250 * 2 ** attempt);
        if (controller.signal.aborted || !err.retryable || attempt >= options.retries || delay > options.maxRetryDelayMs) {
          if (delay > options.maxRetryDelayMs) warn('A server requested a Retry-After longer than the retry budget; the crawl was stopped instead of retrying early.');
          if (delay > options.maxRetryDelayMs && err.retryable) controller.abort(new Error('Server requested a longer backoff than the configured retry budget.'));
          throw Object.assign(err, { attempts: attempt + 1 });
        }
        result.summary.retries++;
        log(`retry ${attempt + 1}/${options.retries}: ${url} (${err.message})`);
        try { await sleep(delay, undefined, { signal: controller.signal }); }
        catch { throw Object.assign(new CrawlError(errorMessage(controller.signal.reason), 'aborted'), { attempts: attempt + 1 }); }
      }
    }
  }
  function enqueue(raw: string, depth: number, source = '', method: FrontierEntry['method'] = 'link'): void {
    if (controller.signal.aborted) return;
    let url: string;
    try { url = httpURL(raw, undefined, options.stripTracking); } catch { skip('invalid_url'); return; }
    if (!isInScope(url, origin, options.pathPrefix)) { skip('out_of_scope'); return; }
    if (seen.has(url)) { skip('duplicate'); return; }
    if (depth > options.maxDepth) { skip('depth_limit'); return; }
    if (!policy.allows(url)) { skip('robots'); if (result.discovery!.robots.skipped.length < 1000) result.discovery!.robots.skipped.push(url); return; }
    if (seen.size >= options.maxPages) { result.summary.limit_reached = true; skip('page_limit'); return; }
    const parsed = new URL(url);
    const path = `${parsed.origin}${parsed.pathname}`;
    const count = variants.get(path) ?? 0;
    if (count >= options.maxQueryVariants) { skip('query_limit'); return; }
    variants.set(path, count + 1); seen.add(url);
    const item: FrontierEntry = { url, depth, source_url: source, method, discovered_at: new Date().toISOString(), state: 'queued' };
    queue.push(item); result.discovery!.frontier.push(item);
  }
  function recordError(url: string, error: unknown): void {
    const err = error instanceof CrawlError ? error : new CrawlError(errorMessage(error), 'internal');
    const attempts = 'attempts' in err && typeof err.attempts === 'number' ? err.attempts : 0;
    result.errors.push({ url: err.url ?? url, kind: err.kind, stage: err.stage, provider: err.provider, guidance: err.guidance, message: redactMessage(err.message), attempts, ...(err.status === undefined ? {} : { status_code: err.status }) });
    log(`${err.kind}: ${url}: ${err.message}`);
  }
  async function visit(item: FrontierEntry): Promise<void> {
    const time = Date.now();
    try {
      log(`crawling: ${item.url}`);
      item.state = 'processing';
      result.telemetry!.http_active++;
      const fetched = await request(item.url, 'page', item.method === 'seed').finally(() => { result.telemetry!.http_active--; });
      if (result.pages[fetched.url]) { skip('redirect_duplicate'); item.state = 'completed'; return; }
      if (!extractor) {
        extractorPromise ??= import('./extract.js');
        extractor = (await extractorPromise).extractPageDetails;
      }
      let data: PageDetails;
      try { data = extractor(fetched.text, fetched.url, options.extractionRules); }
      catch (error) { throw new CrawlError(errorMessage(error), 'parse'); }
      const rawData = data;
      const reasons = options.mode === 'browser' ? ['Full Browser selected'] : data.inspection?.render_signals ?? [];
      let rendering: import('./inspection-types.js').RenderingInfo = { method: 'http', status: 'not-needed', reasons: options.mode === 'http' ? ['Fast HTTP selected'] : reasons.length ? reasons : ['Source HTML has meaningful content and navigation'] };
      if (options.mode !== 'http' && reasons.length) {
        try {
          if (browserUnavailable) throw new BrowserUnavailableError(browserUnavailable);
          log(`rendering: ${fetched.url}: ${reasons.join('; ')}`);
          let evidence: import('./inspection-types.js').BrowserEvidence | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              evidence = await browserPool.render({ url: fetched.url, html: fetched.text, headers: fetched.headers, status: fetched.status,
                origin, options, signal: controller.signal, fetchImpl, allows: url => policy.allows(url),
                beforeRequest: async signal => { signal.throwIfAborted(); await pace(signal); signal.throwIfAborted(); },
                onRequest: entry => {
                  if (!entry.cached) { result.summary.requests += entry.attempts ?? 0; result.telemetry!.browser_requests += entry.attempts ?? 0; result.telemetry!.body_bytes += entry.body_bytes; }
                } }); break;
            } catch (error) {
              if (attempt || controller.signal.aborted || error instanceof BrowserUnavailableError || !/crash|closed|disconnect/i.test(errorMessage(error))) throw error;
              result.summary.retries++; log(`browser retry: ${fetched.url}`);
            }
          }
          if (!evidence) throw new Error('No browser evidence captured.');
          const { renderedDetails } = await import('./extract/contexts.js');
          const sourceURL = fetched.url;
          fetched.url = evidence.final_url ?? fetched.url;
          data = renderedDetails(evidence, fetched.url, options.extractionRules);
          rendering = { source_url: sourceURL, final_url: fetched.url, method: 'browser', status: 'rendered', reasons, duration_ms: evidence.duration_ms, settled: evidence.settled,
            comparison: compareRendering(rawData, data), network: evidence.network.slice(0, 100), console: evidence.console, network_count: evidence.network.length,
            network_errors: evidence.network.filter(r => r.error || (r.status ?? 0) >= 400).length,
            console_errors: evidence.console.length, body_bytes: evidence.network.filter(r => !r.cached).reduce((sum, r) => sum + r.body_bytes, 0), notes: evidence.notes };
          try { rendering.artifact_id = await hooks.onEvidence?.(fetched.url, evidence); }
          catch (error) { warn(`Browser evidence could not be saved: ${errorMessage(error)}`); }
          if (!rendering.artifact_id) rendering.notes = [...(rendering.notes ?? []), 'Source/screenshot evidence was not stored; comparison metrics are still available.'];

          if (evidence.truncated) warn('Some browser captures reached element, network, source or transfer limits; inspect the saved evidence notes.');
        } catch (error) {
          if (error instanceof BrowserUnavailableError) { browserUnavailable = error.message; warn(browserUnavailable); }
          if (options.mode === 'browser' || controller.signal.aborted) throw new CrawlError(errorMessage(error), controller.signal.aborted ? 'aborted' : 'browser');
          rendering = { method: 'http', status: error instanceof BrowserUnavailableError ? 'unavailable' : 'failed', reasons, failure: errorMessage(error) };
          log(`render fallback: ${fetched.url}: ${errorMessage(error)}`);
        }
      }
      if (result.pages[fetched.url]) { skip('redirect_duplicate'); item.state = 'completed'; return; }
      if (rendering.method === 'http') result.telemetry!.http_pages++; else result.telemetry!.browser_pages++;
      if (controller.signal.aborted) throw new CrawlError(errorMessage(controller.signal.reason), 'aborted');
      if (data.outgoing_links.length > options.maxLinksPerPage || data.image_urls.length > options.maxLinksPerPage) warn(`Link/image arrays truncated to ${options.maxLinksPerPage} entries per page.`);
      if (data.outgoing_links.length > options.maxLinksPerPage) result.skipped.link_limit = (result.skipped.link_limit ?? 0) + data.outgoing_links.length - options.maxLinksPerPage;
      if (data.image_urls.length > options.maxLinksPerPage) result.skipped.image_limit = (result.skipped.image_limit ?? 0) + data.image_urls.length - options.maxLinksPerPage;
      const links = [...new Set(data.outgoing_links.map(link => { try { return httpURL(link, fetched.url, options.stripTracking); } catch { return ''; } }).filter(Boolean))].slice(0, options.maxLinksPerPage);
      const images = [...new Set(data.image_urls.map(link => { try { return httpURL(link, fetched.url); } catch { return ''; } }).filter(Boolean))].slice(0, options.maxLinksPerPage);
      result.pages[fetched.url] = {
        ...data, url: fetched.url, outgoing_links: links, image_urls: images,
        requested_url: item.url, status_code: fetched.status, depth: item.depth,
        http: fetched.http, rendering, discovery: { method: item.method, source_url: item.source_url },
        duration_ms: Date.now() - time, content_bytes: fetched.bytes,
        internal_links: links.filter(url => new URL(url).origin === origin),
        external_links: links.filter(url => new URL(url).origin !== origin),
      };
      const captured = result.pages[fetched.url]!;
      pageCount++;
      for (const url of captured.internal_links) uniqueInternal.add(url);
      for (const url of captured.external_links) uniqueExternal.add(url);
      for (const url of captured.image_urls) uniqueImages.add(url);
      item.state = 'completed'; hooks.onPage?.(captured);
      for (const link of [...new Set([...links, ...rawData.outgoing_links])].slice(0, options.maxLinksPerPage)) enqueue(link, item.depth + 1, fetched.url);
    } catch (error) { item.state = 'failed'; recordError(item.url, error); if (error instanceof CrawlError && error.kind === 'access-challenge') controller.abort(error); }
    finally { progress(); }
  }
  async function establishRobots(): Promise<void> {
    if (controller.signal.aborted || !options.respectRobots) return;
    const robotsURL = new URL('/robots.txt', origin).href;
    Object.assign(result.discovery!.robots, { url: robotsURL, status: null, text: '', sitemaps: [], error: undefined });
    try {
      const fetched = await request(robotsURL, 'robots');
      Object.assign(result.discovery!.robots, { status: fetched.status, text: fetched.text.slice(0, 64000), sitemaps: robotsSitemaps(fetched.text, origin) });
      policy = { allows: () => true, delayMs: 0 };
      if ([401, 403].includes(fetched.status)) {
        policy = { allows: () => false, delayMs: 0 };
        warn(`robots.txt returned ${fetched.status}; crawling denied conservatively. Review site-owner access settings.`);
      } else if (fetched.status < 400) {
        if (/^\s*(?:<!doctype html|<html)/i.test(fetched.text)) throw Object.assign(new CrawlError('robots.txt returned an HTML page instead of robots rules. Check the site routing or owner access settings.', 'robots', fetched.status), { url: robotsURL, stage: 'robots' });
        policy = parseRobots(fetched.text, options.userAgent);
      }
      nextRequest = Math.max(nextRequest, Date.now() + policy.delayMs);
      if (policy.delayMs > 60000) throw new CrawlError('robots.txt Crawl-delay exceeds 60 seconds; refusing this run rather than ignoring the delay.', 'robots');
    } catch (error) {
      result.discovery!.robots.error = redactMessage(errorMessage(error));
      if (error instanceof CrawlError) { result.discovery!.robots.status = error.status ?? null; error.stage ??= 'robots'; error.url ??= robotsURL; }
      throw error;
    }
  }
  try {
    try { await establishRobots(); }
    catch (error) { recordError(new URL('/robots.txt', origin).href, error); controller.abort(error); }
    if (!options.respectRobots) warn('robots.txt checking was explicitly disabled. Crawl only with authorization.');
    enqueue(startURL, 0, '', 'seed');
    // Resolve the entry origin before sitemap seeding can schedule the old hostname.
    if (queue.length && !controller.signal.aborted) await visit(queue[queueIndex++]!);
    if (options.discoverSitemaps && !controller.signal.aborted) {
      const inventory = await discoverSitemaps(origin, [...result.discovery!.robots.sitemaps, ...options.sitemapURLs], url => request(url, 'sitemap'), controller.signal);
      result.discovery!.sitemaps = inventory.files; result.discovery!.sitemap_urls = inventory.urls; result.discovery!.truncated = inventory.truncated;
      log(`sitemaps: ${inventory.urls.length} URLs in ${inventory.files.length} files`);
      for (const entry of inventory.urls) enqueue(entry.url, 0, entry.sitemap, 'sitemap');
    }
    while ((!controller.signal.aborted && queueIndex < queue.length) || active.size) {
      const memoryLimited = options.adaptiveConcurrency && process.memoryUsage().rss > 512 * 1024 * 1024;
      result.telemetry!.effective_workers = memoryLimited ? 1 : options.maxConcurrency;
      result.telemetry!.throttle_reason = memoryLimited ? 'Node process RSS exceeded 512 MiB; reducing new work' : '';
      while (!controller.signal.aborted && active.size < result.telemetry!.effective_workers && queueIndex < queue.length) {
        const item = queue[queueIndex++]!;
        let task: Promise<void>;
        task = visit(item).finally(() => { active.delete(task); });
        active.add(task);
      }
      if (active.size) await Promise.race(active);
    }
  } finally {
    await browserPool.close();
    clearTimeout(deadline); hooks.signal?.removeEventListener('abort', abort);
    const pages = Object.values(result.pages);
    Object.assign(result.summary, {
      pages_crawled: pages.length, urls_scheduled: seen.size, failed: result.errors.length,
      unique_internal_links: new Set(pages.flatMap(p => p.internal_links)).size,
      unique_external_links: new Set(pages.flatMap(p => p.external_links)).size,
      unique_images: new Set(pages.flatMap(p => p.image_urls)).size,
      stopped: controller.signal.aborted,
    });
    if (controller.signal.aborted) warn(errorMessage(controller.signal.reason));
    result.finished_at = new Date().toISOString(); result.duration_ms = Date.now() - started;
    progress();
  }
  return result;
}
