// Repository note: Exercises crawler, URL, robots, networking, reporting, CLI, and core behavior.
// Core regression suite covering URL rules, crawl limits, HTTP behavior, reports, and CLI behavior.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { runCrawl } from '../dist/engine.js';
import { parseRobots } from '../dist/robots.js';
import { httpURL, normalizeURL, isInScope } from '../dist/url.js';
import { parseCLI } from '../dist/cli.js';
import { validateOptions } from '../dist/options.js';
import { escapeHTML, csvCell, renderHTML, renderGraph, writeReports, writeJSONReport } from '../dist/report.js';

// Inject a simple parser to isolate transport/queue/report tests from jsdom.
// Real HTML parsing and the original exercise assertions run in the Vitest suite.
const seed = 'https://fixture.invalid/';
const extract = (body, url) => ({ url, heading: 'Fixture', first_paragraph: '', image_urls: [], ...JSON.parse(body) });
const doc = (links = [], extra = {}) => JSON.stringify({ outgoing_links: links, ...extra });
const html = (body = doc(), init = {}) => new Response(body, { ...init, headers: { 'Content-Type': 'text/html', ...init.headers } });
const defaults = { delayMs: 0, retries: 0, maxDurationMs: 3000, respectRobots: false };
const mockCrawl = (routes, options = {}, extra = {}) => {
  const calls = [];
  return { calls, result: runCrawl(seed, { ...defaults, ...options }, { extract, fetchImpl: async (url, init) => {
    calls.push(url); const response = routes[url];
    if (typeof response === 'function') return response(url, init);
    return response ?? new Response('missing', { status: 404 });
  }, ...extra }) };
};
async function server(t, handler) {
  const http = createServer(handler); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.closeAllConnections(); http.close(resolve); }));
  return `http://127.0.0.1:${http.address().port}`;
}
function send(res, links = []) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(doc(links)); }

test('legacy normalization', () => assert.equal(normalizeURL('https://www.boot.dev/blog/path/'), 'www.boot.dev/blog/path'));
test('crawl keys retain query, port and trailing slash', () => assert.equal(httpURL('https://EXAMPLE.com:444/a/?x=1#section'), 'https://example.com:444/a/?x=1'));
test('relative URL resolution', () => assert.equal(httpURL('../b', 'https://example.com/a/c'), 'https://example.com/b'));
test('tracking removal is opt-in and keeps meaningful values', () => assert.equal(httpURL('https://e.com/?q=book&utm_source=ads&fbclid=1', undefined, true), 'https://e.com/?q=book'));
for (const url of ['ftp://example.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@example.com/', 'not a url']) test(`reject URL: ${url}`, () => assert.throws(() => httpURL(url)));
test('scope compares origin, not only hostname', () => { assert.equal(isInScope('https://e.com:444/x', 'https://e.com'), false); assert.equal(isInScope('http://e.com/x', 'https://e.com'), false); });
test('path scopes respect path component boundaries', () => { assert.equal(isInScope('https://e.com/blogging', 'https://e.com', '/blog'), false); assert.equal(isInScope('https://e.com/blog/a', 'https://e.com', '/blog/'), true); });
for (const options of [{ maxPages: NaN }, { maxConcurrency: 0 }, { maxConcurrency: 99 }, { retries: -1 }, { maxPages: 1.5 }, { maxBodyBytes: 0 }, { pathPrefix: 'blog' }, { userAgent: 'Bad\r\nHeader' }]) test(`invalid options: ${JSON.stringify(options)}`, () => assert.throws(() => validateOptions(options)));
test('legacy CLI form still works', () => { const c = parseCLI([seed, '2', '20']); assert.equal(c.options.maxConcurrency, 2); assert.equal(c.options.maxPages, 20); });
test('named CLI arguments', () => { const c = parseCLI([seed, '--max-depth', '0', '--out', 'reports/site.json', '--strict']); assert.equal(c.options.maxDepth, 0); assert.equal(c.output, 'reports/site.json'); assert.equal(c.strict, true); });
test('help does not need URL', () => assert.equal(parseCLI(['--help']).help, true));
for (const args of [[], [seed, '2'], [seed, '--typo'], [seed, '--concurrency', '1.2'], [seed, '2', '20', '--concurrency', '3']]) test(`CLI rejects ${JSON.stringify(args)}`, () => assert.throws(() => parseCLI(args)));
test('robots empty disallow permits access', () => assert.equal(parseRobots('User-agent: *\nDisallow:', 'BootCrawler/2.0').allows(seed), true));
test('robots longest prefix', () => { const p = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public', 'BootCrawler/2.0'); assert.equal(p.allows(seed+'private/a'), false); assert.equal(p.allows(seed+'private/public/a'), true); });
test('robots case-sensitive paths', () => { const p = parseRobots('User-agent: *\nDisallow: /A', 'BootCrawler/2'); assert.equal(p.allows(seed+'A'), false); assert.equal(p.allows(seed+'a'), true); });
test('robots wildcard and end marker', () => { const p = parseRobots('User-agent: *\nDisallow: /*.pdf$', 'BootCrawler'); assert.equal(p.allows(seed+'x/a.pdf'), false); assert.equal(p.allows(seed+'a.pdf?html=1'), true); });
test('robots group specificity and merging', () => { const p = parseRobots('User-agent: *\nDisallow: /\nUser-agent: BootCrawler\nDisallow: /one\nUser-agent: bootcrawler\nDisallow: /two\nCrawl-delay: 0.5', 'BootCrawler/2'); assert.equal(p.allows(seed), true); assert.equal(p.allows(seed+'one'), false); assert.equal(p.allows(seed+'two'), false); assert.equal(p.delayMs, 500); });
test('robots unreserved percent-encoding', () => assert.equal(parseRobots('User-agent: *\nDisallow: /~user', 'BootCrawler').allows(seed+'%7euser'), false));
test('robots unicode', () => assert.equal(parseRobots('User-agent: *\nDisallow: /café', 'BootCrawler').allows(seed+'caf%C3%A9'), false));
test('failed fetches never become fake page records', async () => { const r = await mockCrawl({}).result; assert.equal(r.summary.pages_crawled, 0); assert.equal(r.errors[0].status_code, 404); });
test('root and linked pages are collected', async () => { const r = await mockCrawl({ [seed]: html(doc([seed+'a'])), [seed+'a']: html() }).result; assert.equal(r.summary.pages_crawled, 2); });
test('cycles and fragments are deduplicated', async () => { const x = mockCrawl({ [seed]: html(doc([seed+'a', seed+'a#x', seed])), [seed+'a']: html(doc([seed])) }); const r = await x.result; assert.equal(x.calls.length, 2); assert.equal(r.summary.pages_crawled, 2); });
test('query variant cap', async () => { const r = await mockCrawl({ [seed]: html(doc([seed+'a?q=1', seed+'a?q=2', seed+'a?q=3'])), [seed+'a?q=1']: html(), [seed+'a?q=2']: html() }, { maxQueryVariants: 2 }).result; assert.equal(r.summary.pages_crawled, 3); assert.equal(r.skipped.query_limit, 1); });
test('concurrent candidate budget is never exceeded', async () => { const routes = { [seed]: html(doc(Array.from({length:50}, (_,i)=>seed+i))) }; for(let i=0;i<50;i++) routes[seed+i]=html(); const x=mockCrawl(routes,{maxPages:4,maxConcurrency:8}); const r=await x.result; assert.equal(x.calls.length,4); assert.equal(r.summary.urls_scheduled,4); assert.equal(r.summary.limit_reached,true); });
test('depth zero visits root only', async () => { const x=mockCrawl({[seed]:html(doc([seed+'a']))},{maxDepth:0}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.skipped.depth_limit,1); });
test('external URLs are counted but not fetched', async () => { const x=mockCrawl({[seed]:html(doc(['https://outside.invalid/x',seed+'a'])),[seed+'a']:html()}); const r=await x.result; assert.equal(r.summary.unique_external_links,1); assert.equal(x.calls.some(url=>url.includes('outside')),false); });
test('cross-origin redirect blocked before follow', async () => { const x=mockCrawl({[seed]:new Response(null,{status:302,headers:{location:'https://outside.invalid/'}})}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.errors[0].kind,'scope'); });
test('redirect resolves links against final URL', async () => { const r=await mockCrawl({[seed]:new Response(null,{status:302,headers:{location:'/dir/'}}),[seed+'dir/']:html(doc(['child'])),[seed+'dir/child']:html()}).result; assert.ok(r.pages[seed+'dir/child']); assert.equal(r.pages[seed+'dir/'].requested_url,seed); });
test('redirect loop is bounded', async () => { const x=mockCrawl({[seed]:new Response(null,{status:302,headers:{location:seed}})}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.errors[0].kind,'redirect'); });
test('redirect respects robots before follow', async () => { const x=mockCrawl({[seed+'robots.txt']:new Response('User-agent: *\nDisallow: /private'),[seed]:new Response(null,{status:302,headers:{location:'/private'}})},{respectRobots:true}); const r=await x.result; assert.equal(x.calls.includes(seed+'private'),false); assert.equal(r.errors[0].kind,'robots'); });
test('robots 404 permits crawl', async () => assert.equal((await mockCrawl({[seed]:html()},{respectRobots:true}).result).summary.pages_crawled,1));
test('robots 403 denies crawl', async () => { const x=mockCrawl({[seed+'robots.txt']:new Response(null,{status:403}),[seed]:html()},{respectRobots:true}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.summary.pages_crawled,0); });
test('robots 503 fails closed', async () => { const x=mockCrawl({[seed+'robots.txt']:new Response(null,{status:503}),[seed]:html()},{respectRobots:true}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.summary.stopped,true); });
test('503 retries then succeeds', async () => { let n=0; const r=await mockCrawl({[seed]:()=>++n===1?new Response(null,{status:503,headers:{'Retry-After':'0'}}):html()},{retries:1}).result; assert.equal(n,2); assert.equal(r.summary.pages_crawled,1); assert.equal(r.summary.retries,1); });
test('404 not retried', async () => { const x=mockCrawl({},{retries:3}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.errors[0].attempts,1); });
test('long Retry-After stops crawl', async () => { const x=mockCrawl({[seed]:new Response(null,{status:429,headers:{'Retry-After':'120'}})},{retries:1,maxRetryDelayMs:10}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.summary.stopped,true); });
test('network errors preserve cause code', async () => { const r=await mockCrawl({[seed]:()=>{throw new Error('fetch failed',{cause:Object.assign(new Error('lookup failed'),{code:'ENOTFOUND'})});}}).result; assert.match(r.errors[0].message,/ENOTFOUND/); });
test('certificate failure is not retried', async () => { const x=mockCrawl({[seed]:()=>{throw new Error('CERT_HAS_EXPIRED');}},{retries:3}); const r=await x.result; assert.equal(x.calls.length,1); assert.equal(r.errors[0].kind,'network'); });
test('Content-Length cap', async () => assert.equal((await mockCrawl({[seed]:html(doc(),{headers:{'content-length':'99999'}})},{maxBodyBytes:100}).result).errors[0].kind,'body-limit'));
test('streamed byte cap', async () => assert.equal((await mockCrawl({[seed]:html('x'.repeat(1000))},{maxBodyBytes:100}).result).errors[0].kind,'body-limit'));
test('non-HTML excluded from pages', async () => { const r=await mockCrawl({[seed]:new Response('{}',{headers:{'Content-Type':'application/json'}})}).result; assert.equal(r.summary.pages_crawled,0); assert.equal(r.errors[0].kind,'non-html'); });
test('parser exceptions recorded', async () => { const r=await mockCrawl({[seed]:html('not json')}).result; assert.equal(r.summary.pages_crawled,0); assert.equal(r.errors[0].kind,'parse'); });
test('pre-aborted signal sends nothing', async () => { const c=new AbortController();c.abort();const x=mockCrawl({[seed]:html()},{},{signal:c.signal});const r=await x.result;assert.equal(x.calls.length,0);assert.equal(r.summary.stopped,true); });
test('link arrays are bounded', async () => { const r=await mockCrawl({[seed]:html(doc([seed+'a',seed+'b',seed+'c']))},{maxLinksPerPage:1,maxDepth:0}).result; assert.equal(r.pages[seed].outgoing_links.length,1);assert.ok(r.warnings.some(w=>w.includes('truncated'))); });
test('real HTTP concurrency limit', async t => {
  let active=0, peak=0;const base=await server(t,(req,res)=>{
    if(req.url==='/'){send(res,Array.from({length:6},(_,i)=>base+'/'+i));return;}
    active++;peak=Math.max(peak,active);setTimeout(()=>{active--;send(res);},40);
  });
  const r=await runCrawl(base+'/',{...defaults,maxConcurrency:2},{extract});assert.equal(r.summary.pages_crawled,7);assert.equal(peak,2);
});
test('real stalled HTTP response times out', async t => {
  const base=await server(t,(_req,_res)=>{});const r=await runCrawl(base+'/',{...defaults,timeoutMs:40},{extract});assert.equal(r.summary.pages_crawled,0);assert.equal(r.errors[0].kind,'timeout');
});
test('timeout covers body reads', async t => {
  const base=await server(t,(_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.write('{');});const r=await runCrawl(base+'/',{...defaults,timeoutMs:40},{extract});assert.equal(r.errors[0].kind,'timeout');
});
test('real request start times are paced', async t => {
  const times=[];const base=await server(t,(req,res)=>{times.push(Date.now());send(res,req.url==='/'?[base+'/a',base+'/b']:[]);});
  await runCrawl(base+'/',{...defaults,delayMs:40,maxConcurrency:3},{extract});assert.equal(times.length,3);for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=28);
});
test('deadline preserves completed pages', async t => {
  const base=await server(t,(req,res)=>{if(req.url==='/')send(res,[base+'/slow']);});const r=await runCrawl(base+'/',{...defaults,maxDurationMs:100,timeoutMs:2000},{extract});assert.equal(r.summary.pages_crawled,1);assert.equal(r.summary.stopped,true);
});
test('cancellation preserves completed pages', async t => {
  const c=new AbortController();const base=await server(t,(req,res)=>{if(req.url==='/')send(res,[base+'/slow']);else setTimeout(()=>c.abort(new Error('test cancelled')),20);});const r=await runCrawl(base+'/',{...defaults},{extract,signal:c.signal});assert.equal(r.summary.pages_crawled,1);assert.equal(r.summary.stopped,true);
});
test('HTML escaping neutralizes markup',()=>assert.equal(escapeHTML('<script a="x">&'), '&lt;script a=&quot;x&quot;&gt;&amp;'));
for(const value of ['=HYPERLINK("x")',' +SUM(1,2)','@evil','-10','\t=1'])test(`CSV formula safety: ${JSON.stringify(value)}`,()=>assert.ok(csvCell(value).startsWith('"\'')));
test('CSV quotes escaped',()=>assert.equal(csvCell('a"b'), '"a""b"'));
test('report writes create directories and leave no temp files', async()=>{
  const dir=mkdtempSync(join(tmpdir(),'crawler-report-'));try{
    const r=await mockCrawl({[seed]:html(doc([seed+'a'])),[seed+'a']:html()}).result;const files=writeReports(r,join(dir,'nested','site.json'));
    assert.equal(files.length,5);for(const f of files)assert.ok(readFileSync(f).length>0);assert.ok(Array.isArray(JSON.parse(readFileSync(files[0],'utf8'))));assert.equal(readdirSync(join(dir,'nested')).some(f=>f.endsWith('.tmp')),false);
    const metadata=JSON.parse(readFileSync(files[4],'utf8'));assert.equal(metadata.pages,undefined);assert.equal(metadata.summary.pages_crawled,2);
    writeJSONReport({z:{url:'https://z/',heading:'',first_paragraph:'',outgoing_links:[],image_urls:[]},a:{url:'https://a/',heading:'',first_paragraph:'',outgoing_links:[],image_urls:[]}},join(dir,'sorted.json'));assert.equal(JSON.parse(readFileSync(join(dir,'sorted.json'),'utf8'))[0].url,'https://a/');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('dashboard CSP and malicious title escaping',async()=>{
  const r=await mockCrawl({[seed]:html(doc([],{title:'</script><script>alert(1)</script>',heading:'<img src=x onerror=alert(1)>'}))}).result;const h=renderHTML(r);assert.ok(h.includes('Content-Security-Policy'));assert.ok(h.includes('sha256-'));assert.ok(!h.includes('<script>alert(1)</script>'));assert.ok(!h.includes('<img src=x'));assert.ok(h.includes('id="search"'));
});
test('SVG accessible title and node count',async()=>{const r=await mockCrawl({[seed]:html()}).result;const g=renderGraph(r);assert.ok(g.includes('<title id="graph-title">'));assert.ok(g.includes('1 / 1 pages'));});
async function command(args){return await new Promise(resolve=>{const child=spawn(process.execPath,['dist/index.js',...args],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});let out='';let err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('close',code=>resolve({code,out,err}));});}
test('built CLI help',async()=>{const r=await command(['--help']);assert.equal(r.code,0);assert.match(r.out,/Usage:/);});
test('built CLI invalid args exit 2',async()=>{const r=await command([seed,'0','20']);assert.equal(r.code,2);assert.match(r.err,/maxConcurrency/);});
test('built CLI failure exits 1 with diagnostics',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'crawler-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const base=await server(t,(_req,res)=>{res.writeHead(404);res.end('missing');});const r=await command([base+'/', '--delay-ms','0','--retries','0','--out',join(dir,'site.json'),'--quiet']);assert.equal(r.code,1);assert.deepEqual(JSON.parse(readFileSync(join(dir,'site.json'),'utf8')),[]);assert.match(r.err,/404/);
});
