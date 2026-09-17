/** Bounded connection check uses the same engine/policies as a crawl, but saves no history or screenshots. */
import { runCrawl } from '../engine.js';
import { httpURL } from '../url.js';
import type { CrawlFailure } from '../types.js';
export interface ConnectionReport {
  url: string; effectiveURL: string; outcome: 'ready' | 'access-needed' | 'failed';
  title: string; message: string; guidance: string; durationMs: number; requests: number;
  checks: { stage: string; url: string; status: number | null; state: string; detail: string }[];
  problem?: CrawlFailure; recommendsBrowser: boolean;
}
export async function checkConnection(input: unknown, transport: typeof fetch, signal?: AbortSignal): Promise<ConnectionReport> {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a valid website URL.');
  const url = httpURL(/^[a-z][a-z\d+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  let requests = 0;
  const result = await runCrawl(url, { mode: 'http', maxPages: 1, maxDepth: 0, maxConcurrency: 1, retries: 0, timeoutMs: 7000,
    maxDurationMs: 20000, delayMs: 200, discoverSitemaps: false, maxBodyBytes: 2 * 1024 * 1024, captureScreenshots: false }, {
    signal, fetchImpl: async (u, init) => { if (requests >= 10) throw new Error('Connection-check request budget reached.'); requests++; return transport(u, init); }
  });
  const page = Object.values(result.pages)[0], robots = result.discovery!.robots, problem = result.errors[0];
  const denied = problem?.kind === 'access-challenge' || [401, 403].includes(problem?.status_code ?? 0) || [401, 403].includes(robots.status ?? 0);
  const guidance = problem?.guidance ?? (problem?.kind === 'tls' ? 'Check your certificate chain and system clock. TLS verification has not been disabled.' : problem?.kind === 'dns' ? 'Verify the hostname and WSL DNS connection. Both validated IPv4 and IPv6 addresses are attempted.' : robots.skipped.length || denied ? 'Review robots.txt and the site-owner access configuration. Exclusions are not ignored.' : 'Open the request details or Activity. Check that the site is reachable from this computer.');
  return { url, effectiveURL: page?.url ?? result.effective_start_url ?? url,
    outcome: page ? 'ready' : denied ? 'access-needed' : 'failed', title: page ? 'Ready to crawl' : denied ? 'Site-owner access needed' : 'Connection needs attention',
    message: page ? `Read ${page.title || 'the starting page'} successfully.` : problem?.message ?? robots.error ?? result.warnings[0] ?? 'No HTML page could be collected.',
    guidance: page ? (page.inspection?.render_signals.length ? 'Smart Hybrid can render the application shell with Chromium.' : 'Fast HTTP can read the starting page; Smart Hybrid will render additional pages only when needed.') : guidance,
    durationMs: result.duration_ms, requests, recommendsBrowser: !!page?.inspection?.render_signals.length,
    checks: [{ stage: 'Robots policy', url: robots.url, status: robots.status, state: robots.error || robots.skipped.length || [401, 403].includes(robots.status ?? 0) ? 'Review' : 'Checked', detail: robots.error ?? `${robots.skipped.length} URL(s) excluded` },
      { stage: 'Starting page', url: page?.url ?? result.effective_start_url ?? url, status: page?.status_code ?? (problem?.stage === 'page' ? problem.status_code ?? null : null), state: page ? 'Readable' : problem?.stage === 'page' ? 'Unavailable' : 'Not requested', detail: page ? `${page.content_bytes} HTML bytes · ${page.outgoing_links.length} links` : problem?.message ?? 'Waiting for a valid robots policy' }],
    ...(problem ? { problem } : {}) };
}
