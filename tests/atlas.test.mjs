/** Analysis and preview security regression tests; no external website is contacted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, shortestRoute, mapSubset, layoutMap, extensionOf } from '../ui-dist/atlas-model.js';
import { MediaPreviews, recordedImage, rasterType } from '../dist/studio/media.js';
import { startStudio } from '../dist/studio/server.js';
import { demoArtwork } from '../dist/studio/atlas-demo.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base='https://site.example';
const page=(path,links=[],extra={})=>({url:base+path,requested_url:base+path,heading:path,title:path,first_paragraph:'',outgoing_links:links.map(p=>p.startsWith('http')?p:base+p),image_urls:[],internal_links:[],external_links:[],status_code:200,depth:path==='/'?0:1,duration_ms:20,content_bytes:100,...extra});
const result=(pages,errors=[])=>({start_url:base+'/',pages:Object.fromEntries(pages.map(p=>[p.url,p])),errors});
const selection={query:'',group:'',states:['page','error','discovered','external'],focus:'',limit:250};
const imageURL='https://cdn.example/photo.png';
const png=demoArtwork('/media/coast.png');
const job=(images=[imageURL],extra={})=>({id:'one',url:base+'/',demo:false,result:result([page('/',[],{image_urls:images})]),...extra});

test('observed map distinguishes success, errors, discovered and external URLs',()=>{
 const index=buildIndex(result([page('/',['/two','/broken','/private','https://external.example/a']),page('/two')],[{url:base+'/broken',status_code:404,kind:'http'}]));
 assert.deepEqual(index.nodes.map(n=>n.state).sort(),['discovered','error','external','page','page']);
 assert.equal(index.byID.get(base+'/two').inbound,1);assert.equal(index.byID.get(base+'/').outbound,4);
});
test('map resolves redirects and removes duplicate fragment edges',()=>{
 const index=buildIndex(result([page('/',['/old','/new#first','/new#second']),page('/new',[],{requested_url:base+'/old'})]));
 assert.equal(index.nodes.length,2);assert.equal(index.edges.length,1);assert.equal(index.edges[0].target,base+'/new');
});
test('redirected start is the root for route tracing',()=>{
 const index=buildIndex(result([page('/home',['/two'],{requested_url:base+'/'}),page('/two')]));
 assert.equal(index.root,base+'/home');assert.deepEqual(shortestRoute(index,base+'/two'),[base+'/home',base+'/two']);
});
test('shortest route follows actual directions and handles cycles',()=>{
 const index=buildIndex(result([page('/',['/a']),page('/a',['/b','/']),page('/b',['/c']),page('/c'),page('/unreachable',['/'])]));
 assert.deepEqual(shortestRoute(index,base+'/c'),['/','/a','/b','/c'].map(p=>base+p));
 assert.deepEqual(shortestRoute(index,base+'/unreachable'),[]);assert.deepEqual(shortestRoute(index,base+'/'),[base+'/']);
});
test('path filter and text search use captured values',()=>{
 const index=buildIndex(result([page('/',['/docs/a','/shop/b']),page('/docs/a',[],{title:'Helpful Guide'}),page('/shop/b')]));
 assert.equal(mapSubset(index,{...selection,group:'docs',query:'helpful'}).nodes.length,1);
 assert.equal(mapSubset(index,{...selection,group:'docs',query:'not-here'}).nodes.length,0);
});
test('neighborhood includes only direct neighbors',()=>{
 const index=buildIndex(result([page('/',['/a']),page('/a',['/b']),page('/b',['/c']),page('/c')]));
 assert.equal(mapSubset(index,{...selection,focus:base+'/a'}).nodes.length,3);
});
test('map sampling is bounded and prioritizes root; complete index is retained',()=>{
 const pages=[page('/',Array.from({length:520},(_,i)=>'/p'+i)),...Array.from({length:520},(_,i)=>page('/p'+i))];
 const index=buildIndex(result(pages));const subset=mapSubset(index,{...selection,limit:9999});
 assert.equal(index.nodes.length,521);assert.equal(subset.nodes.length,500);assert.ok(subset.nodes[0].root);
});
test('dense link drawing is capped at 3000 without discarding exported edges',()=>{
 const paths=Array.from({length:80},(_,i)=>i?'/p'+i:'/');const index=buildIndex(result(paths.map(p=>page(p,paths))));
 const subset=mapSubset(index,selection);assert.equal(subset.edges.length,3000);assert.equal(index.edges.length,6400);
});
for(const mode of ['web','radial','columns'])test(`${mode} layout is deterministic, finite and retains all selected nodes`,()=>{
 const index=buildIndex(result([page('/',['/one','/two']),page('/one',['/two']),page('/two')]));const positions=layoutMap(index.nodes,index.edges,mode);
 assert.equal(positions.size,3);assert.deepEqual(positions,layoutMap(index.nodes,index.edges,mode));for(const p of positions.values()){assert.ok(Number.isFinite(p.x));assert.ok(Number.isFinite(p.y));}
});
test('empty maps and single node layouts are valid',()=>{assert.equal(layoutMap([],[],'web').size,0);const index=buildIndex(result([page('/')]));assert.deepEqual(layoutMap(index.nodes,[],'web').get(base+'/'),{x:500,y:300});});
test('legacy history retains images/links and reports unknown metadata',()=>{
 const index=buildIndex(result([page('/',['/target'],{image_urls:[imageURL]}),page('/target')]));
 assert.equal(index.legacyPages,2);assert.equal(index.images[0].unknown,1);assert.equal(index.images[0].missing,0);assert.equal(index.links.length,1);
});
test('image inventory deduplicates sources but retains description distinctions',()=>{
 const elements={images:[{src:imageURL,candidates:[imageURL],alt:null,width:100,height:70},{src:imageURL,candidates:[imageURL],alt:'',width:null,height:null}],headings:[],links:[],resources:[],forms:[],truncated:false};
 const index=buildIndex(result([page('/',[],{image_urls:[imageURL],elements}),page('/two',[],{elements:{...elements,images:[{...elements.images[0],alt:'Landscape'}]}})]));
 assert.equal(index.images.length,1);assert.equal(index.images[0].sources.length,2);assert.equal(index.images[0].missing,1);assert.equal(index.images[0].decorative,1);assert.equal(index.images[0].unknown,0);assert.deepEqual(index.images[0].alts,['Landscape']);assert.equal(index.images[0].width,100);
});
test('resources aggregate references while headings and forms retain occurrences',()=>{
 const elements={images:[],headings:[{level:2,text:'Section',id:'s'}],links:[],resources:[{kind:'script',url:base+'/script.js',type:''}],forms:[{action:base+'/submit',method:'POST',fields:[{name:'email',type:'email'}]}],truncated:true};
 const index=buildIndex(result([page('/',[],{elements}),page('/second',[],{elements})]));
 assert.equal(index.resources.length,1);assert.equal(index.resources[0].sources.length,2);assert.equal(index.headings.length,2);assert.equal(index.forms.length,2);assert.equal(index.truncatedPages,2);
});
test('extension lookup ignores query and case',()=>{assert.equal(extensionOf('https://cdn.example/PHOTO.JPEG?width=2'),'jpeg');assert.equal(extensionOf('https://cdn.example/render?id=1'),'unknown');});
test('preview lookup rejects arbitrary unrecorded URL before networking',async()=>{
 let called=false;await assert.rejects(new MediaPreviews().load(job(),'https://evil.example/',async()=>{called=true;}),/not recorded/);assert.equal(called,false);assert.equal(recordedImage(job(),imageURL),true);
});
for(const target of ['http://127.0.0.1/a.png','http://169.254.169.254/a.png','http://[::1]/a.png','file:///a.png','https://user:password@cdn.example/a.png'])test(`preview rejects unsafe target ${target}`,async()=>{
 let called=false;await assert.rejects(new MediaPreviews().load(job([target]),target,async()=>{called=true;}));assert.equal(called,false);
});
test('preview returns real raster bytes and omits cookie/referrer headers',async()=>{
 let options;const response=await new MediaPreviews().load(job(),imageURL,async(_url,init)=>{options=init;return new Response(png,{headers:{'content-type':'image/png'}});});
 assert.equal(response.type,'image/png');assert.deepEqual(response.bytes,png);assert.equal(options.redirect,'manual');assert.equal(new Headers(options.headers).get('cookie'),null);assert.equal(new Headers(options.headers).get('referer'),null);
});
test('preview checks redirect destination before following private address',async()=>{
 let calls=0;await assert.rejects(new MediaPreviews().load(job(),imageURL,async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});}),/public/);assert.equal(calls,1);
});
test('preview follows a bounded public redirect',async()=>{let calls=0;const r=await new MediaPreviews().load(job(),imageURL,async()=>++calls===1?new Response(null,{status:301,headers:{location:'/new.png'}}):new Response(png,{headers:{'content-type':'image/png'}}));assert.equal(calls,2);assert.equal(r.type,'image/png');});
test('preview redirect loop stops after four requests',async()=>{let calls=0;await assert.rejects(new MediaPreviews().load(job(),imageURL,async()=>{calls++;return new Response(null,{status:302,headers:{location:imageURL}});}),/redirect limit/);assert.equal(calls,4);});
for(const type of ['text/html','image/svg+xml','application/octet-stream'])test(`preview rejects declared ${type}`,async()=>{await assert.rejects(new MediaPreviews().load(job(),imageURL,async()=>new Response(png,{headers:{'content-type':type}})),/raster/);});
test('preview rejects HTML disguised as image/png',async()=>{await assert.rejects(new MediaPreviews().load(job(),imageURL,async()=>new Response('<script>alert(1)</script>',{headers:{'content-type':'image/png'}})),/not a supported raster/);});
test('preview enforces Content-Length cap',async()=>{await assert.rejects(new MediaPreviews().load(job(),imageURL,async()=>new Response(png,{headers:{'content-type':'image/png','content-length':String(5*1024*1024)}})),/4 MiB/);});
test('preview enforces streamed cap without Content-Length',async()=>{await assert.rejects(new MediaPreviews().load(job(),imageURL,async()=>new Response(Buffer.alloc(4*1024*1024+1),{headers:{'content-type':'image/png'}})),/4 MiB/);});
test('preview rejects HTTP failure and releases the concurrency slot',async()=>{const previews=new MediaPreviews();await assert.rejects(previews.load(job(),imageURL,async()=>new Response(null,{status:404})),/HTTP 404/);assert.equal((await previews.load(job(),imageURL,async()=>new Response(png,{headers:{'content-type':'image/png'}}))).type,'image/png');});
test('preview requests cannot exceed four concurrent fetches',async()=>{
 const previews=new MediaPreviews();const releases=[];const slow=()=>new Promise(resolve=>releases.push(()=>resolve(new Response(png,{headers:{'content-type':'image/png'}}))));
 const pending=Array.from({length:4},()=>previews.load(job(),imageURL,slow));await assert.rejects(previews.load(job(),imageURL,slow),/limit reached/);releases.forEach(release=>release());await Promise.all(pending);
});
test('trusted demo raster is available after demo server closes without making requests',async()=>{
 const url='http://127.0.0.1:5555/media/coast.png';let called=false;const r=await new MediaPreviews().load(job([url],{demo:true,url:'http://127.0.0.1:5555/'}),url,async()=>{called=true;});assert.equal(called,false);assert.equal(r.type,'image/png');assert.equal(rasterType(r.bytes),'image/png');
 await assert.rejects(new MediaPreviews().load(job(['http://127.0.0.1:6666/media/coast.png'],{demo:true,url:'http://127.0.0.1:5555/'}),'http://127.0.0.1:6666/media/coast.png'),/No raster/);
});
test('raster signature detection rejects empty buffers and scripts',()=>{assert.equal(rasterType(Buffer.alloc(0)),undefined);assert.equal(rasterType(Buffer.from('<svg></svg>')),undefined);assert.equal(rasterType(png),'image/png');});
test('real visual crawl captures all element categories, authenticated previews, and legacy export',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'atlas-api-'));const app=await startStudio({port:0,directory});t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
 const origin=`http://127.0.0.1:${app.port}`;const html=await(await fetch(origin)).text();const token=/name="session-token" content="([a-f0-9]+)"/.exec(html)[1];
 const api=(path,body)=>fetch(origin+path,{method:body?'POST':'GET',headers:{'X-Crawler-Token':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const created=await(await api('/api/jobs',{demo:true,atlas:true,options:{delayMs:100,maxPages:100}})).json();assert.ok(created.id);
 let crawl;for(let i=0;i<250;i++){crawl=await(await api('/api/jobs/'+created.id)).json();if(!['running','paused','stopping'].includes(crawl.status))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(crawl.status,'completed');const index=buildIndex(crawl.result);assert.equal(index.pages.length,37);assert.equal(index.images.length,8);for(const type of ['links','headings','resources','forms'])assert.ok(index[type].length>0);
 const path=`/api/jobs/${created.id}/image?url=${encodeURIComponent(index.images[0].url)}`;
 assert.equal((await fetch(origin+path)).status,403);const raster=await api(path);assert.equal(raster.status,200);assert.equal(raster.headers.get('content-type'),'image/png');assert.equal(rasterType(Buffer.from(await raster.arrayBuffer())),'image/png');
 assert.equal((await api(`/api/jobs/${created.id}/image?url=${encodeURIComponent('http://169.254.169.254/')} ` .trim())).status,400);
 const legacy=await(await api(`/api/jobs/${created.id}/export?format=json`)).json();assert.ok(['url','heading','first_paragraph','outgoing_links','image_urls'].every(key=>key in legacy[0]));
 for(const file of ['/atlas.js','/atlas-model.js','/atlas-graph.js','/atlas-elements.js','/atlas-shared.js','/atlas.css'])assert.equal((await fetch(origin+file)).status,200);
});
