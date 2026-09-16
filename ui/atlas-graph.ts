/** Interactive spiderweb built from observed directed hyperlinks, not an inferred sitemap. */
import { layoutMap, mapSubset, shortestRoute, type AtlasIndex, type Layout, type MapFilter, type Position } from './atlas-model.js';
import { esc, fmt, externalLink, palette, saveFile, type AtlasHost } from './atlas-shared.js';

export class Spiderweb {
  private container?:HTMLElement;
  private index?:AtlasIndex;
  private pendingIndex?:AtlasIndex;
  private selected='';
  private filter:MapFilter={query:'',group:'',states:['page','error','discovered'],focus:'',limit:250};
  private coloring='directory';
  private mode:Layout='web';
  private positions=new Map<string,Position>();
  private signature='';
  private camera=[0,0,1000,600];
  private route:string[]=[];
  private labels=true;
  private dragging=false;
  private held=false;
  private host:AtlasHost;
  constructor(host:AtlasHost){this.host=host;}
  mount(target:HTMLElement):void {
    target.innerHTML=`<div class="atlas atlas-map"><div class="atlas-heading"><div><span class="atlas-kicker">SPIDERWEB EXPLORER</span><h3>Follow the connections.</h3><p>Observed links, grouped by URL path. Select a node to explore its neighborhood.</p></div><div class="atlas-actions"><button class="button" data-map="svg">Save SVG</button><button class="button" data-map="png">Save PNG</button><button class="button" data-map="json">Graph JSON</button></div></div>
      <div class="atlas-map-controls"><label class="atlas-search"><span>⌕</span><input id="map-search" type="search" placeholder="Find a URL or page title" aria-label="Search link map"></label><label>Layout<select id="map-layout"><option value="web">Spiderweb</option><option value="radial">Radial depth</option><option value="columns">Discovery layers</option></select></label><label>Path group<select id="map-group"><option value="">All paths</option></select></label><label>Processing<select id="map-rendering"><option value="">All methods</option><option value="http">HTTP</option><option value="browser">Browser</option></select></label><label>Color<select id="map-color"><option value="directory">Directory</option><option value="rendering">Rendering method</option><option value="status">URL state</option></select></label><label>Node limit<select id="map-limit"><option>100</option><option selected>250</option><option>500</option></select></label></div>
      <div class="atlas-map-options"><label><input type="checkbox" data-map-state="page" checked> Crawled pages</label><label><input type="checkbox" data-map-state="error" checked> Failed / non-HTML</label><label><input type="checkbox" data-map-state="discovered" checked> Discovered only</label><label><input type="checkbox" data-map-state="external"> External links</label><label><input id="map-sitemap" type="checkbox"> Sitemap, no captured inlink</label><label><input id="map-labels" type="checkbox" checked> Labels</label><label><input id="map-held" type="checkbox"> Pin snapshot</label></div>
      <div class="atlas-map-layout"><div class="atlas-map-canvas"><div class="atlas-canvas-top"><span><i class="atlas-pulse"></i> SITE TOPOLOGY <span id="map-live"></span></span><span id="map-count"></span></div><svg id="spiderweb" viewBox="0 0 1000 600" role="group" aria-label="Spiderweb of observed hyperlinks. Tab to a node. Enter opens its page inspector."></svg><div class="atlas-map-tools"><button class="icon-button" data-map="zoom-in" aria-label="Zoom in">+</button><button class="icon-button" data-map="zoom-out" aria-label="Zoom out">−</button><button class="button" data-map="fit">Fit map</button><button class="button" data-map="fullscreen">Expand</button><button class="button" data-map="clear">Clear focus</button></div><div id="map-tooltip" class="atlas-map-tooltip" hidden></div></div><aside id="map-inspector" class="atlas-map-inspector" aria-label="Selected node details"></aside></div><div class="atlas-map-footer"><div id="map-legend"></div><span id="map-limits"></span></div></div>`;
    const container=target.firstElementChild as HTMLElement;this.container=container;
    const q=<T extends Element=HTMLElement>(selector:string)=>container.querySelector<T>(selector)!;
    q<HTMLInputElement>('#map-search').value=this.filter.query;
    q<HTMLSelectElement>('#map-layout').value=this.mode;
    q<HTMLSelectElement>('#map-limit').value=String(this.filter.limit);
    q<HTMLSelectElement>('#map-rendering').value=this.filter.rendering??'';
    q<HTMLSelectElement>('#map-color').value=this.coloring;
    q<HTMLInputElement>('#map-sitemap').checked=!!this.filter.sitemapOnly;
    q<HTMLInputElement>('#map-labels').checked=this.labels;
    q<HTMLInputElement>('#map-held').checked=this.held;
    container.querySelectorAll<HTMLInputElement>('[data-map-state]').forEach(el=>{el.checked=this.filter.states.includes(el.dataset.mapState as MapFilter['states'][number]);el.addEventListener('change',()=>{this.filter.states=Array.from(container.querySelectorAll<HTMLInputElement>('[data-map-state]:checked')).map(n=>n.dataset.mapState as MapFilter['states'][number]);this.draw();});});
    q('#map-search').addEventListener('input',()=>{this.filter.query=q<HTMLInputElement>('#map-search').value;this.draw();});
    q('#map-layout').addEventListener('change',()=>{this.mode=q<HTMLSelectElement>('#map-layout').value as Layout;this.signature='';this.draw();});
    q('#map-group').addEventListener('change',()=>{this.filter.group=q<HTMLSelectElement>('#map-group').value;this.draw();});
    q('#map-limit').addEventListener('change',()=>{this.filter.limit=Number(q<HTMLSelectElement>('#map-limit').value);this.draw();});
    q('#map-rendering').addEventListener('change',()=>{this.filter.rendering=q<HTMLSelectElement>('#map-rendering').value;this.draw();});
    q('#map-color').addEventListener('change',()=>{this.coloring=q<HTMLSelectElement>('#map-color').value;this.draw(false);});
    q('#map-sitemap').addEventListener('change',()=>{this.filter.sitemapOnly=q<HTMLInputElement>('#map-sitemap').checked;this.draw();});
    q('#map-labels').addEventListener('change',()=>{this.labels=q<HTMLInputElement>('#map-labels').checked;this.draw();});
    q('#map-held').addEventListener('change',()=>{this.held=q<HTMLInputElement>('#map-held').checked;q('#map-live').textContent=this.held?'· PINNED':'· LIVE';if(!this.held&&this.pendingIndex)this.update(this.pendingIndex,true);});
    container.addEventListener('click',event=>{
      const el=(event.target as Element).closest<HTMLElement>('[data-map],[data-node],[data-inspect]');if(!el)return;
      if(this.dragging){this.dragging=false;return;}
      if(el.dataset.node){this.selected=el.dataset.node;this.route=[];this.draw(false);return;}
      if(el.dataset.inspect){this.host.openPage(el.dataset.inspect);return;}
      const run=async()=>{switch(el.dataset.map){
        case 'fit':this.camera=[0,0,1000,600];this.applyCamera();break;
        case 'zoom-in':this.zoom(.8);break;case 'zoom-out':this.zoom(1.25);break;
        case 'clear':this.filter.focus='';this.filter.group='';this.filter.query='';this.selected='';this.route=[];q<HTMLInputElement>('#map-search').value='';q<HTMLSelectElement>('#map-group').value='';this.draw();break;
        case 'focus':this.filter.query='';this.filter.group='';q<HTMLInputElement>('#map-search').value='';q<HTMLSelectElement>('#map-group').value='';this.filter.focus=this.selected;this.camera=[0,0,1000,600];this.signature='';this.draw();break;
        case 'trace':this.route=this.index?shortestRoute(this.index,this.selected):[];if(!this.route.length)this.host.notify('No directed route from the start was found in the captured links.');this.draw(false);break;
        case 'fullscreen':if(document.fullscreenElement)await document.exitFullscreen();else await q<HTMLElement>('.atlas-map-layout').requestFullscreen();break;
        case 'json':if(this.index)saveFile(JSON.stringify({note:'Observed hyperlinks only; nodes outside the crawl may not have been fetched.',nodes:this.index.nodes,edges:this.index.edges},null,2),'crawl-graph.json');break;
        case 'svg':saveFile(this.svgMarkup(),'crawl-spiderweb.svg','image/svg+xml');break;
        case 'png':await this.png();break;
      }};void run().catch(error=>this.host.notify(String(error)));
    });
    const svg=q<SVGSVGElement>('#spiderweb');
    svg.addEventListener('keydown',e=>{const node=(e.target as Element).closest<SVGGElement>('[data-node]');if(!node)return;
      if(e.key==='Enter'){e.preventDefault();this.host.openPage(node.dataset.node!);}
      if(e.key===' '){e.preventDefault();this.selected=node.dataset.node!;this.route=[];this.draw(false);}
    });
    let drag:{id:string;x:number;y:number;camera:number[];point:Position;pointer:number}|undefined;
    svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const node=(e.target as Element).closest<SVGGElement>('[data-node]');const id=node?.dataset.node??'';drag={id,x:e.clientX,y:e.clientY,camera:[...this.camera],point:{...(this.positions.get(id)??{x:0,y:0})},pointer:e.pointerId};this.dragging=false;svg.setPointerCapture(e.pointerId);});
    svg.addEventListener('pointermove',e=>{
      const tooltip=q<HTMLElement>('#map-tooltip');
      if(drag){const rect=svg.getBoundingClientRect(),dx=(e.clientX-drag.x)*this.camera[2]!/rect.width,dy=(e.clientY-drag.y)*this.camera[3]!/rect.height;
        if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4)this.dragging=true;
        if(drag.id){this.positions.set(drag.id,{x:drag.point.x+dx,y:drag.point.y+dy});this.draw(false);}else{this.camera[0]=drag.camera[0]!-dx;this.camera[1]=drag.camera[1]!-dy;this.applyCamera();}tooltip.hidden=true;return;}
      const node=(e.target as Element).closest<SVGGElement>('[data-node]');tooltip.hidden=!node; if(node)tooltip.textContent=this.index?.byID.get(node.dataset.node!)?.id??'';
    });
    const end=()=>{drag=undefined;};svg.addEventListener('pointerup',()=>{if(drag?.id&&!this.dragging){this.selected=drag.id;this.route=[];this.draw(false);}end();});svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
    svg.addEventListener('pointerleave',()=>{q<HTMLElement>('#map-tooltip').hidden=true;});
    svg.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY>0?1.1:.9);},{passive:false});
    if(this.index)this.update(this.index,true);
  }
  update(index:AtlasIndex,force=false):void {
    this.pendingIndex=index;if(this.held&&!force)return;
    this.index=index;if(!this.container)return;
    const select=this.container.querySelector<HTMLSelectElement>('#map-group')!;
    const names=[...new Set(index.nodes.map(n=>n.group))].sort();
    const options='<option value="">All paths</option>'+names.map(name=>`<option value="${esc(name)}">/${esc(name)}</option>`).join('');
    if(select.innerHTML!==options){select.innerHTML=options;if(!names.includes(this.filter.group))this.filter.group='';select.value=this.filter.group;}
    this.draw();
  }
  private draw(recalculate=true):void {
    const index=this.index,root=this.container;if(!index||!root)return;
    const subset=mapSubset(index,this.filter),groups=[...new Set(index.nodes.map(n=>n.group))].sort();
    const sig=this.mode+subset.nodes.map(n=>n.id).join('|')+subset.edges.length;
    if(recalculate&&sig!==this.signature){this.positions=layoutMap(subset.nodes,subset.edges,this.mode);this.signature=sig;}
    const adjacent=new Set([this.selected]);for(const e of subset.edges)if(e.source===this.selected||e.target===this.selected){adjacent.add(e.source);adjacent.add(e.target);}
    const routeEdges=new Set(this.route.slice(1).map((to,i)=>this.route[i]+'\n'+to));
    const color=(state:string,group:string)=>state==='error'?'#ff9c8b':state==='external'?'#a7aebb':state==='discovered'?'#f7c881':palette[groups.indexOf(group)%palette.length]!;
    const nodeColor=(n:typeof subset.nodes[number])=>this.coloring==='rendering'&&n.state==='page'?(n.rendering==='browser'?'#c1a0f2':'#7dbae9'):this.coloring==='status'&&n.state==='page'?'#70d2ba':color(n.state,n.group);
    const edges=subset.edges.map(e=>{const a=this.positions.get(e.source),b=this.positions.get(e.target);if(!a||!b)return '';
      const related=!this.selected||e.source===this.selected||e.target===this.selected;
      const traced=routeEdges.has(e.source+'\n'+e.target);
      return `<path class="atlas-edge ${related?'related':'dim'} ${traced?'traced':''}" d="M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${((a.x+b.x)/2+(b.y-a.y)*.09).toFixed(1)},${((a.y+b.y)/2+(a.x-b.x)*.09).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}" marker-end="url(#atlas-arrow)"/>`;}).join('');
    const nodes=subset.nodes.map(n=>{const a=this.positions.get(n.id);if(!a)return '';const radius=n.root?20:Math.min(17,7+Math.sqrt(n.inbound)*1.8);const selected=n.id===this.selected;
      const short=n.root?'START /':n.path==='/'?new URL(n.id).hostname:'/'+(n.path.split('/').filter(Boolean).pop()??n.path);
      return `<g class="atlas-node ${selected?'selected':''} ${this.selected&&!adjacent.has(n.id)?'dim':''}" transform="translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})" data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="Inspect ${esc(n.path)}" aria-pressed="${selected}"><title>${esc(n.id)} · ${n.state} · ${n.inbound} inbound</title><circle class="atlas-node-halo" r="${radius+6}" fill="${nodeColor(n)}"/><circle r="${radius}" fill="${nodeColor(n)}" stroke="${n.state==='discovered'||n.state==='external'?'#dae2ef':'#101d32'}" stroke-width="2" ${n.state==='discovered'?'stroke-dasharray="3 2"':''}/>${n.sitemap?`<circle r="${radius+3}" fill="none" stroke="#f7c881" stroke-dasharray="2 3"/>`:''}${n.rendering==='browser'&&!n.root?'<text class="atlas-root-label" text-anchor="middle" y="3" font-size="8">JS</text>':''}${n.root?'<text class="atlas-root-label" text-anchor="middle" y="4">⌂</text>':''}${this.labels||selected?`<text class="atlas-node-label" text-anchor="middle" y="${radius+18}">${esc(short.length>25?short.slice(0,22)+'…':short)}</text>`:''}</g>`;}).join('');
    root.querySelector('#spiderweb')!.innerHTML=`<defs><pattern id="atlas-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#465875" opacity=".55"/></pattern><marker id="atlas-arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#7aa6d1"/></marker></defs><rect x="-3000" y="-3000" width="7000" height="7000" fill="#101b2b"/><rect x="-3000" y="-3000" width="7000" height="7000" fill="url(#atlas-dots)"/><g class="atlas-orbits" fill="none" stroke="#30405b"><ellipse cx="500" cy="300" rx="170" ry="112"/><ellipse cx="500" cy="300" rx="315" ry="206"/><ellipse cx="500" cy="300" rx="443" ry="277"/></g>${edges}${nodes}${subset.nodes.length?'':'<text x="500" y="300" fill="#cbd8e7" text-anchor="middle">No nodes match these filters.</text>'}`;
    this.applyCamera();root.querySelector('#map-count')!.textContent=`${fmt(subset.nodes.length)} nodes · ${fmt(subset.edges.length)} links`;
    root.querySelector('#map-limits')!.textContent=`Showing ${subset.nodes.length} / ${subset.matched} matching nodes; ${subset.edges.length} / ${subset.totalEdges} visible links. Amber: discovered. Coral: failed. Gray: external. Dotted gold ring: sitemap. JS: Chromium. Drag to move; scroll to zoom.`;
    root.querySelector('#map-legend')!.innerHTML=(this.coloring==='rendering'?'<span>Blue: HTTP</span><span>Purple: Browser</span>':this.coloring==='status'?'<span>Mint: captured</span><span>Coral: failed</span>':'')+groups.filter(g=>subset.nodes.some(n=>n.group===g)).map(g=>`<span><svg width="9" height="9"><circle cx="4.5" cy="4.5" r="4" fill="${color(g==='external'?'external':'page',g)}"/></svg>${esc(g)}</span>`).join('');
    this.inspector();
  }
  private inspector():void {
    const index=this.index!,target=this.container!.querySelector('#map-inspector')!,node=index.byID.get(this.selected);
    if(!node){target.innerHTML=`<span class="atlas-kicker">CONNECTION INTELLIGENCE</span><h3>Pick a point.<br>Trace a path.</h3><p>Each node is a URL. Lines show observed hyperlinks; arrows point to the destination.</p><div class="atlas-map-stat"><strong>${fmt(index.nodes.length)}</strong><span>known URLs</span></div><div class="atlas-map-stat"><strong>${fmt(index.edges.length)}</strong><span>unique directed links</span></div><p class="atlas-fine">Larger nodes have more inbound links within this crawl. External and discovered-only URLs have not necessarily been fetched.</p><div class="atlas-hubs"><h4>Most referenced pages</h4>${[...index.nodes].filter(n=>n.state==='page').sort((a,b)=>b.inbound-a.inbound).slice(0,5).map(n=>`<button data-node="${esc(n.id)}"><span>${esc(n.path)}</span><b>${n.inbound}</b></button>`).join('')}</div>`;return;}
    const inbound=index.edges.filter(e=>e.target===node.id),outbound=index.edges.filter(e=>e.source===node.id);
    const list=(items:string[])=>items.slice(0,8).map(id=>`<button class="atlas-url-button" data-node="${esc(id)}">${esc(index.byID.get(id)?.path??id)}</button>`).join('')||'<p class="atlas-fine">None captured.</p>';
    target.innerHTML=`<span class="atlas-kicker">${esc(node.state.toUpperCase())} ${node.status?'· HTTP '+node.status:''}</span><h3>${esc(node.title||node.path)}</h3><p class="atlas-fine">${esc(node.rendering?.toUpperCase()??'Not rendered')} ${node.sitemap?'· In sitemap':''}${node.sitemapOnly?' · No captured inlink (not proof of an orphan page)':''}</p><p class="atlas-node-url">${externalLink(node.id)}</p><div class="atlas-pair-stats"><div><b>${inbound.length}</b><small>incoming</small></div><div><b>${outbound.length}</b><small>outgoing</small></div></div><div class="atlas-inspector-actions"><button class="button primary" data-inspect="${esc(node.id)}">Inspect page</button><button class="button" data-map="focus">Focus neighborhood</button><button class="button" data-map="trace">Trace from start</button></div>${this.route.length?`<div class="atlas-route"><h4>${this.route.length-1} links from start</h4><p class="atlas-fine">Shortest route in captured hyperlinks.</p><ol>${this.route.map(id=>`<li><button data-node="${esc(id)}">${esc(index.byID.get(id)?.path??id)}</button></li>`).join('')}</ol></div>`:''}<h4>Linked from · ${inbound.length}</h4>${list(inbound.map(e=>e.source))}<h4>Links to · ${outbound.length}</h4>${list(outbound.map(e=>e.target))}<p class="atlas-fine">Lists show up to 8 neighbors. Traced routes may extend outside the filtered drawing. Graph JSON retains the complete captured edge list.</p>`;
  }
  private applyCamera():void{this.container?.querySelector('#spiderweb')?.setAttribute('viewBox',this.camera.join(' '));}
  private zoom(factor:number):void{const old=this.camera[2]!,width=Math.max(200,Math.min(2400,old*factor)),height=width*.6;this.camera=[this.camera[0]!+(old-width)/2,this.camera[1]!+(this.camera[3]!-height)/2,width,height];this.applyCamera();}
  private svgMarkup():string{
    const clone=this.container!.querySelector<SVGSVGElement>('#spiderweb')!.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','1600');clone.setAttribute('height','960');
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='.atlas-edge{fill:none;stroke:#628dbc;stroke-opacity:.26;stroke-width:1}.atlas-edge.related{stroke-opacity:.55}.atlas-edge.dim{stroke-opacity:.06}.atlas-edge.traced{stroke:#f7ca73;stroke-opacity:1;stroke-width:3}.atlas-node-label{fill:#cbd8e7;font:10px system-ui,sans-serif}.atlas-root-label{fill:#102034;font:16px system-ui,sans-serif}.atlas-node-halo{opacity:.09}.atlas-node.dim{opacity:.25}.atlas-node.selected .atlas-node-halo{opacity:.5}.atlas-orbits{opacity:.35}';
    clone.prepend(style);return new XMLSerializer().serializeToString(clone);
  }
  private async png():Promise<void>{
    const url=URL.createObjectURL(new Blob([this.svgMarkup()],{type:'image/svg+xml'}));
    try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=960;canvas.getContext('2d')!.drawImage(image,0,0);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve));if(blob)saveFile(blob,'crawl-spiderweb.png');}
    finally{URL.revokeObjectURL(url);}
  }
}
