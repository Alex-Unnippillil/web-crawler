/** Managed Chromium renderer. Network I/O is fulfilled through a checked Node transport.
 * A denying proxy is a second boundary for requests missed by browser interception.
 * No remote scripts run in the Node/Studio process. No stealth or challenge bypass.
 */
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, BrowserContext, LaunchOptions, Route } from 'playwright';
import { boundedBytes } from './body.js';
import { httpURL, isInScope } from '../url.js';
import type { BrowserEvidence, NetworkEntry } from '../inspection-types.js';
import type { CrawlOptions } from '../types.js';

export type BrowserFactory = (options: LaunchOptions) => Promise<Browser>;
export class BrowserUnavailableError extends Error {}
export interface RenderInput {
  url: string;
  html: string;
  headers: Headers;
  status: number;
  origin: string;
  options: CrawlOptions;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
  allows: (url: string) => boolean;
  beforeRequest: (signal: AbortSignal) => Promise<void>;
  onRequest?: (record: NetworkEntry) => void;
}
export interface BrowserLoad { active: number; queued: number }
export async function browserAvailability(): Promise<{ installed: boolean; version: string; message: string }> {
  try {
    const { chromium } = await import('playwright');
    const installed = existsSync(chromium.executablePath());
    return { installed, version: 'Chromium / Playwright', message: installed ? 'Chromium is installed. Rendering uses an isolated context and checked network transport.' : 'Install Chromium once with npm run browser:install. Fast HTTP needs no browser.' };
  } catch { return { installed: false, version: 'Not installed', message: 'Install project dependencies, then run npm run browser:install.' }; }
}

export class BrowserPool {
  private browser?: Browser;
  private opening?: Promise<Browser>;
  private denyProxy?: Server;
  private proxyURL = '';
  private active = 0;
  private uses = 0;
  private stopped = false;
  private waiters = new Set<() => void>();
  private contexts = new Set<BrowserContext>();
  constructor(private maximum: number, private factory?: BrowserFactory, private onLoad?: (load: BrowserLoad) => void) {}
  private notify(): void { this.onLoad?.({ active: this.active, queued: this.waiters.size }); }
  private async acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted(); if (this.stopped) throw new Error('Browser pool closed.');
    while (this.active >= this.maximum) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => { this.waiters.delete(wake); signal.removeEventListener('abort', cancel); resolve(); };
        const cancel = () => { this.waiters.delete(wake); this.notify(); reject(signal.reason); };
        this.waiters.add(wake); signal.addEventListener('abort', cancel, { once: true }); this.notify();
        if (signal.aborted) cancel();
      });
      signal.throwIfAborted(); if (this.stopped) throw new Error('Browser pool closed.');
    }
    this.active++; this.notify();
  }
  private release(): void { this.active--; this.notify(); this.waiters.values().next().value?.(); }
  private async open(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      const { chromium } = await import('playwright');
      if (!this.factory && !existsSync(chromium.executablePath())) throw new BrowserUnavailableError('Chromium is not installed. Run npm run browser:install, or choose Fast HTTP.');
      if (!this.denyProxy) {
        const proxy = createServer((_req, res) => { res.writeHead(403); res.end('Direct browser network access is disabled.'); });
        proxy.on('connect', (_req, socket) => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
        await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', () => { proxy.off('error', reject); resolve(); }); });
        this.denyProxy = proxy; this.proxyURL = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
      }
      const launch: LaunchOptions = {
        headless: true, chromiumSandbox: true, timeout: 15000,
        proxy: { server: this.proxyURL, bypass: '<-loopback>' },
        args: ['--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-quic',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
          '--proxy-bypass-list=<-loopback>', '--js-flags=--max-old-space-size=128'],
      };
      let browser: Browser;
      try { browser = await (this.factory ? this.factory(launch) : chromium.launch(launch)); }
      catch (error) { throw new BrowserUnavailableError(`Chromium could not start: ${(error instanceof Error ? error.message : String(error)).slice(0, 600)}. Check browser installation and OS sandbox support; Fast HTTP remains available.`); }
      if (this.stopped) { await browser.close(); throw new Error('Browser pool closed during launch.'); }
      this.browser = browser; this.uses = 0;
      browser.on('disconnected', () => { if (this.browser === browser) this.browser = undefined; });
      return browser;
    })();
    try { return await this.opening; } finally { this.opening = undefined; }
  }
  async render(input: RenderInput): Promise<BrowserEvidence> {
    await this.acquire(input.signal);
    let context: BrowserContext | undefined;
    const controller = new AbortController();
    const relay = () => controller.abort(input.signal.reason);
    input.signal.addEventListener('abort', relay, { once: true });
    if (input.signal.aborted) relay();
    const deadline = setTimeout(() => controller.abort(new Error('Browser render deadline reached.')), input.options.renderTimeoutMs);
    const started = Date.now();
    const evidence: BrowserEvidence = { raw_html: input.html, rendered_html: '', network: [], console: [], contexts: [], settled: 'timeout', duration_ms: 0, truncated: false, notes: [] };
    let totalBytes = 0, networkAttempts = 0, navigationRedirects = 0, encountered = 0, pending = 0, lastActivity = Date.now(), documentServed = false;
    const requests = new Set<Promise<void>>();
    const abortContext = () => { void context?.close().catch(() => {}); };
    controller.signal.addEventListener('abort', abortContext, { once: true });
    const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);
    try {
      const browser = await this.open(); controller.signal.throwIfAborted();
      context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', ignoreHTTPSErrors: false,
        viewport: { width: 1280, height: 800 }, userAgent: input.options.userAgent, permissions: [] });
      this.contexts.add(context); controller.signal.throwIfAborted();
      const page = await context.newPage();
      page.setDefaultTimeout(Math.min(3000, input.options.renderTimeoutMs));
      // Network interception is context-wide; popups and frame requests cannot escape it.
      context.on('page', other => { if (other !== page) void other.close().catch(() => {}); });
      await context.routeWebSocket('**/*', socket => { socket.close(); if (evidence.notes.length < 10) evidence.notes.push('WebSocket blocked; this renderer inspects finite HTTP content.'); });
      page.on('console', event => { if (['error', 'warning'].includes(event.type()) && evidence.console.length < 50) evidence.console.push({ level: event.type(), text: event.text().slice(0, 1000) }); });
      page.on('pageerror', error => { if (evidence.console.length < 50) evidence.console.push({ level: 'javascript', text: error.message.slice(0, 1000) }); });
      page.on('crash', () => controller.abort(new Error('Chromium page crashed or exceeded its resource budget.')));
      const transfer = async (route: Route): Promise<void> => {
        const request = route.request();
        if (++encountered > 200 || controller.signal.aborted) { evidence.truncated = true; await route.abort().catch(() => {}); return; }
        const record: NetworkEntry = { url: request.url().slice(0, 8192), final_url: request.url().slice(0, 8192), method: request.method(), type: request.resourceType(),
          attempts: 0, status: null, content_type: '', start_ms: Date.now() - started, duration_ms: 0, body_bytes: 0, redirects: [] };
        evidence.network.push(record); pending++; lastActivity = Date.now();
        const attempt = new AbortController();
        const cancel = () => attempt.abort(controller.signal.reason);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) cancel();
        const timer = setTimeout(() => attempt.abort(new Error('Browser resource timeout.')), Math.min(8000, input.options.timeoutMs));
        try {
          if (totalBytes >= 24 * 1024 * 1024) { evidence.truncated = true; throw new Error('Browser response budget (24 MiB) is exhausted.'); }
          if (request.method() !== 'GET') throw new Error('Only GET requests are allowed; forms and write/API actions are not submitted.');
          let current = httpURL(request.url());
          const navigation = request.isNavigationRequest();
          const check = (target: string) => {
            const u = new URL(target);
            if (navigation && !isInScope(target, input.origin, input.options.pathPrefix)) throw new Error('Frame/document navigation is outside crawl scope.');
            if (u.origin === input.origin && !input.allows(target)) throw new Error('robots.txt disallows this browser request.');
          };
          check(current);
          const headers = new Headers();
          const original = await request.allHeaders();
          // Browser-generated same-origin/session cookies may be sent, but never persisted in diagnostics.
          for (const name of ['accept', 'accept-language', 'cookie', 'origin', 'referer']) if (original[name]) headers.set(name, original[name]);
          headers.set('user-agent', input.options.userAgent);
          let response: Response | undefined;
          if (!documentServed && navigation && request.frame() === page.mainFrame() && current === input.url) {
            documentServed = true; record.cached = true;
            const seedHeaders = new Headers(input.headers);
            // HTTP source has already been decoded into a JS string; fulfill its UTF-8 bytes honestly.
            seedHeaders.set('content-type', 'text/html; charset=utf-8');
            response = new Response(input.html, { status: input.status, headers: seedHeaders });
          } else {
            const seen = new Set<string>();
            for (let hop = 0; hop <= 5; hop++) {
              check(current); if (seen.has(current)) throw new Error('Browser resource redirect loop.'); seen.add(current);
              await input.beforeRequest(attempt.signal); attempt.signal.throwIfAborted();
              if (++networkAttempts > 200 || totalBytes >= 24 * 1024 * 1024) { evidence.truncated = true; throw new Error('Browser request/response budget is exhausted.'); }
              record.attempts!++;
              response = await input.fetchImpl(current, { redirect: 'manual', signal: attempt.signal, headers });
              if (![301, 302, 303, 307, 308].includes(response.status)) break;
              const next = response.headers.get('location'); await response.body?.cancel();
              if (!next || hop === 5) throw new Error('Browser resource redirect limit or missing Location.');
              const target = httpURL(next, current); check(target);
              record.redirects.push({ url: current, status: response.status, to: target });
              if (navigation) {
                if (++navigationRedirects > 10) throw new Error('Browser document redirect budget reached.');
                // Playwright routes are not re-invoked for native redirect follow-ups.
                // Reissue navigation explicitly so every destination still crosses the
                // pinned transport; never let an un-intercepted redirect hit the network.
                record.status = response.status; record.final_url = target;
                await route.abort('aborted');
                controller.signal.throwIfAborted();
                pending++;
                const navigation = request.frame().goto(target, { waitUntil: 'domcontentloaded', timeout: Math.max(1, started + input.options.renderTimeoutMs - Date.now()) })
                  .then(() => {}, error => { record.error = message(error); })
                  .finally(() => { pending--; lastActivity = Date.now(); requests.delete(navigation); });
                requests.add(navigation);
                if (evidence.notes.length < 10) evidence.notes.push('A document redirect was reissued as a checked browser navigation; direct redirect network access remains denied.');
                return;
              }
              // Cookies and referrer must not leak when a CDN/resource redirects across origins.
              if (new URL(current).origin !== new URL(target).origin) { headers.delete('cookie'); headers.delete('referer'); headers.delete('origin'); }
              current = target;
            }
          }
          if (!response) throw new Error('No browser response.');
          record.status = response.status; record.final_url = current; record.content_type = response.headers.get('content-type') ?? '';
          if ([429, 503].includes(response.status)) {
            await response.body?.cancel(); throw new Error(`HTTP ${response.status}; browser resource not retried during this render.`);
          }
          if (/text\/event-stream/i.test(record.content_type)) { await response.body?.cancel(); throw new Error('Streaming responses are excluded from bounded inspection.'); }
          const account = (size: number) => {
            if (totalBytes + size > 24 * 1024 * 1024) { evidence.truncated = true; throw new Error('Browser page response budget (24 MiB) reached.'); }
            totalBytes += size;
          };
          const bytes = record.cached ? Buffer.from(input.html) : await boundedBytes(response, Math.min(4 * 1024 * 1024, 24 * 1024 * 1024 - totalBytes), account);
          if (record.cached) account(bytes.length);
          record.body_bytes = bytes.length;
          const fulfilledHeaders: Record<string, string> = Object.fromEntries(response.headers);
          delete fulfilledHeaders['content-encoding']; delete fulfilledHeaders['content-length']; delete fulfilledHeaders['transfer-encoding'];
          // 304 is unusable in an isolated context without a previously cached response body.
          if (response.status === 304) throw new Error('Server returned 304 without a browser cache entry.');
          await route.fulfill({ status: response.status, headers: fulfilledHeaders, body: bytes });
        } catch (error) { record.error = message(error); await route.abort().catch(() => {}); }
        finally {
          clearTimeout(timer); controller.signal.removeEventListener('abort', cancel);
          record.duration_ms = Date.now() - started - record.start_ms; pending--; lastActivity = Date.now();
          input.onRequest?.(record);
        }
      };
      await context.route('**/*', route => {
        const work = transfer(route); requests.add(work);
        void work.finally(() => requests.delete(work)).catch(() => {}); return work;
      });
      await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: input.options.renderTimeoutMs });
      const mainFailure = evidence.network.find(r => r.type === 'document' && r.url === input.url && r.error);
      if (mainFailure) throw new Error(mainFailure.error);
      // Stable DOM + finite network quietness; not an unconditional fixed page sleep.
      const settle = async (budget: number): Promise<boolean> => {
        const until = Math.min(started + input.options.renderTimeoutMs - 1200, Date.now() + budget);
        let previous = '', stableSince = Date.now();
        while (Date.now() < until) {
          controller.signal.throwIfAborted();
          let signature: string;
          try { signature = await page.evaluate(() => `${location.href}|${document.title}|${document.body?.innerText.length ?? 0}|${document.getElementsByTagName('*').length}|${document.links.length}|${document.images.length}`); }
          catch (error) {
            if (!/Execution context was destroyed|Cannot find context/i.test(message(error))) throw error;
            await sleep(100, undefined, { signal: controller.signal }); continue;
          }
          if (signature !== previous) { previous = signature; stableSince = Date.now(); }
          if (pending === 0 && Date.now() - lastActivity >= 450 && Date.now() - stableSince >= 650) return true;
          await sleep(100, undefined, { signal: controller.signal });
        }
        return false;
      };
      evidence.settled = await settle(Math.max(1000, input.options.renderTimeoutMs - 1500)) ? 'stable' : 'timeout';
      for (let i = 0; i < input.options.scrollIterations && Date.now() - started < input.options.renderTimeoutMs - 1800; i++) {
        await input.beforeRequest(controller.signal);
        await page.evaluate(() => window.scrollBy(0, Math.max(600, innerHeight * 0.8)));
        await settle(1200);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const finalURL = httpURL(page.url());
      if (!isInScope(finalURL, input.origin, input.options.pathPrefix) || !input.allows(finalURL)) throw new Error('The rendered URL is outside crawl policy.');
      evidence.final_url = finalURL;
      const captured = await page.evaluate(() => {
        const max = 2 * 1024 * 1024;
        const html = document.documentElement.outerHTML;
        const contexts: { kind: 'frame' | 'shadow'; url: string; html: string }[] = [];
        let used = 0, truncated = html.length > max;
        const add = (kind: 'frame' | 'shadow', url: string, source: string) => {
          if (contexts.length >= 24 || used + source.length > 512000) { truncated = true; return; }
          used += source.length; contexts.push({ kind, url, html: source });
        };
        for (const el of Array.from(document.querySelectorAll('*')).slice(0, 20000)) {
          if (el.shadowRoot) add('shadow', document.baseURI, el.shadowRoot.innerHTML);
          if (el instanceof HTMLIFrameElement) {
            try { const d = el.contentDocument; if (d?.documentElement && new URL(d.URL).origin === location.origin) add('frame', d.URL, d.documentElement.outerHTML); } catch { /* Cross-origin frames remain inaccessible. */ }
          }
        }
        const images = Array.from(document.images).slice(0, 500).map(img => ({ url: img.currentSrc || img.src, width: Math.round(img.getBoundingClientRect().width), height: Math.round(img.getBoundingClientRect().height) }));
        return { html: html.slice(0, max), contexts, truncated, images };
      });
      evidence.rendered_html = captured.html; evidence.contexts = captured.contexts; evidence.image_dimensions = captured.images; evidence.truncated ||= captured.truncated;
      if (!evidence.rendered_html) throw new Error('Browser returned no rendered DOM.');
      if (input.options.captureScreenshots && !controller.signal.aborted) {
        try {
          const image = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false, timeout: 1800 });
          if (image.length <= 512000) evidence.screenshot = image.toString('base64'); else evidence.notes.push('Screenshot exceeded its 500 KiB limit.');
        } catch { evidence.notes.push('Screenshot could not be captured within its deadline.'); }
      }
      if (evidence.settled === 'timeout') evidence.notes.push('DOM did not reach stability before the settling budget; this is a bounded snapshot.');
      evidence.duration_ms = Date.now() - started; this.uses++;
      return evidence;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(deadline); input.signal.removeEventListener('abort', relay);
      controller.abort(new Error('Browser page cleanup.'));
      await Promise.allSettled([...requests]);
      if (context) { await context.close().catch(() => {}); this.contexts.delete(context); }
      controller.signal.removeEventListener('abort', abortContext);
      this.release();
      if (this.uses >= 40 && this.active === 0 && this.browser) { const old = this.browser; this.browser = undefined; await old.close().catch(() => {}); }
    }
  }
  async close(): Promise<void> {
    this.stopped = true; for (const wake of this.waiters) wake();
    await Promise.allSettled([...this.contexts].map(context => context.close()));
    if (this.opening) await this.opening.catch(() => {});
    await this.browser?.close().catch(() => {}); this.browser = undefined;
    if (this.denyProxy) { this.denyProxy.closeAllConnections(); await new Promise<void>(resolve => this.denyProxy!.close(() => resolve())); this.denyProxy = undefined; }
  }
}
