/** Local-only vertical tests for extraction, discovery, rendering, storage and safety.
 * Browser tests run when Chromium exists. REQUIRE_BROWSER=1 makes missing Chromium fatal.
 * Only controlled local fixtures use the code-level test launch hook; production remains sandboxed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { startDenyProxy } from '../dist/crawler/browser.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { runCrawl } from '../dist/engine.js';
import { parseCLI } from '../dist/cli.js';
import { extractPageDetails } from '../dist/extract.js';
import { validateOptions } from '../dist/options.js';
import { parseSitemap, discoverSitemaps, robotsSitemaps } from '../dist/crawler/sitemap.js';
import { boundedBytes } from '../dist/crawler/body.js';
import { compareRendering } from '../dist/analysis/javascript.js';
import { publicFetch } from '../dist/studio/network.js';
import { startHybridDemoSite } from '../dist/studio/hybrid-demo.js';
import { EvidenceStore } from '../dist/studio/evidence.js';
import { startStudio } from '../dist/studio/server.js';
import { datasets, filteredRows } from '../ui-dist/workbench-model.js';

const executable = process.env.CHROMIUM_EXECUTABLE || chromium.executablePath();
const hasBrowser = existsSync(executable);
if (process.env.REQUIRE_BROWSER === '1') assert.ok(hasBrowser, 'Required Chromium is missing. Run npm run browser:install.');
const browserTest = (name, fn) => test(name, { skip: !hasBrowser, timeout: 45000 }, fn);
const launch = options => chromium.launch({ ...options, executablePath: executable,
  // Container root cannot create a sandbox. This test-only hook never accepts a user's URL.
  ...(process.platform === 'linux' && process.getuid?.() === 0 ? { chromiumSandbox: false } : {}) });
const opts = { delayMs: 0, retries: 0, maxPages: 20, timeoutMs: 3000, renderTimeoutMs: 12000, captureScreenshots: false };
async function site(t, handler) {
  const server = createServer(handler); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{ server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
function transport(origin) { return (url, init) => new URL(url).origin === origin ? fetch(url, init) : publicFetch(url, init); }

test('Smart detection does not render a content-rich SSR page only because Next.js is present',()=>{
  const p=extractPageDetails(`<html><body><main><h1>Guide</h1><p>${'Readable documentation. '.repeat(100)}</p><a href="/one">One</a><a href="/two">Two</a></main><script src="/_next/main.js"></script></body></html>`,'https://example.com/');
  assert.deepEqual(p.inspection.render_signals,[]);assert.equal(p.inspection.technologies[0].name,'Next.js');
});
test('HTML extraction captures metadata, typed JSON-LD, form labels and bounded rules without execution',()=>{
  const p=extractPageDetails(`<html lang="fr"><head><meta property="og:title" content="Item"><meta name="author" content="Someone"><link rel="alternate" hreflang="en" href="/en"></head><body><h1>Item</h1><p class="price" data-id="42">$24</p><form action="/buy" method="post"><label>Quantity<input name="qty" required autocomplete="off" value="secret"></label></form><script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer"}}</script><script type="application/ld+json">not JSON</script><script>globalThis.bad=true</script></body></html>`, 'https://example.com/', [{name:'Price',selector:'.price',mode:'text'},{name:'ID',selector:'.price',mode:'attribute',attribute:'data-id'},{name:'bad',selector:'[',mode:'text'}]);
  assert.deepEqual(p.inspection.custom.Price,['$24']);assert.deepEqual(p.inspection.custom.ID,['42']);assert.equal(p.inspection.extraction_errors.length,1);
  assert.deepEqual(p.inspection.structured_data[0].types,['Product','Offer']);assert.equal(p.inspection.structured_data[1].valid,false);
  assert.equal(p.inspection.metadata['og:title'][0],'Item');assert.equal(p.inspection.hreflang[0].url,'https://example.com/en');
  assert.equal(p.elements.forms[0].fields[0].required,true);assert.equal(p.elements.forms[0].fields[0].label,'Quantity');
  assert.equal(JSON.stringify(p.elements.forms).includes('secret'),false);assert.equal(globalThis.bad,undefined);
});
test('Extraction options reject executable/oversized/duplicate rule configurations',()=>{
  for(const input of [{mode:'stealth'},{browserConcurrency:5},{scrollIterations:9},{renderTimeoutMs:999},{captureScreenshots:'yes'},{extractionRules:[{name:'x',selector:'p',mode:'eval'}]},{extractionRules:[{name:'x',selector:'p',mode:'attribute',attribute:'bad name'}]},{extractionRules:Array.from({length:13},(_,i)=>({name:`x${i}`,selector:'p',mode:'text'}))},{sitemapURLs:Array(11).fill('https://example.com/sitemap.xml')}])assert.throws(()=>validateOptions(input));
  assert.throws(()=>validateOptions({extractionRules:[{name:'x',selector:'p',mode:'text'},{name:'x',selector:'a',mode:'text'}]}));
  const cli=parseCLI(['https://example.com','--mode','smart','--sitemaps','--browser-workers','2','--scroll-iterations','2']);assert.equal(cli.options.mode,'smart');assert.equal(cli.options.discoverSitemaps,true);
});
test('Sitemap XML rejects DTDs and filters foreign/credential URLs',()=>{
  assert.throws(()=>parseSitemap('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><urlset/>','https://example.com/s.xml'));
  const r=parseSitemap('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a?x=1&amp;x=2</loc><lastmod>2026-01-01</lastmod></url><url><loc>https://evil.example/</loc></url><url><loc>https://u:p@example.com/</loc></url></urlset>','https://example.com/s.xml');
  assert.equal(r.urls.length,1);assert.equal(r.urls[0].url,'https://example.com/a?x=1&x=2');
  assert.deepEqual(robotsSitemaps('Sitemap: https://example.com/s.xml\nSitemap: https://other.example/x','https://example.com'),['https://example.com/s.xml']);
});
test('Nested sitemap discovery is deduplicated and bounded',async()=>{
  const requested=[];
  const r=await discoverSitemaps('https://example.com',[],async url=>{requested.push(url);return {url,status:200,text:url.endsWith('/sitemap.xml')?'<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap.xml</loc></sitemap></sitemapindex>':'<urlset><url><loc>https://example.com/page</loc></url><url><loc>https://example.com/page</loc></url></urlset>'};},new AbortController().signal);
  assert.equal(requested.length,2);assert.equal(r.urls.length,1);
});
test('Shared browser byte accounting cancels readers when an aggregate budget is exhausted',async()=>{
  let cancelled=false; const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.enqueue(new Uint8Array(8));},cancel(){cancelled=true;}}));
  let used=0;await assert.rejects(()=>boundedBytes(response,100,size=>{used+=size;if(used>10)throw new Error('aggregate budget');}),/aggregate/);assert.equal(cancelled,true);
});
test('Evidence store validates identifiers, persists across restart and deletes only its directory',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crawler-evidence-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const record={raw_html:'<p>raw</p>',rendered_html:'<p>rendered</p>',network:[],console:[],contexts:[],settled:'stable',duration_ms:1,truncated:false,notes:[]};
  const store=new EvidenceStore(join(dir,'evidence'));const id=await store.save('https://example.com',record);
  assert.match(id,/^[a-f0-9]{64}$/);assert.deepEqual(await new EvidenceStore(store.directory).read(id),record);await assert.rejects(()=>store.read('../../secrets'));
  assert.deepEqual(await readdir(store.directory),[`${id}.json`]);await store.delete();assert.deepEqual(await readdir(dir),[]);
});
test('JavaScript comparison and workbench filters retain differences without arbitrary scores',()=>{
  const raw=extractPageDetails('<h1>Before</h1><a href="/old">Old</a>','https://example.com/');const rendered=extractPageDetails('<h1>After</h1><p>Additional readable product information.</p><a href="/new">New</a>','https://example.com/');
  const d=compareRendering(raw,rendered);assert.deepEqual(d.added_links,['https://example.com/new']);assert.deepEqual(d.removed_links,['https://example.com/old']);assert.ok(d.metadata_changes.some(v=>v.field.toLowerCase().includes('h1')||v.field.toLowerCase().includes('heading')));
  const p={...rendered,requested_url:rendered.url,status_code:200,depth:0,duration_ms:10,content_bytes:100,internal_links:rendered.outgoing_links,external_links:[],rendering:{method:'browser',status:'rendered',reasons:['test'],comparison:d}};
  const index=datasets({result:{pages:{[p.url]:p},errors:[]},options:{}});
  assert.equal(filteredRows(index.javascript,'example',{Method:'BROWSER'},'URL',false).length,1);assert.equal(filteredRows(index.javascript,'no match',{},'',false).length,0);
});

browserTest('Smart mode renders only the SPA, captures shadow/iframe/lazy navigation, sitemap provenance and custom fields',async t=>{
  const fixture=await startHybridDemoSite();t.after(()=>fixture.close());let launches=0,peak=0;const browsers=[];let evidence;
  const result=await runCrawl(fixture.url,{...opts,mode:'smart',discoverSitemaps:true,scrollIterations:2,extractionRules:[{name:'Price',selector:'.product-price',mode:'text'}]},{fetchImpl:transport(new URL(fixture.url).origin),browserFactory:async options=>{launches++;const b=await launch(options);browsers.push(b);return b;},onProgress:r=>{peak=Math.max(peak,r.telemetry.browser_active);},onEvidence:async(url,record)=>{evidence=record;return 'a'.repeat(64);}});
  assert.equal(launches,1);assert.ok(peak<=2);assert.equal(result.telemetry.browser_pages,1);assert.ok(result.telemetry.http_pages>=6);assert.ok(browsers.every(b=>!b.isConnected()));
  const app=result.pages[new URL('/app',fixture.url).href];assert.equal(app.rendering.method,'browser');assert.ok(app.rendering.comparison.added_links.some(l=>l.endsWith('/lazy-page')));
  assert.ok(app.elements.links.some(l=>l.context?.startsWith('shadow')));assert.ok(app.elements.links.some(l=>l.context?.startsWith('frame')));
  assert.equal(app.inspection.custom.Price[0],'$24.00');assert.ok(app.inspection.structured_data.some(d=>d.types.includes('Product')));assert.equal(app.elements.images[0].rendered_width,180);
  assert.ok(evidence.network.some(r=>r.type==='fetch'&&r.url.endsWith('/api/products')));assert.ok(evidence.console.length);assert.ok(evidence.raw_html.includes('id="root"'));assert.ok(evidence.rendered_html.includes('product-price'));
  assert.equal(result.pages[new URL('/sitemap-only',fixture.url).href].discovery.method,'sitemap');assert.equal(result.discovery.sitemaps.length,2);assert.ok(result.discovery.robots.skipped.some(u=>u.endsWith('/private')));
});
browserTest('Full browser reuses one process and closes all contexts; HTTP mode never starts Chromium',async t=>{
  let base='';base=await site(t,(req,res)=>{res.setHeader('Content-Type',req.url==='/robots.txt'?'text/plain':'text/html');res.end(req.url==='/robots.txt'?'User-agent: *\nAllow: /':`<h1>Page</h1><a href="/one">One</a><a href="/two">Two</a>`);});
  let launches=0;const browsers=[];const hook={fetchImpl:transport(base),browserFactory:async options=>{launches++;const b=await launch(options);browsers.push(b);return b;}};
  const http=await runCrawl(base,{...opts,mode:'http',maxPages:3},hook);assert.equal(launches,0);assert.equal(http.summary.pages_crawled,3);
  const full=await runCrawl(base,{...opts,mode:'browser',maxPages:3,browserConcurrency:2},hook);assert.equal(launches,1);assert.equal(full.telemetry.browser_pages,3);assert.ok(browsers.every(b=>!b.isConnected()));
});
browserTest('Browser transport blocks private subresources, cross-origin frames, POST, WebSocket and private redirects',async t=>{
  let honey=0,writes=0;const forbidden=await site(t,(_req,res)=>{honey++;res.end('not reachable');});
  let base='';base=await site(t,(req,res)=>{
    if(req.method==='POST')writes++;
    if(req.url==='/robots.txt'){res.setHeader('Content-Type','text/plain');res.end('User-agent: *\nAllow: /');return;}
    if(req.url==='/redirect'){res.writeHead(302,{Location:`${forbidden}/secret`});res.end();return;}
    res.setHeader('Content-Type','text/html');res.end(`<h1>Security fixture</h1><img src="${forbidden}/image"><iframe src="${forbidden}/frame"></iframe><script>fetch('/write',{method:'POST'}).catch(()=>{});fetch('/redirect').catch(()=>{});fetch('${forbidden}/api').catch(()=>{});new WebSocket('${forbidden.replace('http:','ws:')}/socket');</script>`);
  });
  let evidence;const result=await runCrawl(base,{...opts,mode:'browser',maxPages:1},{fetchImpl:transport(base),browserFactory:launch,onEvidence:async(_u,e)=>{evidence=e;return 'a'.repeat(64);}});
  assert.equal(result.summary.pages_crawled,1);assert.equal(honey,0);assert.equal(writes,0);assert.ok(evidence.network.some(r=>r.error?.includes('Private')));assert.ok(evidence.network.some(r=>r.error?.includes('Only GET')));assert.ok(evidence.notes.some(n=>n.includes('WebSocket')));
});
browserTest('Browser cancellation interrupts queued resource pacing and closes the browser promptly',async t=>{
  const base=await site(t,(req,res)=>{res.setHeader('Content-Type',req.url==='/robots.txt'?'text/plain':req.url?.startsWith('/s')?'text/javascript':'text/html');res.end(req.url==='/robots.txt'?'User-agent: *\nAllow: /':req.url?.startsWith('/s')?'console.log("resource")':`<h1>Resources</h1>${Array.from({length:80},(_,i)=>`<script async src="/s${i}.js"></script>`).join('')}`);});
  const c=new AbortController();let b;let abortAt=0;
  const r=await runCrawl(base,{...opts,mode:'browser',maxPages:1,delayMs:100},{signal:c.signal,fetchImpl:transport(base),browserFactory:async o=>{b=await launch(o);setTimeout(()=>{abortAt=Date.now();c.abort(new Error('test cancellation'));},700);return b;}});
  assert.equal(r.summary.stopped,true);assert.ok(Date.now()-abortAt<5000,'Cancellation must not wait through all paced resources');assert.equal(b.isConnected(),false);
});
browserTest('GUI evidence API is authenticated, survives restart and never accepts arbitrary artifact paths',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'hybrid-api-test-'));let app=await startStudio({port:0,directory:dir,hooks:{browserFactory:launch}});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const connect=async()=>{const url=`http://127.0.0.1:${app.port}`;const html=await(await fetch(url)).text();const token=/name="session-token" content="([^"]+)"/.exec(html)[1];return {url,api:(path,method='GET',body)=>fetch(url+path,{method,headers:{'X-Crawler-Token':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})};};
  let client=await connect();const job=await(await client.api('/api/jobs','POST',{demo:true,hybrid:true,options:{mode:'smart',maxPages:12,delayMs:100,scrollIterations:1}})).json();
  let done;for(let i=0;i<250;i++){done=await(await client.api(`/api/jobs/${job.id}`)).json();if(['completed','failed','stopped'].includes(done.status))break;await sleep(100);}
  assert.equal(done.status,'completed');const rendered=Object.values(done.result.pages).find(p=>p.rendering?.artifact_id);assert.ok(rendered);
  const endpoint=`/api/jobs/${job.id}/evidence?url=${encodeURIComponent(rendered.url)}`;
  assert.equal((await fetch(client.url+endpoint)).status,403);assert.equal((await client.api(`/api/jobs/${job.id}/evidence?url=../../etc/passwd`)).status,400);
  const evidence=await(await client.api(endpoint)).json();assert.ok(evidence.rendered_html);assert.equal(evidence.screenshot,undefined);
  const image=await client.api(endpoint+'&format=screenshot');assert.equal(image.headers.get('content-type'),'image/jpeg');assert.equal((await image.arrayBuffer()).byteLength>100,true);
  await app.close();app=await startStudio({port:0,directory:dir,hooks:{browserFactory:launch}});client=await connect();assert.equal((await client.api(endpoint)).status,200);
});

browserTest('JavaScript navigation and document redirects preserve the rendered URL and decode source characters',async t=>{
  const base=await site(t,(req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/robots.txt'){res.setHeader('Content-Type','text/plain');res.end('User-agent: *\nAllow: /');}
    else if(req.url==='/'){res.end('<div id="root"></div><script>setTimeout(()=>location.href="/redirect",150)</script>');}
    else if(req.url==='/redirect'){res.writeHead(302,{Location:'/landing'});res.end();}
    else res.end('<h1>Crème café</h1><p>Rendered landing document</p>');});
  let evidence;const result=await runCrawl(base+'/',{...opts,mode:'smart',maxPages:1},{fetchImpl:transport(base),browserFactory:launch,onEvidence:async(_url,e)=>{evidence=e;return 'b'.repeat(64);}});
  assert.equal(result.summary.pages_crawled,1);assert.equal(result.pages[base+'/landing'].heading,'Crème café');
  assert.equal(result.pages[base+'/landing'].rendering.source_url,base+'/');assert.equal(evidence.final_url,base+'/landing');
  assert.ok(evidence.network.some(r=>r.status===302&&r.redirects.some(x=>x.to.endsWith('/landing'))));
});
test('Source diff is inert, preserves additions/removals and bounds minified inputs',async()=>{
  const {sourceDiff}=await import('../ui-dist/source-diff.js');const d=sourceDiff('<h1>Raw</h1>','<h1>Rendered</h1><script>malicious()</script>');
  assert.ok(d.lines.some(l=>l.kind==='removed'&&l.text.includes('Raw')));assert.ok(d.lines.some(l=>l.kind==='added'&&l.text.includes('Rendered')));
  const big=sourceDiff('<p>a</p>'.repeat(10000),'<p>b</p>'.repeat(10000));assert.equal(big.truncated,true);assert.ok(big.lines.length<=600);
});
test('Atlas distinguishes browser pages and sitemap-only evidence without inventing routes',async()=>{
  const {buildIndex,mapSubset,shortestRoute}=await import('../ui-dist/atlas-model.js');
  const root=extractPageDetails('<h1>Start</h1>','https://example.com/');const p={...root,requested_url:root.url,status_code:200,depth:0,duration_ms:1,content_bytes:1,internal_links:[],external_links:[],rendering:{method:'browser'}};
  const index=buildIndex({start_url:p.url,pages:{[p.url]:p},errors:[],discovery:{sitemap_urls:[{url:'https://example.com/isolated'}]}});
  assert.equal(index.byID.get('https://example.com/isolated').sitemapOnly,true);assert.deepEqual(shortestRoute(index,'https://example.com/isolated'),[]);
  assert.equal(mapSubset(index,{states:['page','discovered'],query:'',group:'',focus:'',limit:100,rendering:'browser'}).nodes.length,1);
});

test('Detached parser documents do not leak base URLs, rules or elements between pages',()=>{
  const first=extractPageDetails('<base href="https://one.example/docs/"><link rel="canonical" href="guide"><h1>First</h1><a href="child">Child</a>','https://one.example/',[{name:'Heading',selector:'h1',mode:'text'}]);
  const second=extractPageDetails('<link rel="canonical" href="guide"><h1>Second</h1><a href="child">Child</a>','https://two.example/start/',[{name:'Heading',selector:'h1',mode:'text'}]);
  assert.equal(first.canonical_url,'https://one.example/docs/guide');assert.equal(second.canonical_url,'https://two.example/start/guide');
  assert.equal(first.outgoing_links[0],'https://one.example/docs/child');assert.equal(second.outgoing_links[0],'https://two.example/start/child');
  assert.deepEqual(first.inspection.custom.Heading,['First']);assert.deepEqual(second.inspection.custom.Heading,['Second']);
});

// Chromium can reset a rejected HTTPS tunnel before consuming the denial response.
test('Deny proxy contains socket-local resets and still refuses later requests', async () => {
  const proxy = await startDenyProxy();
  try {
    const accepted = once(proxy.server, 'connection');
    const client = connect(Number(new URL(proxy.url).port), '127.0.0.1');
    client.on('error', () => client.destroy());
    const [socket] = await accepted;
    socket.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    assert.equal(socket.destroyed, true);
    client.destroy();
    const response = await fetch(proxy.url);
    assert.equal(response.status, 403);
    await response.text();
  } finally { await proxy.close(); }
});

test('Deny proxy closes CONNECT sockets and shutdown is idempotent', async () => {
  const proxy = await startDenyProxy();
  const client = connect(Number(new URL(proxy.url).port), '127.0.0.1');
  client.on('error', () => client.destroy());
  try {
    await once(client, 'connect');
    client.write('CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n');
    const [data] = await once(client, 'data');
    assert.match(data.toString(), /^HTTP\/1\.1 403 Forbidden/);
    await proxy.close();
    await proxy.close();
    assert.equal(proxy.server.listening, false);
  } finally { client.destroy(); await proxy.close(); }
});
