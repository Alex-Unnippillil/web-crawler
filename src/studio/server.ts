import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Jobs } from './jobs.js';
import { renderCSV, renderHTML, renderGraph } from '../report.js';
import type { CrawlHooks } from '../types.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MAX_BODY = 16 * 1024;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
async function body(req: IncomingMessage): Promise<unknown> {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('Send application/json.');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request body exceeds 16 KB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON.'); }
}
function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
}
function openBrowser(url: string): void {
  // Arguments are fixed application URLs, never user-provided crawl targets.
  const isWSL = !!process.env.WSL_DISTRO_NAME;
  const command = process.platform === 'win32' || isWSL ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = command === 'cmd.exe' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true }); child.on('error', () => {}); child.unref();
}
export async function startStudio(config: { port?: number; directory?: string; open?: boolean; hooks?: CrawlHooks; assets?: string } = {}) {
  const token = randomBytes(32).toString('hex');
  const store = new Jobs(config.directory ?? process.env.CRAWLER_DATA_DIR ?? join(homedir(), '.web-crawler-studio'), config.hooks);
  await store.init();
  let port = config.port ?? 4310;
  let shutdown = false;
  const assets = config.assets ?? ROOT;
  const server = createServer(async (req, res) => {
    for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
    try {
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host ?? '')) { send(res, 403, { error: 'Unrecognized host. Open the localhost address printed in your terminal.' }); return; }
      const expectedOrigin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== expectedOrigin) { send(res, 403, { error: 'Cross-origin requests are not allowed.' }); return; }
      if (req.headers['sec-fetch-site'] === 'cross-site') { send(res, 403, { error: 'Cross-site requests are not allowed.' }); return; }
      const url = new URL(req.url ?? '/', expectedOrigin);
      if (url.pathname.startsWith('/api/')) {
        const received = Buffer.from(String(req.headers['x-crawler-token'] ?? ''));
        const secret = Buffer.from(token);
        if (received.length !== secret.length || !timingSafeEqual(received, secret)) { send(res, 403, { error: 'Session expired. Refresh this page.' }); return; }
        if (url.pathname === '/api/state' && req.method === 'GET') { send(res, 200, { jobs: store.list(), busy: store.busy(), dataDirectory: store.directory, version: '3.0.0' }); return; }
        if (url.pathname === '/api/jobs' && req.method === 'POST') { send(res, 201, await store.start(await body(req))); return; }
        const match = /^\/api\/jobs\/([a-f0-9-]{36})(?:\/(pause|resume|stop|export))?$/.exec(url.pathname);
        if (match) {
          const id = match[1]!; const action = match[2];
          if (!action && req.method === 'GET') {
            const job = await store.get(id);
            const etag = `"${job.id}-${job.revision}"`;
            res.setHeader('ETag', etag);
            if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); } else send(res, 200, job);
            return;
          }
          if (!action && req.method === 'DELETE') { await store.delete(id); send(res, 200, { ok: true }); return; }
          if (action && ['pause', 'resume', 'stop'].includes(action) && req.method === 'POST') { send(res, 200, store.control(id, action)); return; }
          if (action === 'export' && req.method === 'GET') {
            const job = await store.get(id); const result = job.result;
            if (!result) throw new Error('This crawl has no results to export yet.');
            // Clone so a partial export does not mutate the running job.
            const snapshot = { ...result, finished_at: result.finished_at || new Date().toISOString() };
            const format = url.searchParams.get('format') ?? 'json';
            let content: string; let mime: string;
            if (format === 'json') { content = JSON.stringify(Object.values(snapshot.pages), null, 2); mime = 'application/json'; }
            else if (format === 'full') { content = JSON.stringify(snapshot, null, 2); mime = 'application/json'; }
            else if (format === 'csv') { content = renderCSV(snapshot.pages); mime = 'text/csv'; }
            else if (format === 'html') { content = renderHTML(snapshot); mime = 'text/html'; }
            else if (format === 'svg') { content = renderGraph(snapshot); mime = 'image/svg+xml'; }
            else throw new Error('Unsupported export format.');
            res.setHeader('Content-Disposition', `attachment; filename="crawl-${job.createdAt.slice(0, 10)}-${job.id.slice(0, 8)}.${format === 'full' ? 'full.json' : format}"`);
            res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(content); return;
          }
        }
        send(res, 404, { error: 'API endpoint not found.' }); return;
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) { send(res, 405, { error: 'Method not allowed.' }); return; }
      const staticFiles: Record<string, [string, string]> = {
        '/': ['ui/index.html', 'text/html'], '/index.html': ['ui/index.html', 'text/html'],
        '/app.js': ['ui-dist/app.js', 'text/javascript'], '/styles.css': ['ui/styles.css', 'text/css'],
        '/favicon.svg': ['ui/favicon.svg', 'image/svg+xml'],
      };
      const file = staticFiles[url.pathname];
      if (!file) { send(res, 404, { error: 'Not found.' }); return; }
      let data = await readFile(resolve(assets, file[0]));
      if (file[1] === 'text/html') data = Buffer.from(data.toString().replace('__SESSION_TOKEN__', token));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      const message = error instanceof Error ? error.message : String(error);
      send(res, message.includes('not found') ? 404 : message.includes('Another crawl') ? 409 : 400, { error: message });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 3000;
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolveListen(); });
  });
  port = (server.address() as { port: number }).port;
  const address = `http://localhost:${port}`;
  const close = async () => {
    if (shutdown) return; shutdown = true;
    await store.close(); server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  };
  if (config.open) openBrowser(address);
  return { address, port, close, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = process.argv.find(arg => arg.startsWith('--port='));
  const port = Number(argument?.slice(7) ?? process.env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('Port must be between 1024 and 65535.'); process.exitCode = 1; }
  else startStudio({ port, open: !process.argv.includes('--no-open') }).then(app => {
    console.log(`\n  WEB CRAWLER STUDIO\n  Open ${app.address}\n  Saved locally in ${app.store.directory}\n  Keep this window open. Ctrl+C closes the app and saves partial results.\n`);
    const stop = () => { void app.close().then(() => { process.exitCode = 0; }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4310 is in use. Open the existing app, or run npm run gui -- --port=4311.' : error.message); process.exitCode = 1; });
}
