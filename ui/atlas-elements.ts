/** Fast, paginated element browsing with explicit, bounded raster-image previews. */
import type { AtlasIndex, ImageRecord, ElementRecord } from './atlas-model.js';
import { esc, fmt, externalLink, pathLabel, saveFile, csv, type AtlasHost, type AtlasJob } from './atlas-shared.js';
type Category='images'|'links'|'headings'|'resources'|'forms';
const categories:Category[]=['images','links','headings','resources','forms'];
const titles:Record<Category,string>={images:'Images',links:'Links',headings:'Headings',resources:'Resources',forms:'Forms'};
const PAGE=24;
export class ElementExplorer {
  private container?:HTMLElement;private index?:AtlasIndex;private job?:AtlasJob;
  private category:Category='images';private query='';private filter='';private source='';private page=0;private grid=true;private enabled=false;
  private generation=0;private cache=new Map<string,{url:string;bytes:number}>();private loading=new Map<string,Promise<string>>();private cachedBytes=0;
  private modal?:HTMLDialogElement;private imageIndex=0;
  private host:AtlasHost;
  constructor(host:AtlasHost){this.host=host;}
  reset():void {this.generation++;this.enabled=false;this.loading.clear();for(const item of this.cache.values())URL.revokeObjectURL(item.url);this.cache.clear();this.cachedBytes=0;this.modal?.close();}
  focusSource(url:string):void{this.category='images';this.source=url;this.filter='';this.query='';this.page=0;}
  choose(category:Category,filter=''):void{this.category=category;this.filter=filter;this.page=0;this.query='';if(this.container?.isConnected)this.draw(true);}
  mount(target:HTMLElement):void {
    target.innerHTML=`<div class="atlas atlas-elements"><div class="atlas-heading"><div><span class="atlas-kicker">ELEMENT EXPLORER</span><h3>A closer look at every layer.</h3><p>Find an asset, see where it is used, and export exactly what you need.</p></div><div class="atlas-actions"><button class="button" data-element="csv">Export filtered CSV</button><button class="button" data-element="json">Export filtered JSON</button></div></div><div id="element-categories" class="atlas-categories" aria-label="Element categories"></div><div id="element-coverage" class="atlas-coverage" hidden></div><div class="atlas-element-controls"><label class="atlas-search"><span>⌕</span><input id="element-search" type="search" aria-label="Search elements" placeholder="Search URLs, descriptions or source pages"></label><label class="sr-only" for="element-filter">Element filter</label><select id="element-filter"></select><label class="sr-only" for="element-source">Source page</label><select id="element-source"><option value="">All source pages</option></select><button class="button" data-element="layout" id="element-layout">List view</button></div><div id="preview-notice" class="atlas-preview-notice"><div><strong>Private by default. Previews are off.</strong><p>Loading previews makes extra image requests through the local server. No cookies or referrer are sent. SVG stays URL-only.</p></div><button class="button" data-element="previews" id="preview-toggle">Load previews</button></div><div id="element-body"></div><div class="atlas-pagination"><span id="element-count"></span><div><button class="button" data-element="previous">Previous</button><span id="element-page"></span><button class="button" data-element="next">Next</button></div></div></div>`;
    const container=target.firstElementChild as HTMLElement;this.container=container;
    const q=<T extends Element=HTMLElement>(selector:string)=>container.querySelector<T>(selector)!;
    q<HTMLInputElement>('#element-search').value=this.query;
    q('#element-search').addEventListener('input',()=>{this.query=q<HTMLInputElement>('#element-search').value;this.page=0;this.draw();});
    q('#element-filter').addEventListener('change',()=>{this.filter=q<HTMLSelectElement>('#element-filter').value;this.page=0;this.draw();});
    q('#element-source').addEventListener('change',()=>{this.source=q<HTMLSelectElement>('#element-source').value;this.page=0;this.draw();});
    container.addEventListener('click',e=>{
      const el=(e.target as Element).closest<HTMLElement>('[data-element],[data-category],[data-media],[data-record]');if(!el)return;
      if(el.dataset.category){this.category=el.dataset.category as Category;this.filter='';this.page=0;this.draw(true);return;}
      if(el.dataset.media){this.openImage(Number(el.dataset.media));return;}
      if(el.dataset.record){this.openRecord(Number(el.dataset.record));return;}
      switch(el.dataset.element){
        case 'layout':this.grid=!this.grid;this.draw();break;
        case 'previews':this.enabled=!this.enabled;this.draw();break;
        case 'previous':this.page--;this.draw();break;case 'next':this.page++;this.draw();break;
        case 'csv':this.export('csv');break;case 'json':this.export('json');break;
      }
    });
    if(this.index&&this.job)this.update(this.index,this.job);
  }
  update(index:AtlasIndex,job:AtlasJob):void {if(this.job&&this.job.id!==job.id){this.reset();this.page=0;this.source='';}this.index=index;this.job=job;if(this.container)this.draw(true);}
  private list():Array<ImageRecord|ElementRecord> {
    if(!this.index)return [];
    return this.index[this.category].filter(row=>{
      const match=JSON.stringify(row).toLowerCase().includes(this.query.toLowerCase());
      if(!match||this.source&&!row.sources.includes(this.source))return false;
      if('alts'in row)return !this.filter||this.filter==='missing'&&row.missing>0||this.filter==='decorative'&&row.decorative>0||this.filter==='unknown'&&row.unknown>0||row.extension===this.filter;
      return !this.filter||row.kind===this.filter;
    }).sort((a,b)=>a.url.localeCompare(b.url));
  }
  private draw(options=false):void {
    const root=this.container,index=this.index;if(!root||!index)return;
    const q=<T extends Element=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
    q('#element-categories').innerHTML=categories.map(key=>`<button data-category="${key}" class="${key===this.category?'active':''}" aria-pressed="${key===this.category}">${titles[key]}<b>${fmt(index[key].length)}</b></button>`).join('');
    const coverage=[];if(index.legacyPages)coverage.push(`${index.legacyPages} pages come from older records: image URLs and links are available, but richer metadata needs a fresh crawl.`);if(index.truncatedPages)coverage.push(`${index.truncatedPages} pages reached a per-page element cap. This is a bounded inventory.`);
    q<HTMLElement>('#element-coverage').hidden=!coverage.length;q('#element-coverage').textContent=coverage.join(' ');
    if(options){
      const choices=this.category==='images'?[['missing','Missing alt attribute'],['decorative','Empty alt (possibly decorative)'],['unknown','Metadata not captured'],...[...new Set(index.images.map(i=>i.extension))].sort().filter(x=>x!=='unknown').map(x=>[x,x.toUpperCase()])]:[...new Set((index[this.category] as ElementRecord[]).map(r=>r.kind))].sort().map(x=>[x,x]);
      q('#element-filter').innerHTML='<option value="">All types</option>'+choices.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');q<HTMLSelectElement>('#element-filter').value=this.filter;
      q('#element-source').innerHTML='<option value="">All source pages</option>'+index.pages.map(p=>`<option value="${esc(p.url)}">${esc(pathLabel(p.url))}</option>`).join('');q<HTMLSelectElement>('#element-source').value=this.source;
    }
    q<HTMLElement>('#preview-notice').hidden=this.category!=='images';q('#preview-notice strong').textContent=this.enabled?'Image previews enabled for this session.':'Private by default. Previews are off.';
    q('#preview-toggle').textContent=this.enabled?'Turn previews off':'Load previews';q<HTMLElement>('#element-layout').hidden=this.category!=='images';q('#element-layout').textContent=this.grid?'List view':'Grid view';
    const rows=this.list(),pages=Math.max(1,Math.ceil(rows.length/PAGE));this.page=Math.max(0,Math.min(this.page,pages-1));const start=this.page*PAGE,shown=rows.slice(start,start+PAGE);
    const images=this.category==='images';
    if(!shown.length)q('#element-body').innerHTML=`<div class="empty-state"><h3>No ${this.category} match this view</h3><p>${index.legacyPages?'Run a fresh crawl to capture element details.':'Try clearing your search or changing the source-page filter.'}</p></div>`;
    else if(images&&this.grid){q('#element-body').innerHTML=`<div class="atlas-image-grid">${(shown as ImageRecord[]).map((r,i)=>`<article class="atlas-image-card"><button class="atlas-image-open" data-media="${start+i}" aria-label="Inspect image ${esc(r.alts[0]||pathLabel(r.url))}"><span class="atlas-thumbnail" data-thumb="${esc(r.url)}"><span class="atlas-image-placeholder"><svg viewBox="0 0 48 40" aria-hidden="true"><rect x="2" y="2" width="44" height="36" rx="5"/><circle cx="15" cy="13" r="4"/><path d="m4 33 13-12 9 8 8-10 11 14"/></svg><span>${esc(r.extension.toUpperCase())} · ${this.enabled?'Loading…':'Preview off'}</span></span></span><span class="atlas-image-copy"><strong>${esc(r.alts[0]||pathLabel(r.url).split('/').pop()||'Image')}</strong><small>${esc(pathLabel(r.url))}</small></span></button><div class="atlas-image-tags"><span>${r.sources.length} source ${r.sources.length===1?'page':'pages'}</span><span>${r.width&&r.height?`${r.width} × ${r.height}`:r.extension.toUpperCase()}</span>${r.missing?'<b class="atlas-tag warn">Missing alt</b>':r.unknown?'<b class="atlas-tag">Legacy</b>':r.decorative&&!r.alts.length?'<b class="atlas-tag">Empty alt</b>':'<b class="atlas-tag good">Described</b>'}</div></article>`).join('')}</div>`;}
    else {q('#element-body').innerHTML=`<div class="atlas-element-table"><table><thead><tr><th>${images?'Image':'Element / URL'}</th><th>${images?'Description':'Text / attributes'}</th><th>${images?'Alt check':'Type'}</th><th>Sources</th><th>Inspect</th></tr></thead><tbody>${shown.map((r,i)=>{const img='alts'in r;return `<tr><td>${externalLink(r.url,pathLabel(r.url))}<small class="atlas-domain">${esc((()=>{try{return new URL(r.url).hostname;}catch{return 'Unresolved URL';}})())}</small></td><td>${esc(img?r.alts.join(' · ')||'Not provided':r.text||r.detail||'Not provided')}${!img&&r.detail?`<small>${esc(r.detail.slice(0,350))}</small>`:''}</td><td><span class="atlas-tag ${img&&r.missing?'warn':''}">${esc(img?r.missing?'Missing':r.unknown?'Unknown':r.decorative&&!r.alts.length?'Empty':'Present':r.kind)}</span></td><td>${r.sources.length}</td><td><button class="button" ${images?'data-media':'data-record'}="${start+i}">Details</button></td></tr>`;}).join('')}</tbody></table></div>`;}
    q('#element-count').textContent=`${rows.length?start+1:0}–${Math.min(start+PAGE,rows.length)} of ${fmt(rows.length)} ${images?'unique image URLs':this.category==='headings'||this.category==='forms'?'captured occurrences':'unique entries'}`;
    q('#element-page').textContent=`${this.page+1} / ${pages}`;q<HTMLButtonElement>('[data-element="previous"]').disabled=this.page===0;q<HTMLButtonElement>('[data-element="next"]').disabled=this.page===pages-1;
    this.generation++;if(images&&this.grid&&this.enabled)void this.previews(Array.from(q('#element-body').querySelectorAll<HTMLElement>('[data-thumb]')),this.generation);
  }
  /** Only three requests are made concurrently; leaving the view stops the remaining queue. */
  private async previews(targets:HTMLElement[],generation:number):Promise<void>{
    let offset=0;const worker=async()=>{while(offset<targets.length&&generation===this.generation){const element=targets[offset++]!;const url=element.dataset.thumb!;
      if(/\.svg(?:[?#]|$)/i.test(url)){element.innerHTML='<span class="atlas-image-placeholder">SVG · URL only</span>';continue;}
      try{const blob=await this.image(url);if(generation!==this.generation)continue;const img=new Image();img.alt='';img.decoding='async';img.src=blob;element.replaceChildren(img);}
      catch(error){if(generation===this.generation){element.innerHTML='<span class="atlas-image-placeholder">Preview unavailable<br><small>Open details for the source URL.</small></span>';element.title=String(error);}}
    }};await Promise.all([worker(),worker(),worker()]);
  }
  private async image(url:string):Promise<string>{
    const cached=this.cache.get(url);if(cached)return cached.url;
    const loading=this.loading.get(url);if(loading)return loading;
    const jobID=this.job!.id;
    const promise=(async()=>{const response=await this.host.api(`/api/jobs/${jobID}/image?url=${encodeURIComponent(url)}`);const blob=await response.blob();
      if(this.job?.id!==jobID)throw new Error('Crawl changed.');
      while(this.cachedBytes+blob.size>24*1024*1024&&this.cache.size){const [key,item]=this.cache.entries().next().value!;URL.revokeObjectURL(item.url);this.cachedBytes-=item.bytes;this.cache.delete(key);}
      const address=URL.createObjectURL(blob);this.cachedBytes+=blob.size;this.cache.set(url,{url:address,bytes:blob.size});return address;
    })();this.loading.set(url,promise);try{return await promise;}finally{this.loading.delete(url);}
  }
  private dialog():HTMLDialogElement{
    if(this.modal)return this.modal;
    const dialog=document.createElement('dialog');dialog.className='modal atlas-element-dialog';dialog.setAttribute('aria-label','Element details');document.body.append(dialog);this.modal=dialog;
    dialog.addEventListener('click',e=>{const el=(e.target as Element).closest<HTMLElement>('button');if(!el)return;
      if(el.dataset.dismiss!==undefined)dialog.close();
      if(el.dataset.source){dialog.close();this.host.openPage(el.dataset.source);}
      if(el.dataset.lightbox){this.openImage(this.imageIndex+(el.dataset.lightbox==='next'?1:-1));}
      if(el.dataset.loadImage){const target=dialog.querySelector<HTMLElement>('.atlas-lightbox-preview')!;target.textContent='Loading preview…';const id=el.dataset.loadImage;void this.image(id).then(url=>{if(!dialog.open||dialog.dataset.image!==id)return;const img=new Image();img.src=url;img.alt=(this.list()[this.imageIndex] as ImageRecord)?.alts[0]??'Selected image preview';target.replaceChildren(img);}).catch(err=>{target.textContent=String(err);});}
    });
    dialog.addEventListener('keydown',e=>{if((e.target as Element).closest('input,select,textarea'))return;if(e.key==='ArrowRight'&&dialog.dataset.image){e.preventDefault();this.openImage(this.imageIndex+1);}if(e.key==='ArrowLeft'&&dialog.dataset.image){e.preventDefault();this.openImage(this.imageIndex-1);}});
    return dialog;
  }
  private sources(urls:string[]):string{return `<h4>Found on ${urls.length} source ${urls.length===1?'page':'pages'}</h4><div class="atlas-source-list">${urls.map(url=>`<button class="atlas-url-button" data-source="${esc(url)}">${esc(pathLabel(url))}</button>`).join('')}</div>`;}
  private openImage(index:number):void{
    const list=this.list() as ImageRecord[];if(!list.length)return;this.imageIndex=Math.max(0,Math.min(index,list.length-1));const image=list[this.imageIndex]!,dialog=this.dialog();dialog.dataset.image=image.url;
    dialog.innerHTML=`<div class="modal-header"><div><span class="atlas-kicker">IMAGE INSPECTOR · ${this.imageIndex+1} / ${list.length}</span><h2>${esc(image.alts[0]||'Image details')}</h2></div><button class="icon-button" data-dismiss aria-label="Close element details">×</button></div><div class="atlas-lightbox"><div class="atlas-lightbox-preview"><div><strong>Preview not loaded</strong><p>Loading sends a new image request. Raster files only, up to 4 MiB.</p><button class="button" data-load-image="${esc(image.url)}">Load this image</button></div></div><div class="atlas-lightbox-info"><p class="atlas-break">${externalLink(image.url)}</p><dl><dt>Declared dimensions</dt><dd>${image.width&&image.height?`${image.width} × ${image.height}`:'Not captured'} <small>(HTML attributes, not measured pixels)</small></dd><dt>Image descriptions</dt><dd>${esc(image.alts.join(' · ')||'None recorded')}</dd><dt>Missing alt attribute</dt><dd>${image.missing} captured occurrences</dd><dt>Empty alt attribute</dt><dd>${image.decorative} occurrences; may be intentionally decorative</dd><dt>Unknown metadata</dt><dd>${image.unknown} legacy occurrences</dd></dl>${this.sources(image.sources)}</div></div><div class="modal-footer"><span class="atlas-fine">Use ← / → to browse the filtered image list.</span><button class="button" data-lightbox="previous" ${this.imageIndex===0?'disabled':''}>Previous image</button><button class="button" data-lightbox="next" ${this.imageIndex===list.length-1?'disabled':''}>Next image</button></div>`;
    if(!dialog.open)dialog.showModal();
    if(this.enabled)dialog.querySelector<HTMLButtonElement>('[data-load-image]')!.click();
  }
  private openRecord(index:number):void{
    const row=this.list()[index] as ElementRecord|undefined;if(!row)return;const dialog=this.dialog();delete dialog.dataset.image;
    dialog.innerHTML=`<div class="modal-header"><div><span class="atlas-kicker">${esc(row.kind.toUpperCase())} · ELEMENT INSPECTOR</span><h2>${esc(titles[this.category])}</h2></div><button class="icon-button" data-dismiss aria-label="Close element details">×</button></div><div class="modal-body"><p class="atlas-break">${externalLink(row.url)}</p><dl><dt>Captured text</dt><dd>${esc(row.text||'None')}</dd><dt>Attributes</dt><dd>${esc(row.detail||'None')}</dd></dl>${this.sources(row.sources)}<p class="atlas-fine">Resources are cataloged from HTML, not executed, embedded, submitted, or availability-checked.</p></div>`;
    if(!dialog.open)dialog.showModal();
  }
  private export(format:'csv'|'json'):void{
    const rows=this.list().map(row=>({...row}));saveFile(format==='json'?JSON.stringify(rows,null,2):csv(rows),`crawl-${this.category}-filtered.${format}`,format==='csv'?'text/csv':'application/json');this.host.notify(`Exported ${rows.length} filtered ${this.category} entries.`);
  }
  dispose():void{this.reset();this.modal?.remove();this.modal=undefined;}
  suspend():void{this.generation++;}
}
