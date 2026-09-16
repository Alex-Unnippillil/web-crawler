/** Dense bounded data grids: multi-filtering, sorting, columns, selection and scoped exports.
 * Table rendering is paginated independently of the complete filtered export.
 */
import { datasets, filteredRows, type WorkbenchTab, type Dataset, type DataRow } from './workbench-model.js';
import { esc, saveFile, csv, type AtlasHost } from './atlas-shared.js';
import type { Job } from '../src/studio/jobs.js';
export class Workbench {
  private key = ''; private revision = -1; private data?: ReturnType<typeof datasets>;
  private tab: WorkbenchTab = 'javascript'; private container?: HTMLElement;
  private query = ''; private filters: Record<string, string> = {}; private sort = ''; private descending = false; private page = 0;
  private selected = new Set<string>(); private hidden = new Set<string>(); private visible: DataRow[] = []; private job?: Job;
  private host: AtlasHost;
  constructor(host: AtlasHost) { this.host = host; }
  setFilter(column: string, value: string): void { this.filters[column]=value; this.page=0; const select=this.container?.querySelector<HTMLSelectElement>(`[data-wb-filter="${column}"]`); if(select) select.value=value; this.draw(); }
  leave(): void { this.key = ''; if (this.container) this.container.onclick = null; }
  show(container: HTMLElement, tab: WorkbenchTab, job?: Job): void {
    if (job?.revision !== this.revision || job?.id !== this.job?.id) { this.data = datasets(job); this.revision = job?.revision ?? -1; }
    this.job = job; this.container = container;
    const key = `${job?.id}-${tab}`;
    if (this.key !== key) {
      this.key = key; this.tab = tab; this.query = ''; this.filters = {}; this.sort = ''; this.descending = false; this.page = 0; this.selected.clear(); this.hidden.clear();
      try { this.hidden = new Set(JSON.parse(localStorage.getItem(`studio-columns-${tab}`) ?? '[]')); } catch { /* preferences are optional */ }
      this.mount();
    } else if (!container.contains(document.activeElement) || !document.activeElement?.matches('input,select')) this.draw();
  }
  private mount(): void {
    const data = this.data?.[this.tab] ?? datasets()[this.tab]; const el = this.container!;
    const robots = this.job?.result?.discovery?.robots;
    const robotsPane = this.tab === 'robots' ? `<details class="wb-policy" open><summary>robots.txt · HTTP ${esc(robots?.status ?? 'unknown')} · ${esc(robots?.user_agent ?? '')}</summary><p>${esc(robots?.url ?? 'No robots record in this saved crawl.')}</p><pre>${esc(robots?.text || robots?.error || 'No body recorded. HTTP 404 permits crawling; 401/403 denies it.')}</pre></details>` : '';
    const sitemapPane = this.tab === 'sitemaps' ? `<details class="wb-policy"><summary>${this.job?.result?.discovery?.sitemaps.length ?? 0} sitemap files inspected</summary>${(this.job?.result?.discovery?.sitemaps ?? []).map(s => `<p><b>${esc(s.status ?? 'Error')} · ${esc(s.kind)} · ${s.urls} entries</b> ${esc(s.url)} ${esc(s.error ?? '')}</p>`).join('') || '<p>Sitemap discovery was disabled or this is an older saved crawl.</p>'}</details>` : '';
    el.innerHTML = `<section class="workbench"><div class="wb-heading"><div><span class="atlas-kicker">INSPECTION WORKSPACE</span><h2>${data.title}</h2><p>${data.note} ${data.rows.length >= 100000 ? 'Showing the first 100,000 records. Narrow the crawl to inspect larger inventories.' : ''}</p></div><span class="wb-total">${data.rows.length.toLocaleString()} records</span></div>${robotsPane}${sitemapPane}<div class="wb-tools"><label>Search records<input id="wb-query" type="search" placeholder="Filter URLs, fields or evidence…"></label>${data.filters.slice(0,3).map(c => `<label>${esc(c)}<select data-wb-filter="${esc(c)}"><option value="">All ${esc(c.toLowerCase())}</option>${[...new Set(data.rows.map(r => String(r[c] ?? '')))].filter(Boolean).sort().slice(0,80).map(v => `<option>${esc(v)}</option>`).join('')}</select></label>`).join('')}<details class="wb-columns"><summary>Columns</summary><div>${data.columns.map(c => `<label><input type="checkbox" data-wb-column="${esc(c)}" ${this.hidden.has(c) ? '' : 'checked'}>${esc(c)}</label>`).join('')}</div></details></div><div class="wb-actions"><label><input id="wb-all" type="checkbox">Select all filtered</label><span id="wb-selection">0 selected</span><button class="button" data-wb-export="csv">Export CSV</button><button class="button" data-wb-export="json">Export JSON</button><button class="button" data-wb-copy>Copy URLs</button><button class="button" data-wb-clear>Clear filters</button></div><div id="wb-grid"></div><div class="wb-footer"><span id="wb-count"></span><div><button class="button" data-wb-previous>Previous</button><span id="wb-page"></span><button class="button" data-wb-next>Next</button></div></div><div id="wb-object" hidden></div></section>`;
    el.querySelector<HTMLInputElement>('#wb-query')!.addEventListener('input', e => { this.query = (e.target as HTMLInputElement).value; this.page = 0; this.draw(); });
    el.querySelectorAll<HTMLSelectElement>('[data-wb-filter]').forEach(select => select.addEventListener('change', () => { this.filters[select.dataset.wbFilter!] = select.value; this.page = 0; this.draw(); }));
    el.querySelectorAll<HTMLInputElement>('[data-wb-column]').forEach(input => input.addEventListener('change', () => { if (input.checked) this.hidden.delete(input.dataset.wbColumn!); else this.hidden.add(input.dataset.wbColumn!); try { localStorage.setItem(`studio-columns-${this.tab}`, JSON.stringify([...this.hidden])); } catch {} this.draw(); }));
    el.querySelector<HTMLInputElement>('#wb-all')!.addEventListener('change', e => { if ((e.target as HTMLInputElement).checked) this.visible.forEach(r => this.selected.add(r._id)); else this.selected.clear(); this.draw(); });
    el.onclick = e => {
      const button = (e.target as Element).closest<HTMLElement>('button'); if (!button) return;
      if (button.dataset.wbSort) { this.descending = this.sort === button.dataset.wbSort ? !this.descending : false; this.sort = button.dataset.wbSort; this.draw(); }
      if (button.hasAttribute('data-wb-previous')) { this.page--; this.draw(); }
      if (button.hasAttribute('data-wb-next')) { this.page++; this.draw(); }
      if (button.dataset.wbExport) this.export(button.dataset.wbExport);
      if (button.hasAttribute('data-wb-copy')) void navigator.clipboard.writeText(this.exportRows().map(r => String(r.URL ?? r.Destination ?? r['Source page'] ?? '')).join('\n')).then(() => this.host.notify('URLs copied.'), () => this.host.notify('Clipboard unavailable. Use CSV export.'));
      if (button.hasAttribute('data-wb-clear')) { this.query = ''; this.filters = {}; this.page = 0; this.selected.clear(); this.mount(); }
      if (button.dataset.wbObject) { const row = this.data?.[this.tab].rows.find(r => r._id === button.dataset.wbObject); const pane = el.querySelector<HTMLElement>('#wb-object')!; pane.hidden = false; pane.innerHTML = `<div class="wb-object-heading"><h3>Captured record</h3><button class="button" data-wb-close-object>Close</button></div><pre>${esc(JSON.stringify(row?._detail ?? row, null, 2))}</pre>`; pane.scrollIntoView({ block: 'nearest' }); }
      if (button.hasAttribute('data-wb-close-object')) el.querySelector<HTMLElement>('#wb-object')!.hidden = true;
    };
    this.draw();
  }
  private draw(): void {
    const data = this.data?.[this.tab] ?? datasets()[this.tab]; const el = this.container!;
    const previousRegion=el.querySelector<HTMLElement>('.wb-scroll');
    const scrollLeft=previousRegion?.scrollLeft??0, scrollTop=previousRegion?.scrollTop??0;
    const focused=document.activeElement as HTMLElement|null;
    const focusKey=focused&&previousRegion?.contains(focused)?(['wbSelect','wbSort','page','wbObject'] as const).find(k=>focused.dataset[k]!==undefined):undefined;
    const focusValue=focusKey?focused?.dataset[focusKey]:undefined;
    el.querySelector('.wb-total')!.textContent = `${data.rows.length.toLocaleString()} records`;
    // A workspace can mount before the first page arrives. Refresh filter choices
    // from new snapshots without resetting the user's selected filter or query.
    el.querySelectorAll<HTMLSelectElement>('[data-wb-filter]').forEach(select => {
      const column=select.dataset.wbFilter!, value=this.filters[column]??'';
      const choices=[...new Set(data.rows.map(row=>String(row[column]??'')))].filter(Boolean).sort().slice(0,80);
      if(value&&!choices.includes(value))choices.push(value);
      const html=`<option value="">All ${esc(column.toLowerCase())}</option>`+choices.map(v=>`<option>${esc(v)}</option>`).join('');
      if(select.innerHTML!==html) {select.innerHTML=html;select.value=value;}
    });
    this.visible = filteredRows(data, this.query, this.filters, this.sort, this.descending);
    const count = Math.max(1, Math.ceil(this.visible.length / 50)); this.page = Math.max(0, Math.min(count - 1, this.page));
    const columns = data.columns.filter(c => !this.hidden.has(c));
    const width = (column: string) => /^(URL|Source|Source page|Destination)$/.test(column) ? 250 : /Reason|Error|Evidence|Text|Value/.test(column) ? 280 : 116; const slice = this.visible.slice(this.page * 50, this.page * 50 + 50);
    el.querySelector('#wb-grid')!.innerHTML = slice.length ? `<div class="wb-scroll" tabindex="0" role="region" aria-label="${esc(data.title)} data grid"><table class="wb-table"><colgroup><col width="36">${columns.map(c=>`<col width="${width(c)}">`).join('')}<col width="80"></colgroup><thead><tr><th class="wb-check"><span class="sr-only">Select row</span></th>${columns.map(c => `<th aria-sort="${this.sort === c ? this.descending ? 'descending' : 'ascending' : 'none'}"><button data-wb-sort="${esc(c)}">${esc(c)}${this.sort === c ? this.descending ? ' ↓' : ' ↑' : ''}</button></th>`).join('')}<th>Inspect</th></tr></thead><tbody>${slice.map(r => `<tr class="${this.selected.has(r._id) ? 'wb-selected' : ''}"><td><input type="checkbox" aria-label="Select record ${esc(r._id)}" data-wb-select="${esc(r._id)}" ${this.selected.has(r._id) ? 'checked' : ''}></td>${columns.map(c => `<td title="${esc(String(r[c] ?? '').slice(0,1500))}">${['URL','Source','Source page'].includes(c) && r._page ? `<button class="wb-link" data-page="${esc(r._page)}">${esc(r[c])}</button>` : `<span class="${c === 'Method' ? `method-${String(r[c]).toLowerCase()}` : ''}">${esc(String(r[c] ?? '').slice(0,240))}</span>`}</td>`).join('')}<td><button class="button" data-wb-object="${esc(r._id)}" aria-label="Expand record ${esc(r._id)}">Details</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><h3>No matching records</h3><p>Clear the filters or run a crawl with the relevant discovery or rendering option enabled.</p></div>';
    const table=el.querySelector<HTMLTableElement>('.wb-table');
    if(table) table.style.width=`${116 + columns.reduce((total,column)=>total+width(column),0)}px`;
    el.querySelectorAll<HTMLInputElement>('[data-wb-select]').forEach(input => input.addEventListener('change', () => { if (input.checked) this.selected.add(input.dataset.wbSelect!); else this.selected.delete(input.dataset.wbSelect!); this.draw(); }));
    el.querySelector('#wb-count')!.textContent = `${this.visible.length.toLocaleString()} matching / ${data.rows.length.toLocaleString()} records · 50 rows per page`;
    el.querySelector('#wb-page')!.textContent = `${this.page + 1} / ${count}`;
    (el.querySelector('[data-wb-previous]') as HTMLButtonElement).disabled = this.page === 0;
    (el.querySelector('[data-wb-next]') as HTMLButtonElement).disabled = this.page === count - 1;
    el.querySelector('#wb-selection')!.textContent = `${this.visible.filter(r => this.selected.has(r._id)).length} selected · exports use selection, otherwise all filtered`;
    el.querySelector<HTMLInputElement>('#wb-all')!.checked = !!this.visible.length && this.visible.every(r => this.selected.has(r._id));
    el.querySelector('.wb-total')!.textContent = `${data.rows.length.toLocaleString()} records`;
    // Live snapshots and selection must not reset horizontal position or keyboard focus.
    const region=el.querySelector<HTMLElement>('.wb-scroll');
    if(region){region.scrollLeft=scrollLeft;region.scrollTop=scrollTop;if(focusKey)Array.from(region.querySelectorAll<HTMLElement>('button,input')).find(node=>node.dataset[focusKey]===focusValue)?.focus({preventScroll:true});}
  }
  private exportRows(): Record<string, unknown>[] {
    const chosen = this.visible.filter(r => this.selected.has(r._id));
    return (chosen.length ? chosen : this.visible).map(r => Object.fromEntries(Object.entries(r).filter(([key]) => !key.startsWith('_'))));
  }
  private export(format: string): void { const rows = this.exportRows(); saveFile(format === 'csv' ? csv(rows) : JSON.stringify(rows, null, 2), `crawl-${this.tab}.${format}`, format === 'csv' ? 'text/csv' : 'application/json'); this.host.notify(`Exported ${rows.length} ${this.tab} records.`); }
}
