/** Coordinates the visualization workspace while keeping data analysis separate from DOM rendering. */
import { buildIndex, type AtlasIndex, type MapNode } from './atlas-model.js';
import { Spiderweb } from './atlas-graph.js';
import { ElementExplorer } from './atlas-elements.js';
import { esc, fmt, bytes, pathLabel, palette, type AtlasHost, type AtlasJob } from './atlas-shared.js';
export type AtlasTab='overview'|'graph'|'paths'|'elements';

export class AtlasWorkspace {
  private key='';private jobID='';private index?:AtlasIndex;private view='';private target?:HTMLElement;
  private graph:Spiderweb;private elements:ElementExplorer;private pathQuery='';private pathAll=true;
  private host:AtlasHost;
  constructor(host:AtlasHost){this.host=host;this.graph=new Spiderweb(host);this.elements=new ElementExplorer(host);}
  indexFor(job:AtlasJob):AtlasIndex|undefined{
    if(!job.result)return undefined;
    if(this.jobID!==job.id){this.elements.dispose();this.graph=new Spiderweb(this.host);this.elements=new ElementExplorer(this.host);this.jobID=job.id;this.view='';this.pathQuery='';}
    const key=job.id+':'+job.revision;
    if(this.key!==key){this.index=buildIndex(job.result);this.key=key;}
    return this.index;
  }
  render(target:HTMLElement,tab:AtlasTab,job:AtlasJob|undefined):void{
    if(!job?.result){target.innerHTML='<div class="empty-state"><h3>Waiting for crawl records</h3><p>The visual workspace fills as pages are collected.</p></div>';this.view='';return;}
    const index=this.indexFor(job)!;
    const changed=this.view!==tab||this.target!==target;
    if(changed)this.elements.suspend();this.target=target;this.view=tab;
    if(tab==='graph'){if(changed)this.graph.mount(target);this.graph.update(index);return;}
    if(tab==='elements'){if(changed)this.elements.mount(target);this.elements.update(index,job);return;}
    if(tab==='overview'){this.overview(target,index,job);return;}
    if(changed)this.mountPaths(target);
    this.paths(index);
  }
  leave():void{this.view='';this.elements.suspend();}
  openElementsForPage(url:string):void{this.elements.focusSource(url);this.host.navigate('elements');}
  openImages(filter=''):void{this.elements.choose('images',filter);this.host.navigate('elements');}
  private overview(target:HTMLElement,index:AtlasIndex,job:AtlasJob):void{
    const statuses=new Map<string,number>();for(const p of index.pages){const code=String(p.status_code);statuses.set(code,(statuses.get(code)??0)+1);}for(const error of job.result!.errors){const code=error.status_code?String(error.status_code):'Network / other';statuses.set(code,(statuses.get(code)??0)+1);}
    const depths=new Map<number,number>();for(const p of index.pages)depths.set(p.depth,(depths.get(p.depth)??0)+1);
    const totalBytes=index.pages.reduce((sum,p)=>sum+p.content_bytes,0),times=index.pages.map(p=>p.duration_ms).sort((a,b)=>a-b);
    const median=times.length?times[Math.floor(times.length/2)]!:0,missing=index.images.filter(r=>r.missing>0).length;
    const bars=(rows:{name:string;count:number}[],colorOffset=0)=>{const max=Math.max(1,...rows.map(r=>r.count));return rows.slice(0,9).map((r,i)=>`<div class="atlas-bar-row"><div><span>${esc(r.name)}</span><b>${fmt(r.count)}</b></div><svg viewBox="0 0 400 8" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="8" rx="4" fill="var(--atlas-track)"/><rect width="${r.count/max*400}" height="8" rx="4" fill="${palette[(i+colorOffset)%palette.length]}"/></svg></div>`).join('');};
    const hubs=[...index.nodes].filter(n=>n.state==='page').sort((a,b)=>b.inbound-a.inbound).slice(0,6);
    target.innerHTML=`<div class="atlas atlas-overview"><div class="atlas-heading"><div><span class="atlas-kicker">CRAWL INTELLIGENCE</span><h3>The shape of your website.</h3><p>Only captured records are analyzed. A bounded crawl is not a complete site audit.</p></div><span class="atlas-tag ${job.result!.summary.limit_reached?'warn':'good'}">${job.result!.summary.limit_reached?'Budget reached · partial inventory':job.status==='completed'?'Crawl complete within limits':'Live / partial snapshot'}</span></div><div class="atlas-stat-grid"><button data-atlas-tab="graph"><small>Known URLs</small><strong>${fmt(index.nodes.length)}</strong><span>Explore the spiderweb ↗</span></button><button data-atlas-tab="elements"><small>Unique image URLs</small><strong>${fmt(index.images.length)}</strong><span>${missing} with missing alt attributes ↗</span></button><div><small>Captured HTML</small><strong>${bytes(totalBytes)}</strong><span>Excludes images and subresources</span></div><div><small>Median fetch time</small><strong>${fmt(median)} <em>ms</em></strong><span>HTML request + body, not page load</span></div></div><div class="atlas-dashboard-grid"><section class="atlas-card"><div class="atlas-card-title"><h4>URL path distribution</h4><button data-atlas-tab="paths">Browse paths ↗</button></div>${bars(index.groups.map(g=>({name:g.name==='(root)'?'/':'/'+g.name,count:g.count})))}<p class="atlas-fine">Crawled pages grouped by the first path segment.</p></section><section class="atlas-card"><div class="atlas-card-title"><h4>Recorded HTTP outcomes</h4><span>${index.pages.length+job.result!.errors.length} records</span></div>${bars([...statuses].map(([name,count])=>({name:name==='Network / other'?name:'HTTP '+name,count})),2)}<p class="atlas-fine">Page and failure records, not individual retry attempts.</p><div class="atlas-separator"></div><h4>Discovery depth</h4>${bars([...depths].sort((a,b)=>a[0]-b[0]).map(([name,count])=>({name:'Depth '+name,count})),4)}</section><section class="atlas-card"><div class="atlas-card-title"><h4>Most referenced pages</h4><span>Inbound links</span></div><div class="atlas-ranking">${hubs.map((n,i)=>`<button data-atlas-page="${esc(n.id)}"><small>${String(i+1).padStart(2,'0')}</small><span><strong>${esc(n.title||n.path)}</strong><small>${esc(n.path)}</small></span><b>${n.inbound}</b></button>`).join('')}</div><p class="atlas-fine">Unique linking page → URL pairs in this crawl. Not a search ranking.</p></section><section class="atlas-card"><div class="atlas-card-title"><h4>Elements at a glance</h4><button data-atlas-tab="elements">Open explorer ↗</button></div><div class="atlas-element-stats">${[['Images',index.images.length],['Links',index.links.length],['Headings',index.headings.length],['Resources',index.resources.length],['Forms',index.forms.length]].map(([label,count])=>`<button data-atlas-tab="elements"><span>${label}</span><b>${fmt(Number(count))}</b></button>`).join('')}</div><div class="atlas-quality"><span class="atlas-tag warn">${missing} image URLs missing alt</span><p>Empty alt attributes may be intentional. Older crawl records do not contain this metadata.</p><button class="button" data-missing-alt>Review images</button></div></section></div></div>`;
    target.querySelectorAll<HTMLElement>('[data-atlas-tab]').forEach(el=>el.addEventListener('click',()=>this.host.navigate(el.dataset.atlasTab!)));
    target.querySelectorAll<HTMLElement>('[data-atlas-page]').forEach(el=>el.addEventListener('click',()=>this.host.openPage(el.dataset.atlasPage!)));
    target.querySelector('[data-missing-alt]')?.addEventListener('click',()=>this.openImages('missing'));
  }
  private mountPaths(target:HTMLElement):void{
    target.innerHTML=`<div class="atlas atlas-paths"><div class="atlas-heading"><div><span class="atlas-kicker">URL PATH EXPLORER</span><h3>From domain to directory.</h3><p>A path hierarchy of known URLs. Folders are organizational groups, not inferred hyperlinks.</p></div><div class="atlas-actions"><button class="button" data-path-action="expand">Expand all</button><button class="button" data-path-action="collapse">Collapse all</button></div></div><div class="atlas-path-controls"><label class="atlas-search"><span>⌕</span><input type="search" id="path-search" aria-label="Search URL paths" placeholder="Filter a path or page title"></label><label><input type="checkbox" id="path-all" checked> Include failed and discovered URLs</label><span id="path-count" class="atlas-tag"></span></div><div id="path-tree" class="atlas-path-tree"></div></div>`;
    const wrapper=target.firstElementChild!;
    const search=wrapper.querySelector<HTMLInputElement>('#path-search')!;search.value=this.pathQuery;
    const all=wrapper.querySelector<HTMLInputElement>('#path-all')!;all.checked=this.pathAll;
    search.addEventListener('input',()=>{this.pathQuery=search.value;this.paths(this.index!);});all.addEventListener('change',()=>{this.pathAll=all.checked;this.paths(this.index!);});
    wrapper.addEventListener('click',e=>{const el=(e.target as Element).closest<HTMLElement>('[data-path-action],[data-path-page]');if(!el)return;
      if(el.dataset.pathPage){this.host.openPage(el.dataset.pathPage);return;}
      wrapper.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>{d.open=el.dataset.pathAction==='expand';});});
  }
  private paths(index:AtlasIndex):void{
    const target=this.target!.querySelector<HTMLElement>('#path-tree');if(!target)return;
    const open=new Set(Array.from(target.querySelectorAll<HTMLDetailsElement>('details[open]')).map(d=>d.dataset.path));
    type Tree={path:string;name:string;children:Map<string,Tree>;urls:MapNode[];count:number};
    const root:Tree={path:'',name:'/',children:new Map(),urls:[],count:0};
    const nodes=index.nodes.filter(n=>n.state!=='external'&&(this.pathAll||n.state==='page')&&`${n.id} ${n.title}`.toLowerCase().includes(this.pathQuery.toLowerCase())).sort((a,b)=>a.path.localeCompare(b.path));
    for(const n of nodes){let current=root;current.count++;const segments=new URL(n.id).pathname.split('/').filter(Boolean);for(const name of segments){const path=current.path+'/'+name;if(!current.children.has(name))current.children.set(name,{path,name,children:new Map(),urls:[],count:0});current=current.children.get(name)!;current.count++;}current.urls.push(n);}
    const leaf=(n:MapNode)=>`<div class="atlas-path-leaf"><span class="atlas-path-line"></span><span class="atlas-state ${n.state}"></span><button data-path-page="${esc(n.id)}"><strong>${esc(n.path)}</strong><small>${esc(n.title||n.state)}</small></button><span class="atlas-tag ${n.state==='error'?'warn':''}">${n.status?'HTTP '+n.status:esc(n.state)}</span><span class="atlas-fine">${n.inbound} in · ${n.outbound} out</span></div>`;
    const branch=(t:Tree):string=>`<details data-path="${esc(t.path)}" ${this.pathQuery||open.has(t.path)?'open':''}><summary><span class="atlas-folder">▱</span><strong>/${esc(t.name)}</strong><small>${t.count} URLs</small><span class="atlas-fine">${t.urls.length?'Contains recorded URL':'Path group'}</span></summary><div class="atlas-path-children">${t.urls.map(leaf).join('')}${[...t.children.values()].map(child=>child.children.size?branch(child):child.urls.map(leaf).join('')).join('')}</div></details>`;
    target.innerHTML=`<div class="atlas-path-root"><span>◎</span><strong>${esc(this.index?.root?new URL(this.index.root).host:'Site')}</strong><span>Known URL hierarchy</span></div>${root.urls.map(leaf).join('')}${[...root.children.values()].map(branch).join('')}${nodes.length?'':'<div class="empty-state"><h3>No matching URL paths</h3></div>'}`;
    this.target!.querySelector('#path-count')!.textContent=`${nodes.length} URLs`;
  }
}
