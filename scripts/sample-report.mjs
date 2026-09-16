// Repository note: Generates repository sample reports from deterministic demonstration data.
// Generates sample report assets used for documentation and manual inspection.

import { writeReports } from '../dist/report.js';
import { DEFAULT_OPTIONS } from '../dist/options.js';
// Explicitly synthetic sample, used to demonstrate reports without a network crawl.
const origin = 'https://field-notes.example';
const specifications = [
  ['/', 'Field Notes', ['/guides','/about','/journal'],0],
  ['/guides','Practical guides',['/guides/getting-started','/guides/robots','/'],1],
  ['/about','About Field Notes',['/contact','https://example.com/'],1],
  ['/journal','The journal',['/journal/reliability','/journal/testing'],1],
  ['/contact','Contact',['/'],2],
  ['/guides/getting-started','Getting started',['/guides/robots'],2],
  ['/guides/robots','Robots policy',['/guides'],2],
  ['/journal/reliability','Reliability matters',['/journal/testing'],2],
  ['/journal/testing','Test the unhappy paths',['/guides/getting-started'],2],
];
const pages = Object.fromEntries(specifications.map(([path,title,links,depth],i) => {
  const url=origin+path;const outgoing_links=links.map(link=>new URL(link,origin).href);
  return [url,{url,requested_url:url,title,heading:title,first_paragraph:'Synthetic example content for the offline report demonstration.',outgoing_links,image_urls:[],canonical_url:'',description:'Example dataset, not a live website crawl.',status_code:200,depth,duration_ms:25+i*7,content_bytes:1200+i*100,internal_links:outgoing_links.filter(x=>new URL(x).origin===origin),external_links:outgoing_links.filter(x=>new URL(x).origin!==origin)}];
}));
const all = Object.values(pages);
const result = {schema_version:1,start_url:origin+'/',started_at:'2026-09-16T14:00:00.000Z',finished_at:'2026-09-16T14:00:01.800Z',duration_ms:1800,options:{...DEFAULT_OPTIONS},pages,errors:[],warnings:['Synthetic sample dataset — these example URLs were not fetched.'],skipped:{duplicate:4,robots:1},summary:{pages_crawled:all.length,urls_scheduled:all.length,requests:10,retries:0,failed:0,unique_internal_links:new Set(all.flatMap(p=>p.internal_links)).size,unique_external_links:new Set(all.flatMap(p=>p.external_links)).size,unique_images:0,limit_reached:false,stopped:false}};
for(const path of writeReports(result,'examples/sample.json'))console.log(path);
