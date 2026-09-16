/** Pure analysis of already downloaded records. No network or DOM dependencies. */
import type { CrawlResult, CrawledPage } from '../src/types.js';
export type NodeState='page'|'error'|'external'|'discovered';
export interface MapNode {id:string;path:string;group:string;state:NodeState;depth:number;status:number;title:string;inbound:number;outbound:number;root:boolean;}
export interface MapEdge {source:string;target:string;}
export interface ImageRecord {url:string;sources:string[];alts:string[];missing:number;decorative:number;unknown:number;width:number|null;height:number|null;extension:string;}
export interface ElementRecord {kind:string;url:string;text:string;detail:string;sources:string[];}
export interface AtlasIndex {
  pages:CrawledPage[];nodes:MapNode[];edges:MapEdge[];byID:Map<string,MapNode>;root:string;
  images:ImageRecord[];links:ElementRecord[];headings:ElementRecord[];resources:ElementRecord[];forms:ElementRecord[];
  legacyPages:number;truncatedPages:number;groups:{name:string;count:number}[];
}
export const normalize=(value:string)=>{try{const u=new URL(value);u.hash='';return u.href;}catch{return value;}};
export const groupOf=(value:string)=>{try{return new URL(value).pathname.split('/').filter(Boolean)[0]??'(root)';}catch{return '(other)';}};
export const extensionOf=(value:string)=>{try{return /\.([a-z0-9]{1,8})$/i.exec(new URL(value).pathname)?.[1]?.toLowerCase()??'unknown';}catch{return 'unknown';}};
const asArray=<T>(value:T[]|undefined)=>value??[];

/** Redirect aliases are resolved before edges and inbound counts are calculated. */
export function buildIndex(result:CrawlResult):AtlasIndex {
  const pages=Object.values(result.pages),aliases=new Map<string,string>();
  for(const p of pages){aliases.set(normalize(p.requested_url),normalize(p.url));aliases.set(normalize(p.url),normalize(p.url));}
  const identity=(u:string)=>aliases.get(normalize(u))??normalize(u);
  const origin=new URL(result.start_url).origin, root=identity(result.start_url);
  const byID=new Map<string,MapNode>();
  const add=(url:string,state:NodeState,depth=-1,status=0,title='')=>{
    const id=identity(url);if(byID.has(id))return;
    let path=id;try{const u=new URL(id);path=u.pathname+u.search;}catch{/* preserved for diagnostics */}
    byID.set(id,{id,path,group:state==='external'?'external':groupOf(id),state,depth,status,title,inbound:0,outbound:0,root:id===root});
  };
  for(const p of pages)add(p.url,'page',p.depth,p.status_code,p.title||p.heading);
  for(const e of result.errors)add(e.url,'error',-1,e.status_code??0,e.kind);
  const edges:MapEdge[]=[],edgeKeys=new Set<string>();
  for(const p of pages)for(const raw of p.outgoing_links){
    let target=identity(raw);try{new URL(target);}catch{continue;}
    add(target,new URL(target).origin===origin?'discovered':'external');
    const source=identity(p.url),key=source+'\n'+target;
    if(edgeKeys.has(key))continue;edgeKeys.add(key);edges.push({source,target});
    byID.get(source)!.outbound++;byID.get(target)!.inbound++;
  }
  const imageMap=new Map<string,ImageRecord>();
  const imageFor=(url:string,page:string)=>{
    let row=imageMap.get(url);if(!row){row={url,sources:[],alts:[],missing:0,decorative:0,unknown:0,width:null,height:null,extension:extensionOf(url)};imageMap.set(url,row);}
    if(!row.sources.includes(page))row.sources.push(page);return row;
  };
  const resourcesMap=new Map<string,ElementRecord>(),linkMap=new Map<string,ElementRecord>();
  const headings:ElementRecord[]=[],forms:ElementRecord[]=[];
  for(const p of pages){
    const captured=new Set<string>();
    for(const image of asArray(p.elements?.images))for(const url of image.candidates){
      captured.add(url);const row=imageFor(url,p.url);
      if(image.alt===null)row.missing++;else if(image.alt==='')row.decorative++;else if(!row.alts.includes(image.alt))row.alts.push(image.alt);
      row.width??=image.width;row.height??=image.height;
    }
    for(const url of p.image_urls)if(!captured.has(url))imageFor(url,p.url).unknown++;
    const linkElements=p.elements?.links??p.outgoing_links.map(url=>({url,text:'',rel:'',target:''}));
    for(const link of linkElements){
      let row=linkMap.get(link.url);if(!row){row={kind:new URL(link.url).origin===origin?'internal':'external',url:link.url,text:link.text,detail:link.rel,sources:[]};linkMap.set(link.url,row);}
      if(!row.sources.includes(p.url))row.sources.push(p.url);
      if(link.text&&!row.text.split(' · ').includes(link.text)&&row.text.length<1000)row.text=row.text?`${row.text} · ${link.text}`:link.text;
      if(link.rel&&!row.detail.split(' ').includes(link.rel))row.detail=`${row.detail} ${link.rel}`.trim();
    }
    for(const r of asArray(p.elements?.resources)){
      const key=r.kind+'\n'+r.url;let row=resourcesMap.get(key);
      if(!row){row={kind:r.kind,url:r.url,text:extensionOf(r.url),detail:r.type,sources:[]};resourcesMap.set(key,row);}if(!row.sources.includes(p.url))row.sources.push(p.url);
    }
    for(const h of asArray(p.elements?.headings))headings.push({kind:`H${h.level}`,url:p.url,text:h.text,detail:h.id?`#${h.id}`:'',sources:[p.url]});
    for(const f of asArray(p.elements?.forms))forms.push({kind:f.method,url:f.action,text:`${f.fields.length} controls`,detail:f.fields.map(c=>`${c.name||'(unnamed)'}: ${c.type}`).join(' · '),sources:[p.url]});
  }
  const groups=new Map<string,number>();for(const p of pages)groups.set(groupOf(p.url),(groups.get(groupOf(p.url))??0)+1);
  return {pages,nodes:[...byID.values()],edges,byID,root,images:[...imageMap.values()],links:[...linkMap.values()],headings,resources:[...resourcesMap.values()],forms,
    legacyPages:pages.filter(p=>!p.elements).length,truncatedPages:pages.filter(p=>p.elements?.truncated).length,
    groups:[...groups].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))};
}
/** Breadth-first traversal follows directed, observed hyperlinks, not guessed directory edges. */
export function shortestRoute(index:AtlasIndex,target:string):string[] {
  if(!index.byID.has(index.root)||!index.byID.has(target))return [];
  const adjacency=new Map<string,string[]>();for(const e of index.edges){if(!adjacency.has(e.source))adjacency.set(e.source,[]);adjacency.get(e.source)!.push(e.target);}
  const parent=new Map<string,string|null>([[index.root,null]]),queue=[index.root];
  for(let i=0;i<queue.length;i++){const current=queue[i]!;if(current===target)break;for(const to of adjacency.get(current)??[])if(!parent.has(to)){parent.set(to,current);queue.push(to);}}
  if(!parent.has(target))return [];
  const path:string[]=[];let current:string|null=target;
  while(current!==null){path.push(current);current=parent.get(current)??null;}return path.reverse();
}
export interface MapFilter {query:string;group:string;states:NodeState[];focus:string;limit:number;}
export function mapSubset(index:AtlasIndex,filter:MapFilter){
  const nearby=new Set([filter.focus]);if(filter.focus)for(const e of index.edges)if(e.source===filter.focus||e.target===filter.focus){nearby.add(e.source);nearby.add(e.target);}
  const matched=index.nodes.filter(n=>filter.states.includes(n.state)&&(!filter.group||n.group===filter.group)&&(!filter.query||`${n.id} ${n.title}`.toLowerCase().includes(filter.query.toLowerCase()))&&(!filter.focus||nearby.has(n.id)));
  matched.sort((a,b)=>Number(b.id===filter.focus)-Number(a.id===filter.focus)||Number(b.root)-Number(a.root)||b.inbound-a.inbound||a.id.localeCompare(b.id));
  const nodes=matched.slice(0,Math.min(500,Math.max(1,filter.limit))),ids=new Set(nodes.map(n=>n.id));
  const edges=index.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target);
  return {nodes,edges:edges.slice(0,3000),matched:matched.length,totalEdges:edges.length};
}
export type Layout='web'|'radial'|'columns';
export type Position={x:number;y:number};
/** Deterministic bounded force relaxation: no perpetual animation or background workers. */
export function layoutMap(nodes:MapNode[],edges:MapEdge[],mode:Layout):Map<string,Position>{
  const points=new Map<string,Position>();const groups=[...new Set(nodes.map(n=>n.group))].sort();
  const siblings=new Map<string,MapNode[]>();for(const n of nodes){const key=mode==='columns'?String(n.depth<0?8:n.depth):n.group;if(!siblings.has(key))siblings.set(key,[]);siblings.get(key)!.push(n);}
  const keys=[...siblings.keys()].sort((a,b)=>mode==='columns'?Number(a)-Number(b):a.localeCompare(b));
  for(const n of nodes){const key=mode==='columns'?String(n.depth<0?8:n.depth):n.group;const list=siblings.get(key)!;const i=list.indexOf(n),g=keys.indexOf(key);
    if(mode==='columns'){points.set(n.id,{x:keys.length===1?500:70+g/(keys.length-1)*860,y:50+(i+.5)/list.length*500});continue;}
    const angle=(g+(i+.5)/list.length)/Math.max(1,groups.length)*Math.PI*2-Math.PI/2;
    const radius=mode==='radial'?Math.min(255,90+Math.max(n.depth,0)*62):155+((i*31)%100);
    points.set(n.id,n.root?{x:500,y:300}:{x:500+Math.cos(angle)*radius*1.48,y:300+Math.sin(angle)*radius});
  }
  if(mode!=='web'||nodes.length<2)return points;
  const ids=nodes.map(n=>n.id),links=edges.map(e=>[ids.indexOf(e.source),ids.indexOf(e.target)]).filter(e=>e[0]!>=0&&e[1]!>=0);
  const p=ids.map(id=>points.get(id)!);
  for(let step=0;step<65;step++){
    const delta=p.map(()=>({x:0,y:0}));
    for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
      const dx=p[i]!.x-p[j]!.x||.01,dy=p[i]!.y-p[j]!.y||.01;const d2=Math.max(120,dx*dx+dy*dy),f=620/d2;
      delta[i]!.x+=dx*f;delta[i]!.y+=dy*f;delta[j]!.x-=dx*f;delta[j]!.y-=dy*f;
    }
    for(const [i=0,j=0]of links){const dx=p[j]!.x-p[i]!.x,dy=p[j]!.y-p[i]!.y;const d=Math.hypot(dx,dy)||1;const f=(d-95)*.015;delta[i]!.x+=dx/d*f;delta[i]!.y+=dy/d*f;delta[j]!.x-=dx/d*f;delta[j]!.y-=dy/d*f;}
    const cool=1-step/85;
    for(let i=0;i<p.length;i++){if(nodes[i]!.root){p[i]={x:500,y:300};points.set(ids[i]!,p[i]!);continue;}p[i]!.x=Math.min(938,Math.max(62,p[i]!.x+(Math.max(-10,Math.min(10,delta[i]!.x))+(500-p[i]!.x)*.018)*cool));p[i]!.y=Math.min(535,Math.max(65,p[i]!.y+(Math.max(-10,Math.min(10,delta[i]!.y))+(300-p[i]!.y)*.018)*cool));const ex=(p[i]!.x-500)/425,ey=(p[i]!.y-300)/238,r=Math.hypot(ex,ey);if(r>1){p[i]!.x=500+ex/r*425;p[i]!.y=300+ey/r*238;}}
  }
  return points;
}
