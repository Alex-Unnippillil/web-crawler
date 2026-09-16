import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { runCrawl } from '../dist/engine.js';
import { writeReports } from '../dist/report.js';

// A reproducible, local HTML website. No internet access or third-party crawling.
const site = {
  '/': '<h1>Field Notes</h1><p>A small site for exploring the crawler.</p><a href="/guides">Guides</a><a href="/about">About</a><a href="/journal">Journal</a>',
  '/guides': '<h1>Practical guides</h1><main><p>Documentation and working examples.</p></main><a href="/guides/getting-started">Getting started</a><a href="/guides/robots">Robots policy</a><a href="/">Home</a>',
  '/about': '<h1>About Field Notes</h1><p>A deterministic test site, not a real business.</p><a href="/contact">Contact</a><a href="https://example.com/">External reference</a><img src="/logo.svg">',
  '/journal': '<h1>The journal</h1><p>Notes on reliable software.</p><a href="/journal/reliability">Reliability</a><a href="/journal/testing">Testing</a>',
  '/contact': '<h1>Contact</h1><p>No messages are submitted by the crawler.</p><a href="/">Home</a>',
  '/guides/getting-started': '<h1>Getting started</h1><p>Install, test, and run.</p><a href="/guides/robots">Crawl respectfully</a>',
  '/guides/robots': '<h1>Robots policy</h1><p>Respect the boundaries of each site.</p><a href="/private">Disallowed</a><a href="/guides">All guides</a>',
  '/journal/reliability': '<h1>Reliability matters</h1><p>Bounded retries and clear diagnostics.</p><a href="/journal/testing">Testing</a>',
  '/journal/testing': '<h1>Test the unhappy paths</h1><p>Failures must never look like successes.</p><a href="/guides/getting-started">Get started</a>',
};
const server = createServer((req, res) => {
  if (req.url === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('User-agent: *\nDisallow: /private\n'); return; }
  const page = site[req.url];
  if (!page) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>Field Notes · ${req.url}</title><meta name="description" content="Local crawler fixture"></head><body>${page}</body></html>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const url = `http://127.0.0.1:${server.address().port}/`;
  const result = await runCrawl(url, { maxPages: 30, delayMs: 0, retries: 0 });
  assert.equal(result.summary.pages_crawled, 9, 'The complete parser/HTTP pipeline must collect all nine fixture pages.');
  assert.equal(result.summary.unique_external_links, 1);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.skipped.robots, 1);
  for (const filename of writeReports(result, 'reports/demo.json')) console.log(filename);
  console.log('Local end-to-end demo passed: 9 HTML pages, 1 external link, robots respected.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
