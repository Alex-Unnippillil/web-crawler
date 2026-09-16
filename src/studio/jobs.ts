import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runCrawl } from '../engine.js';
import { validateOptions } from '../options.js';
import { httpURL } from '../url.js';
import { publicFetch } from './network.js';
import { startDemoSite } from './demo.js';
import type { CrawlResult, CrawlOptions, CrawlHooks } from '../types.js';

export type JobStatus = 'running' | 'paused' | 'stopping' | 'completed' | 'stopped' | 'failed' | 'interrupted';
export interface JobMeta {
  id: string; name: string; url: string; demo: boolean; status: JobStatus; createdAt: string;
  finishedAt?: string; revision: number; pages: number; failures: number; durationMs: number;
  options: CrawlOptions; message?: string;
}
export interface Job extends JobMeta { result?: CrawlResult; logs: string[] }
const activeStatus = (s: JobStatus) => ['running', 'paused', 'stopping'].includes(s);
const validID = (id: string) => /^[a-f0-9-]{36}$/.test(id);

export class Jobs {
  private metadata = new Map<string, JobMeta>();
  private current?: Job;
  private controller?: AbortController;
  private completion?: Promise<void>;
  private waiters = new Set<() => void>();
  private starting = false;
  private saves: Promise<void> = Promise.resolve();
  private lastSave = 0;
  constructor(readonly directory: string, private testHooks: CrawlHooks = {}) {}
  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of (await readdir(this.directory)).filter(n => n.endsWith('.meta.json'))) {
      try {
        const meta = JSON.parse(await readFile(join(this.directory, name), 'utf8')) as JobMeta;
        if (!validID(meta.id) || name !== `${meta.id}.meta.json`) continue;
        if (activeStatus(meta.status)) { meta.status = 'interrupted'; meta.message = 'The app closed during this crawl. Checkpointed results are available; rerun to start again.'; }
        this.metadata.set(meta.id, meta);
      } catch { /* Ignore corrupt metadata; do not delete user data. */ }
    }
  }
  list(): JobMeta[] { return [...this.metadata.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  busy(): boolean { return this.starting || !!this.current && activeStatus(this.current.status); }
  async get(id: string): Promise<Job> {
    if (!validID(id) || !this.metadata.has(id)) throw new Error('Crawl not found.');
    if (this.current?.id === id) return this.current;
    const path = join(this.directory, `${id}.json`);
    if ((await stat(path)).size > 80 * 1024 * 1024) throw new Error('Saved crawl exceeds the loading limit.');
    const job = JSON.parse(await readFile(path, 'utf8')) as Job;
    return { ...job, ...this.metadata.get(id)! };
  }
  private save(job: Job): void {
    // Snapshot immediately, serialize writes, and atomically replace each file.
    const { result: _result, logs: _logs, ...meta } = job;
    const data = JSON.stringify(job); const header = JSON.stringify(meta);
    this.saves = this.saves.then(async () => {
      for (const [name, content] of [[`${job.id}.json`, data], [`${job.id}.meta.json`, header]]) {
        const path = join(this.directory, name!); const temp = `${path}.tmp`;
        await writeFile(temp, content!, { mode: 0o600 }); await rename(temp, path);
      }
    }).catch(error => { job.message = `Could not save to disk: ${String(error)}. Export this crawl before closing.`; job.revision++; });
  }
  private changed(job: Job): void {
    job.revision++;
    job.pages = job.result?.summary.pages_crawled ?? 0;
    job.failures = job.result?.summary.failed ?? 0;
    job.durationMs = job.result?.duration_ms ?? 0;
    const { result: _result, logs: _logs, ...meta } = job;
    this.metadata.set(job.id, meta);
    if (Date.now() - this.lastSave > 2500) { this.lastSave = Date.now(); this.save(job); }
  }
  async start(body: unknown): Promise<Job> {
    if (this.busy()) throw new Error('Another crawl is active. Stop it before starting a new one.');
    if (this.metadata.size >= 30) throw new Error('History holds up to 30 crawls. Export and delete an old crawl first.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid crawl configuration.');
    const input = body as Record<string, unknown>;
    if (typeof input.demo !== 'undefined' && typeof input.demo !== 'boolean') throw new Error('demo must be a boolean.');
    const raw = input.options ?? {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid options.');
    const options = validateOptions({ ...(raw as Partial<CrawlOptions>), respectRobots: true, userAgent: 'CrawlerStudio/3.0', maxLinksPerPage: 500, maxBodyBytes: 2 * 1024 * 1024 });
    if (options.maxPages > 500 || options.maxConcurrency > 8 || options.delayMs < 100 || options.maxDurationMs > 3600000) {
      throw new Error('GUI limits: 500 URLs, 8 workers, at least 100 ms between requests, and a 60-minute deadline.');
    }
    this.starting = true;
    let demo: Awaited<ReturnType<typeof startDemoSite>> | undefined;
    try {
      if (input.demo === true) demo = await startDemoSite();
      const url = demo?.url ?? httpURL(String(input.url ?? ''));
      if (url.length > 2048) throw new Error('URL is too long.');
      const job: Job = {
        id: randomUUID(), name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 100) : demo ? 'Fieldnotes · local demo' : new URL(url).hostname,
        url, demo: !!demo, status: 'running', createdAt: new Date().toISOString(), revision: 0,
        pages: 0, failures: 0, durationMs: 0, options, logs: [],
      };
      this.current = job; this.controller = new AbortController(); this.changed(job); this.save(job);
      const localDemo = demo;
      const measured = new Set<string>(); let capturedBytes = 0;
      this.completion = runCrawl(url, options, {
        ...this.testHooks, signal: this.controller.signal,
        fetchImpl: localDemo ? fetch : this.testHooks.fetchImpl ?? publicFetch,
        onLog: message => { job.logs.push(`${new Date().toISOString().slice(11, 19)}  ${message}`); if (job.logs.length > 250) job.logs.shift(); },
        onProgress: result => {
          job.result = result;
          for (const [key, page] of Object.entries(result.pages)) if (!measured.has(key)) {
            measured.add(key); capturedBytes += Buffer.byteLength(JSON.stringify(page));
          }
          if (capturedBytes > 32 * 1024 * 1024) this.controller?.abort(new Error('The GUI result budget (32 MiB of page records) was reached. Export these partial results, then narrow the scope.'));
          this.changed(job);
        },
        beforeRequest: signal => new Promise<void>((resolve, reject) => {
          if (signal.aborted) { reject(signal.reason); return; }
          if (job.status !== 'paused') { resolve(); return; }
          const resume = () => { this.waiters.delete(resume); signal.removeEventListener('abort', cancel); resolve(); };
          const cancel = () => { this.waiters.delete(resume); reject(signal.reason); };
          this.waiters.add(resume); signal.addEventListener('abort', cancel, { once: true });
        }),
      }).then(result => {
        job.result = result;
        job.status = result.summary.stopped ? 'stopped' : result.summary.pages_crawled ? 'completed' : 'failed';
        if (job.status === 'failed') job.message = result.errors[0]?.message ?? 'No HTML pages were collected. Check the URL, robots.txt policy and network connection.';
      }).catch(error => { job.status = 'failed'; job.message = error instanceof Error ? error.message : String(error); })
        .finally(async () => { localDemo?.close(); job.finishedAt = new Date().toISOString(); this.changed(job); this.save(job); await this.saves; });
      return job;
    } catch (error) { demo?.close(); throw error; }
    finally { this.starting = false; }
  }
  control(id: string, action: string): Job {
    const job = this.current;
    if (!job || job.id !== id || !activeStatus(job.status)) throw new Error('This crawl is not active.');
    if (action === 'pause' && job.status === 'running') job.status = 'paused';
    else if (action === 'resume' && job.status === 'paused') { job.status = 'running'; for (const resume of this.waiters) resume(); }
    else if (action === 'stop') { job.status = 'stopping'; this.controller?.abort(new Error('Stopped by user. Partial results were saved.')); }
    else throw new Error('That action is not available for this crawl.');
    this.changed(job); this.save(job); return job;
  }
  async delete(id: string): Promise<void> {
    if (!validID(id) || !this.metadata.has(id)) throw new Error('Crawl not found.');
    if (this.current?.id === id && this.busy()) throw new Error('Stop the active crawl before deleting it.');
    await this.saves;
    for (const suffix of ['.json', '.meta.json']) await unlink(join(this.directory, `${id}${suffix}`)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    this.metadata.delete(id); if (this.current?.id === id) this.current = undefined;
  }
  async close(): Promise<void> { this.controller?.abort(new Error('Application closed. Partial results were saved.')); await this.completion; await this.saves; }
}
