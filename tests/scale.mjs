/** Repeatable real-HTTP scale fixture. Never contacts a third-party website.
 * Metrics are observations on the executing machine, not performance guarantees.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { cpus, platform } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { runCrawl } from '../dist/engine.js';
import { buildIndex, mapSubset, layoutMap } from '../ui-dist/atlas-model.js';
import { datasets, filteredRows } from '../ui-dist/workbench-model.js';
const count = 1000;
let requests=0, active=0, peakActive=0, peakRss=process.memoryUsage().rss;
const server=createServer((req,res)=>{
  requests++; active++; peakActive=Math.max(peakActive,active);
  res.on('finish',()=>active--);
  if(req.url==='/robots.txt'){res.setHeader('Content-Type','text/plain');res.end('User-agent: *\nAllow: /');return;}
  const index=Number(/\/page-(\d+)$/.exec(req.url??'')?.[1]??0);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const links=Array.from({length:6},(_,offset)=>{const next=(index+[1,2,10,20,100,200][offset])%count;return `<a href="/group-${Math.floor(next/100)}/page-${next}">Page ${next}</a>`;}).join('');
  res.end(`<!doctype html><html lang="en"><head><title>Fixture ${index}</title><meta name="description" content="Local scale fixture"><script type="application/ld+json">{"@type":"Article","headline":"Fixture ${index}"}</script></head><body><h1>Fixture ${index}</h1><p>${'Meaningful local fixture content. '.repeat(15)}</p>${links}<img src="/image-${index%10}.png" alt="Fixture image" width="100" height="100"></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
try {
  const started=performance.now();
  const result=await runCrawl(origin+'/group-0/page-0',{mode:'smart',maxPages:count,maxConcurrency:6,maxDepth:50,delayMs:0,retries:0,timeoutMs:5000,maxDurationMs:120000,maxQueryVariants:1},{fetchImpl:(url,init)=>{assert.equal(new URL(url).origin,origin);return fetch(url,init);},onProgress:()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);}});
  const elapsed=performance.now()-started;
  assert.equal(result.summary.pages_crawled,count);assert.equal(result.errors.length,0);assert.equal(result.telemetry.browser_pages,0);
  let t=performance.now();const index=buildIndex(result);const indexMs=performance.now()-t;
  t=performance.now();const work=datasets({id:'scale-fixture',result,options:result.options});const gridMs=performance.now()-t;
  t=performance.now();const filtered=filteredRows(work.links,'page-99',{},'Source',false);const filterMs=performance.now()-t;
  const subset=mapSubset(index,{states:['page'],query:'',group:'',focus:'',limit:500});
  t=performance.now();const positions=layoutMap(subset.nodes,subset.edges,'web');const layoutMs=performance.now()-t;assert.equal(positions.size,500);
  const jsonStart=performance.now();const bytes=Buffer.byteLength(JSON.stringify(result));const serializationMs=performance.now()-jsonStart;
  const metrics={fixture:'1000 real HTTP HTML pages / six outgoing links per page / parsed JSON-LD / ten referenced images',node:process.version,os:platform(),logical_cpus:cpus().length,pages:count,requests,peak_server_requests:peakActive,browser_renders:result.telemetry.browser_pages,elapsed_ms:Math.round(elapsed),pages_per_second:Number((count*1000/elapsed).toFixed(1)),peak_node_rss_mib:Number((peakRss/1048576).toFixed(1)),serialized_result_mib:Number((bytes/1048576).toFixed(2)),atlas_index_ms:Number(indexMs.toFixed(2)),analysis_index_ms:Number(gridMs.toFixed(2)),link_filter_ms:Number(filterMs.toFixed(2)),filtered_links:filtered.length,graph_nodes:positions.size,graph_edges:subset.edges.length,graph_layout_ms:Number(layoutMs.toFixed(2)),serialization_ms:Number(serializationMs.toFixed(2))};
  console.log(JSON.stringify(metrics,null,2));
  if(process.env.SCALE_OUTPUT)await writeFile(process.env.SCALE_OUTPUT,JSON.stringify(metrics,null,2)+'\n');
} finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
