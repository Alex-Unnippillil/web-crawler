/** Finite local test/demo site: static HTML, hydration, JS navigation, structured data,
 * lazy content, same-origin frames, shadow roots, robots and nested sitemaps.
 * Nothing here contacts a third-party service or submits a form.
 */
import { createServer } from 'node:http';

export async function startHybridDemoSite() {
  let base = '';
  const words = 'This documentation page contains server rendered information about careful website inspection, bounded crawling, accessible navigation, resource analysis and useful local reports. '.repeat(4);
  const shell = (title: string, body: string, scripts = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="A local website for testing hybrid crawling."><link rel="stylesheet" href="/theme.css"></head><body><header><a href="/">Fieldnotes Lab</a></header>${body}${scripts}</body></html>`;
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', base || 'http://localhost').pathname;
    if (path === '/robots.txt') { res.setHeader('Content-Type', 'text/plain'); res.end(`User-agent: *\nDisallow: /private\nSitemap: ${base}/sitemap.xml\n`); return; }
    if (path === '/sitemap.xml') { res.setHeader('Content-Type', 'application/xml'); res.end(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${base}/pages.xml</loc></sitemap></sitemapindex>`); return; }
    if (path === '/pages.xml') { res.setHeader('Content-Type', 'application/xml'); res.end(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/app', '/sitemap-only', '/old'].map(p => `<url><loc>${base}${p}</loc><lastmod>2026-09-01</lastmod><changefreq>weekly</changefreq></url>`).join('')}</urlset>`); return; }
    if (path === '/old') { res.writeHead(301, { Location: '/guide' }); res.end(); return; }
    if (path === '/api/products') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ name: 'Hybrid field guide', price: '$24.00' })); return; }
    if (path === '/theme.css') { res.setHeader('Content-Type', 'text/css'); res.end('body{margin:40px auto;max-width:860px;background:#f4f6f9;color:#22334d;font:17px/1.6 system-ui}header{border-bottom:1px solid #b9c6d5;padding:16px 0}a{color:#175fa1;margin-right:18px}article{background:white;padding:24px;border-radius:8px}h1{font-size:36px}img{width:180px;height:110px}'); return; }
    if (path === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`(async()=>{const product=await(await fetch('/api/products')).json();document.title='Fieldnotes — rendered catalogue';document.querySelector('meta[name=description]').content='Product content and links rendered by JavaScript.';document.querySelector('#root').innerHTML='<article><h1>JavaScript product catalogue</h1><p>Rendered content loaded from a local JSON endpoint. Inspect the before and after source to understand the JavaScript changes.</p><p class="product-price">'+product.price+'</p><a href="/products/guide">'+product.name+'</a><a href="/guide">Read the guide</a><img src="/cover.svg" alt="Field guide cover" loading="lazy"><div id="component"></div><iframe title="Local component" src="/frame"></iframe></article><div style="height:1100px">Scroll to discover more</div><div id="lazy"></div>';const root=document.querySelector('#component').attachShadow({mode:'open'});root.innerHTML='<h2>Shadow component</h2><a href="/shadow-page">Shadow navigation</a>';const ld=document.createElement('script');ld.type='application/ld+json';ld.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:product.name,offers:{'@type':'Offer',price:'24.00',priceCurrency:'CAD'}});document.head.append(ld);const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){document.querySelector('#lazy').innerHTML='<a href="/lazy-page">Lazy loaded guide</a>';observer.disconnect();}});observer.observe(document.querySelector('#lazy'));console.warn('Intentional demo warning: inspect the console evidence.');})();`); return;
    }
    if (path === '/cover.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="110"><rect width="180" height="110" fill="#245b86"/><text x="20" y="60" fill="white" font-size="18">FIELDNOTES</text></svg>'); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (path === '/') res.end(shell('Fieldnotes inspection lab', `<h1>Hybrid crawler lab</h1><p>${words}</p><a href="/app">JavaScript catalogue</a><a href="/guide">Static guide</a><a href="/missing">Intentional broken link</a><a href="/private">Robots exclusion</a>`));
    else if (path === '/app') res.end(shell('Fieldnotes — source shell', '<div id="root"></div><noscript>Enable JavaScript to read the catalogue.</noscript>', '<script src="/app.js"></script>'));
    else if (path === '/frame') res.end(shell('Frame', '<h2>Embedded same-origin information</h2><a href="/frame-page">Frame navigation</a>'));
    else if (['/guide', '/products/guide', '/sitemap-only', '/shadow-page', '/frame-page', '/lazy-page'].includes(path)) res.end(shell(`Fieldnotes ${path}`, `<h1>${path.slice(1)}</h1><p>${words}</p><a href="/">Home</a><form action="/search" method="get"><label>Search <input name="q" type="search" required autocomplete="off"></label></form>`));
    else { res.statusCode = 404; res.end(shell('Not found', '<h1>Intentional missing page</h1>')); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { url: `${base}/`, close: () => { server.closeAllConnections(); server.close(); } };
}
