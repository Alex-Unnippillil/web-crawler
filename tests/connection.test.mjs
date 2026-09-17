/** Deterministic owner-access, transport and canonical-origin regressions. No external site is contacted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCrawl } from '../dist/engine.js';
import { challenge, canonicalTransition, describeError } from '../dist/crawler/diagnostics.js';
import { OwnerAccess } from '../dist/studio/owner-access.js';
import { checkConnection } from '../dist/studio/connection.js';
import { createPublicFetch } from '../dist/studio/network.js';
import { startStudio } from '../dist/studio/server.js';
const origin = 'https://owned.example';
const secret = 'fixture-only-owner-token-0123456789';
const html = (body = '<h1>Owned site</h1><p>Educational fixture.</p>') => new Response(`<html><head><title>Owned site</title></head><body>${body}</body></html>`, { headers: {'content-type':'text/html'} });
const opts = {mode:'http',delayMs:0,retries:0,maxPages:5,discoverSitemaps:false,timeoutMs:2000};
function mock(pages) { const calls=[];return {calls,fetch:async(url,init)=>{calls.push(String(url));return pages[String(url)]?.(init) ?? new Response('not found',{status:404});}}; }
for (const [a,b,wanted] of [
  ['http://owned.example','https://owned.example',true], ['https://owned.example','https://www.owned.example',true],
  ['https://www.owned.example','https://owned.example',true],['https://owned.example','http://owned.example',false],
  ['https://owned.example','https://evil.example',false],['https://owned.example','https://owned.example.evil.test',false],
  ['https://owned.example','https://owned.example:8443',false],['https://owned.example','https://u:p@owned.example',false]
]) test(`entry transition ${a} → ${b}`,()=>assert.equal(canonicalTransition(a,b),wanted));
test('ordinary 429 is not a security challenge',()=>assert.equal(challenge(new Headers(),429),undefined));
test('explicit providers and checkpoint title are identified without retaining HTML',()=>{
  assert.equal(challenge(new Headers({'x-vercel-mitigated':'challenge'}),429).provider,'Vercel');
  assert.equal(challenge(new Headers({'cf-mitigated':'challenge'}),403).provider,'Cloudflare');
  assert.equal(challenge(new Headers(),429,'<title>Vercel Security Checkpoint</title>').kind,'access-challenge');
  assert.equal(challenge(new Headers(),200,'<h1>Article about Vercel Security Checkpoint</h1>'),undefined);
});
test('robots challenge stops once and retains status, provider and stage',async()=>{
  const x=mock({[origin+'/robots.txt']:()=>new Response('checkpoint',{status:429,headers:{'x-vercel-mitigated':'challenge'}})});
  const r=await runCrawl(origin+'/',{...opts,retries:3},{fetchImpl:x.fetch});
  assert.deepEqual(x.calls,[origin+'/robots.txt']);assert.equal(r.summary.retries,0);assert.equal(r.errors[0].stage,'robots');assert.equal(r.errors[0].status_code,429);assert.equal(r.discovery.robots.status,429);assert.equal(r.errors[0].provider,'Vercel');assert.match(r.errors[0].guidance,/owner/i);
});
test('normal rate limiting still retries and succeeds',async()=>{
  let calls=0;const r=await runCrawl(origin+'/',{...opts,retries:1},{fetchImpl:async url=>url.endsWith('robots.txt')?new Response(''):++calls===1?new Response('slow',{status:429,headers:{'retry-after':'0'}}):html()});
  assert.equal(r.summary.pages_crawled,1);assert.equal(r.summary.retries,1);
});
test('entry canonical redirect checks destination robots before the document and updates link scope',async()=>{
  const x=mock({[origin+'/robots.txt']:()=>new Response(''),[origin+'/']:()=>new Response(null,{status:308,headers:{location:'https://www.owned.example/'}}),
    ['https://www.owned.example/robots.txt']:()=>new Response(''),['https://www.owned.example/']:()=>html('<a href="/guide">Guide</a>'),['https://www.owned.example/guide']:()=>html()});
  const r=await runCrawl(origin+'/',opts,{fetchImpl:x.fetch});
  assert.deepEqual(x.calls.slice(0,4),[origin+'/robots.txt',origin+'/','https://www.owned.example/robots.txt','https://www.owned.example/']);
  assert.equal(r.summary.pages_crawled,2);assert.equal(r.effective_start_url,'https://www.owned.example/');assert.equal(r.pages['https://www.owned.example/'].internal_links.length,1);
});
test('destination robots disallow is never bypassed by a canonical redirect',async()=>{
  const x=mock({[origin+'/robots.txt']:()=>new Response(''),[origin+'/']:()=>new Response(null,{status:301,headers:{location:'https://www.owned.example/'}}),['https://www.owned.example/robots.txt']:()=>new Response('User-agent: *\nDisallow: /')});
  const r=await runCrawl(origin+'/',opts,{fetchImpl:x.fetch});assert.equal(r.summary.pages_crawled,0);assert.equal(x.calls.includes('https://www.owned.example/'),false);assert.equal(r.errors[0].kind,'robots');
});
test('a non-seed page cannot expand origin scope',async()=>{
  const x=mock({[origin+'/robots.txt']:()=>new Response(''),[origin+'/']:()=>html('<a href="/next">Next</a>'),[origin+'/next']:()=>new Response(null,{status:301,headers:{location:'https://www.owned.example/private'}})});
  const r=await runCrawl(origin+'/',opts,{fetchImpl:x.fetch});assert.equal(r.errors[0].kind,'scope');assert.equal(x.calls.length,3);
});
test('HTML robots route fails closed with an actionable message',async()=>{
  const x=mock({[origin+'/robots.txt']:()=>html()});const r=await runCrawl(origin+'/',opts,{fetchImpl:x.fetch});assert.equal(x.calls.length,1);assert.equal(r.errors[0].kind,'robots');assert.match(r.errors[0].message,/HTML page/);
});
test('aggregate network diagnostics retain individual addresses and redact embedded credentials',()=>{
  const e=new AggregateError([Object.assign(new Error('lookup failed'),{code:'ENOTFOUND'}),new Error('https://user:password@host.invalid/')],'connect failed');
  assert.match(describeError(e),/ENOTFOUND/);assert.equal(describeError(e).includes('password'),false);
});
test('Happy Eyeballs receives all checked addresses and never performs unchecked DNS fallback',async()=>{
  const addresses=[{address:'2606:4700:4700::1111',family:6},{address:'1.1.1.1',family:4}];let lookups=0;
  const fetcher=createPublicFetch({resolve:async()=>{lookups++;return addresses;},https:(url,options,respond)=>{
    assert.equal(options.autoSelectFamily,true);assert.equal(options.autoSelectFamilyAttemptTimeout,250);
    options.lookup('must-not-resolve', {all:true},(error,values)=>{assert.equal(error,null);assert.deepEqual(values,addresses);});
    const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{const res=Readable.from([Buffer.from('ok')]);res.rawHeaders=['content-type','text/plain'];res.statusCode=200;respond(res);};return req;
  }});assert.equal(await (await fetcher(origin)).text(),'ok');assert.equal(lookups,1);
});
test('a mixed public/private DNS result fails before any connection',async()=>{
  let sent=false;const fetcher=createPublicFetch({resolve:async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}],https:()=>{sent=true;}});
  await assert.rejects(fetcher(origin),/Private/);assert.equal(sent,false);
});
test('owner credential is exact-origin only and caller credentials are stripped',async()=>{
  const access=new OwnerAccess();access.configure({origin,token:secret});const got=[];const wrapped=access.wrap(async(url,init)=>{got.push(new Headers(init.headers).get('x-vercel-protection-bypass'));return html();});
  for(const url of [origin+'/', 'https://www.owned.example/','https://cdn.owned.example/a','http://owned.example/']) await (await wrapped(url,{headers:{'x-vercel-protection-bypass':secret}})).text();
  assert.deepEqual(got,[secret,null,null,null]);assert.equal(JSON.stringify(access.state()).includes(secret),false);access.clear();assert.equal(access.state().configured,false);
});
test('owner credential reflections are redacted across every streamed split',async()=>{
  for(let cut=1;cut<secret.length;cut++){
    const access=new OwnerAccess();access.configure({origin,token:secret});const wrapped=access.wrap(async()=>new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('before '+secret.slice(0,cut)));c.enqueue(Buffer.from(secret.slice(cut)+' after'));c.close();}}),{headers:{'content-type':'text/html','etag':secret}}));
    const r=await wrapped(origin);assert.equal(await r.text(),'before [redacted] after');assert.equal(r.headers.get('etag'),'[redacted]');
  }
});
test('invalid owner origins, non-secrets and whitespace are rejected',()=>{
  const a=new OwnerAccess();for(const url of ['http://owned.example','https://owned.example/path','https://owned.example?token=x','https://owned.example#x','https://owned.example:8443','https://u:p@owned.example'])assert.throws(()=>a.configure({origin:url,token:secret}));
  for(const token of ['small','bad\n'+'x'.repeat(20),'x'.repeat(1025)])assert.throws(()=>a.configure({origin,token}));
});
test('connection report uses real engine, retains no crawl history, distinguishes allowed and protected',async()=>{
  const no=await checkConnection(origin,async()=>new Response('',{status:429,headers:{'x-vercel-mitigated':'challenge'}}));assert.equal(no.outcome,'access-needed');assert.equal(no.requests,1);assert.equal(no.checks[1].state,'Not requested');
  const yes=await checkConnection(origin,async u=>u.endsWith('robots.txt')?new Response(''):html());assert.equal(yes.outcome,'ready');assert.equal(yes.requests,2);assert.equal(yes.title,'Ready to crawl');
});
test('authenticated owner workflow unblocks owned fixture without storing a secret or inventing robots',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'owner-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let app=await startStudio({port:0,directory,hooks:{fetchImpl:async(url,init)=>new Headers(init.headers).get('x-vercel-protection-bypass')!==secret?new Response('',{status:429,headers:{'x-vercel-mitigated':'challenge'}}):url.endsWith('robots.txt')?new Response('User-agent: *\nAllow: /'):html(`<h1>Owned site ${secret}</h1>`)}});
  t.after(()=>app.close());const base=`http://127.0.0.1:${app.port}`;const markup=await(await fetch(base)).text();const token=/name="session-token" content="([^"]+)/.exec(markup)[1];
  const call=(path,method='GET',data)=>fetch(base+path,{method,headers:{'x-crawler-token':token,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal((await fetch(base+'/api/connection',{method:'POST'})).status,403);
  assert.equal((await call('/api/connection','POST',{url:origin})).status,200);assert.equal(app.store.list().length,0);
  const configured=await call('/api/access','POST',{origin,token:secret});assert.equal(configured.status,200);assert.equal((await configured.text()).includes(secret),false);
  assert.equal((await(await call('/api/connection','POST',{url:origin})).json()).outcome,'ready');
  const job=await(await call('/api/jobs','POST',{url:origin,options:{mode:'http',discoverSitemaps:false,maxPages:1,delayMs:100}})).json();
  for(let i=0;i<100&&app.store.busy();i++)await new Promise(r=>setTimeout(r,20));
  const result=await(await call('/api/jobs/'+job.id)).text();assert.equal(result.includes(secret),false);assert.match(result,/redacted/);
  await app.close();for(const file of await readdir(directory))if(file.endsWith('.json'))assert.equal((await readFile(join(directory,file),'utf8')).includes(secret),false);
});


test('a checkpoint title split across chunks is diagnosed once', async()=>{
  const r=await runCrawl(origin+'/',{...opts,retries:2},{fetchImpl:async()=>new Response(new ReadableStream({start(c){for(const part of ['<ti','tle>Vercel Security ','Checkpoint</title>'])c.enqueue(Buffer.from(part));c.close();}}),{status:429,headers:{'content-type':'Text/HTML'}})});
  assert.equal(r.errors[0].kind,'access-challenge');assert.equal(r.summary.retries,0);assert.equal(r.summary.requests,1);
});
test('a denied document is marked unavailable, not falsely marked unrequested',async()=>{
  const r=await checkConnection(origin,async u=>u.endsWith('robots.txt')?new Response(''):new Response('',{status:403,headers:{'cf-mitigated':'challenge'}}));
  assert.equal(r.checks[0].state,'Checked');assert.equal(r.checks[1].state,'Unavailable');assert.equal(r.checks[1].status,403);
});
test('the Atlas classifies destination-host links against the canonical entry origin',async()=>{
  const {buildIndex}=await import('../ui-dist/atlas-model.js');
  const x=mock({[origin+'/robots.txt']:()=>new Response(''),[origin+'/']:()=>new Response(null,{status:308,headers:{location:'https://www.owned.example/'}}),['https://www.owned.example/robots.txt']:()=>new Response(''),['https://www.owned.example/']:()=>html('<a href="/not-fetched">Not fetched</a>')});
  const r=await runCrawl(origin+'/',{...opts,maxPages:1},{fetchImpl:x.fetch}),index=buildIndex(r);
  assert.equal(index.root,'https://www.owned.example/');assert.equal(index.byID.get('https://www.owned.example/not-fetched').state,'discovered');assert.equal(index.links[0].kind,'internal');
});
test('owner credential expiration and new-instance state never recover saved authentication',t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);const access=new OwnerAccess();access.configure({origin,token:secret});assert.equal(access.state().configured,true);
  now += 3600001;assert.equal(access.state().configured,false);assert.equal(new OwnerAccess().state().configured,false);
});

test('reflection redaction handles densely repeated secrets with a bounded streaming tail',async()=>{
  const access=new OwnerAccess();access.configure({origin,token:secret});const count=20000;
  const wrapped=access.wrap(async()=>new Response(secret.repeat(count)));
  assert.equal(await(await wrapped(origin)).text(),'[redacted]'.repeat(count));
});

test('opt-in recorded image previews use the same exact-origin owner authentication',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'owner-image-'));const image=Buffer.from('89504e470d0a1a0a00000000','hex');
  const app=await startStudio({port:0,directory,hooks:{fetchImpl:async(input,init)=>{
    const url=String(input);if(new Headers(init.headers).get('x-vercel-protection-bypass')!==secret)return new Response('',{status:403});
    if(url.endsWith('/robots.txt'))return new Response('');
    if(url.endsWith('/private.png'))return new Response(image,{headers:{'content-type':'image/png'}});
    return html('<h1>Owned</h1><img src="/private.png">');
  }}});t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.port}`,markup=await(await fetch(base)).text(),token=/name="session-token" content="([^"]+)/.exec(markup)[1];
  const call=(path,method='GET',body)=>fetch(base+path,{method,headers:{'x-crawler-token':token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  await call('/api/access','POST',{origin,token:secret});const job=await(await call('/api/jobs','POST',{url:origin,options:{mode:'http',maxPages:1,discoverSitemaps:false,delayMs:100}})).json();
  for(let i=0;i<100&&app.store.busy();i++)await new Promise(r=>setTimeout(r,20));
  const response=await call(`/api/jobs/${job.id}/image?url=${encodeURIComponent(origin+'/private.png')}`);
  assert.equal(response.status,200,await response.clone().text());assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
});
