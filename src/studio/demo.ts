// Repository note: Creates the built-in local demonstration website used to explore Studio without contacting an external site.
// Hosts the self-contained demo website used to exercise the GUI without crawling the public web.

import { createServer } from 'node:http';
import { once } from 'node:events';

/** A real, deterministic HTML site. Deliberate defects make the issue inspector useful. */
export async function startDemoSite() {
  const site: Record<string, [string, string, string[]]> = {
    '/': ['Fieldnotes — Documentation', 'A tiny website for your first crawl.', ['/guides', '/journal', '/about', '/contact']],
    '/guides': ['Guides', 'Practical guides for thoughtful software.', ['/guides/getting-started', '/guides/crawling', '/guides/reports', '/']],
    '/guides/getting-started': ['Getting started', 'Start small. Inspect the results. Refine your scope.', ['/guides/crawling', '/guides/reports']],
    '/guides/crawling': ['Crawl responsibly', 'Respect robots.txt and the site you are visiting.', ['/private', '/guides', 'https://example.com/']],
    '/guides/reports': ['Exporting reports', 'Save JSON, CSV, HTML and a link map.', ['/guides/getting-started']],
    '/journal': ['Journal', 'Notes on building useful tools.', ['/journal/reliability', '/journal/testing', '/old-guide']],
    '/journal/reliability': ['Reliability matters', 'Clear failure messages are part of a good interface.', ['/journal/testing', '/']],
    '/journal/testing': ['Testing the edges', '', ['/guides/getting-started', '/missing-page']],
    '/about': ['About Fieldnotes', 'This site runs on your computer; it is a demonstration, not a real business.', ['/contact', 'https://www.typescriptlang.org/']],
    '/contact': ['', 'A page intentionally missing a title and H1, for testing.', ['/']],
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    if (path === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('User-agent: *\nDisallow: /private\n'); return; }
    if (path === '/old-guide') { res.writeHead(301, { Location: '/guides/getting-started' }); res.end(); return; }
    const page = site[path];
    if (!page) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>Not found</h1>'); return; }
    const [title, description, links] = page;
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><title>${title}</title>${description ? `<meta name="description" content="${description}">` : ''}</head><body>${title ? `<h1>${title}</h1>` : ''}<main><p>${description}</p></main><nav>${links.map(link => `<a href="${link}">${link}</a>`).join(' ')}</nav><img src="/illustration.svg" alt="Demo illustration"></body></html>`);
    }, 140);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/`, close: () => { server.closeAllConnections(); server.close(); } };
}
