// Repository note: Exercises the local Studio API, security boundaries, history, controls, and exports.
// Integration tests for the Studio API, history, controls, exports, and network protections.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { startStudio } from '../dist/studio/server.js';
import { isPublicAddress } from '../dist/studio/network.js';
import { Jobs } from '../dist/studio/jobs.js';

// Fixture-specific parser isolates server/controller tests from the HTML parser.
// The existing Vitest suite and npm run demo independently test the real jsdom pipeline.
export function fixtureExtract(html, url) {
  const text = pattern => pattern.exec(html)?.[1] ?? '';
  return { url, title: text(/<title>(.*?)<\/title>/), heading: text(/<h1>(.*?)<\/h1>/),
    description: text(/name="description" content="([^"]*)"/), first_paragraph: text(/<p>(.*?)<\/p>/),
    outgoing_links: [...html.matchAll(/<a href="([^"]+)"/g)].map(m => new URL(m[1], url).href),
    image_urls: [...html.matchAll(/<img src="([^"]+)"/g)].map(m => new URL(m[1], url).href) };
}
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'crawler-studio-'));
  const app = await startStudio({ port: 0, directory, hooks: { extract: fixtureExtract } });
  const url = `http://127.0.0.1:${app.port}`;
  const html = await (await fetch(url)).text();
  const token = /name="session-token" content="([a-f0-9]+)"/.exec(html)[1];
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const api = (path, method = 'GET', data, extra = {}) => fetch(`${url}${path}`, { method, headers: { 'X-Crawler-Token': token, 'Content-Type': 'application/json', ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { app, url, api, token, directory };
}
async function eventually(check, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error('Condition was not satisfied before timeout.');
}
for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.1.2.3', '198.18.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::', '3fff::1']) {
  test(`GUI denies private/reserved address ${address}`, () => assert.equal(isPublicAddress(address), false));
}
for (const address of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
  test(`GUI accepts public address ${address}`, () => assert.equal(isPublicAddress(address), true));
}
test('serves real interface with CSP and a session token', async t => {
  const { url, token } = await setup(t); const res = await fetch(url);
  assert.equal(res.status, 200); assert.equal(token.length, 64);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await res.text(), /Your website, revealed/);
  for (const path of ['/styles.css', '/app.js', '/favicon.svg']) assert.equal((await fetch(url + path)).status, 200);
});
test('API denies unauthenticated requests and unrecognized Host', async t => {
  const { url, api } = await setup(t);
  assert.equal((await fetch(url + '/api/state')).status, 403);
  const status = await new Promise((resolve, reject) => { const req = request(url + '/api/state', { headers: { Host: 'evil.example:4310' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(status, 403);
});
test('API denies cross-origin and cross-site requests even with token', async t => {
  const { api } = await setup(t);
  assert.equal((await api('/api/state', 'GET', undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('/api/state', 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});
test('static serving is allowlisted and never exposes local files', async t => {
  const { url, api } = await setup(t);
  for (const path of ['/package.json', '/.env', '/src/studio/server.ts', '/..%2f..%2fetc%2fpasswd']) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await api('/api/jobs/../../etc/passwd')).status, 404);
});
test('validates options and body size before starting a job', async t => {
  const { api } = await setup(t);
  for (const input of [null, [], { demo: 'yes' }, { options: [] }, { url: 'file:///etc/passwd' }, { url: 'https://a:b@example.com' }, { url: 'https://example.com', options: { maxPages: 501 } }, { url: 'https://example.com', options: { maxConcurrency: 9 } }, { url: 'https://example.com', options: { delayMs: 0 } }]) {
    assert.equal((await api('/api/jobs', 'POST', input)).status, 400);
  }
  assert.equal((await api('/api/jobs', 'POST', { name: 'x'.repeat(18000) })).status, 400);
});
test('real local demo completes, exports work, and history survives restart', async t => {
  const { api, app, directory } = await setup(t);
  const response = await api('/api/jobs', 'POST', { demo: true, options: { maxPages: 50, delayMs: 100, retries: 0 } });
  assert.equal(response.status, 201); const job = await response.json();
  let saved;
  await eventually(async () => { saved = await (await api(`/api/jobs/${job.id}`)).json(); return saved.status === 'completed'; });
  assert.equal(saved.pages, 10); assert.equal(saved.failures, 1); assert.equal(saved.result.summary.unique_external_links, 2);
  assert.equal(saved.result.skipped.robots, 1);
  for (const format of ['json', 'full', 'csv', 'html', 'svg']) {
    const exportRes = await api(`/api/jobs/${job.id}/export?format=${format}`);
    assert.equal(exportRes.status, 200); assert.match(exportRes.headers.get('content-disposition'), /^attachment;/);
    const output = await exportRes.text(); assert.ok(output.length > 100);
    if (format === 'json') { const records = JSON.parse(output); assert.equal(records.length, 10); assert.ok('first_paragraph' in records[0]); }
    if (format === 'full') assert.equal(JSON.parse(output).schema_version, 1);
  }
  assert.equal((await api(`/api/jobs/${job.id}/export?format=exe`)).status, 400);
  await app.store.close();
  const restored = new Jobs(directory); await restored.init();
  assert.equal(restored.list()[0].id, job.id); assert.equal((await restored.get(job.id)).pages, 10);
  const disk = JSON.parse(await readFile(join(directory, `${job.id}.json`), 'utf8')); assert.equal(disk.status, 'completed');
  assert.equal((await api(`/api/jobs/${job.id}`, 'DELETE')).status, 200);
  assert.equal((await api(`/api/jobs/${job.id}`)).status, 404);
  assert.equal((await readdir(directory)).filter(n => n.endsWith('.json')).length, 0);
});
test('pause stops new requests, resume proceeds, stop keeps partial results', async t => {
  const { api } = await setup(t);
  const job = await (await api('/api/jobs', 'POST', { demo: true, options: { delayMs: 250 } })).json();
  assert.equal((await api('/api/jobs', 'POST', { demo: true })).status, 409);
  assert.equal((await api(`/api/jobs/${job.id}`, 'DELETE')).status, 400);
  await eventually(async () => (await (await api(`/api/jobs/${job.id}`)).json()).pages >= 1);
  const paused = await (await api(`/api/jobs/${job.id}/pause`, 'POST')).json(); assert.equal(paused.status, 'paused');
  await new Promise(resolve => setTimeout(resolve, 550));
  const first = await (await api(`/api/jobs/${job.id}`)).json();
  await new Promise(resolve => setTimeout(resolve, 300));
  const second = await (await api(`/api/jobs/${job.id}`)).json();
  assert.equal(second.result.summary.requests, first.result.summary.requests);
  assert.equal((await (await api(`/api/jobs/${job.id}/resume`, 'POST')).json()).status, 'running');
  await api(`/api/jobs/${job.id}/stop`, 'POST');
  await eventually(async () => (await (await api(`/api/jobs/${job.id}`)).json()).status === 'stopped');
  const end = await (await api(`/api/jobs/${job.id}`)).json(); assert.ok(end.pages > 0); assert.equal(end.result.summary.stopped, true);
});
test('unchanged crawl uses ETag and invalid controls fail cleanly', async t => {
  const { api } = await setup(t);
  const job = await (await api('/api/jobs', 'POST', { demo: true, options: { delayMs: 100, maxPages: 1 } })).json();
  await eventually(async () => (await (await api(`/api/jobs/${job.id}`)).json()).status === 'completed');
  const res = await api(`/api/jobs/${job.id}`); const etag = res.headers.get('etag');
  assert.equal((await api(`/api/jobs/${job.id}`, 'GET', undefined, { 'If-None-Match': etag })).status, 304);
  assert.equal((await api(`/api/jobs/${job.id}/pause`, 'POST')).status, 400);
});
