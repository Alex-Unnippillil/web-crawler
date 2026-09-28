/** A chart-and-table workspace built only from the selected crawl's captured records. */
import type { Job } from '../src/studio/jobs.js';
import { esc, csv, saveFile } from './atlas-shared.js';
import { analyzeCrawl, categories, filterFindings, rankPages, type ObservatoryModel, type Bucket, type FindingFilter } from './observatory-model.js';
const fmt = (value: number) => value.toLocaleString();
const ms = (value: number | null) => value === null ? 'Not measured' : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
const percent = (value: number | null) => value === null ? 'N/A' : `${value}%`;
function dataTable(id: string, headers: string[], rows: (string | number)[][], note: string): string {
  return `<details class="obs-data" id="obs-data-${id}"><summary>View ${esc(id)} data table</summary><div class="obs-table-scroll" tabindex="0" role="region" aria-label="${esc(id)} data"><table><caption>${esc(note)}</caption><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((v, i) => `<${i ? 'td' : 'th scope="row"'}>${esc(v)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function radar(model: ObservatoryModel): string {
  const point = (index: number, radius: number) => { const a = index * Math.PI / 3 - Math.PI / 2; return [240 + Math.cos(a) * radius, 178 + Math.sin(a) * radius]; };
  const polygon = (r: number) => model.coverage.map((_, i) => point(i, r).join(',')).join(' ');
  const summary = model.coverage.map(c => `${c.label}: ${percent(c.percent)} (${c.present} of ${c.eligible} ${c.unit})`).join('; ');
  const available = model.coverage.filter(c => c.percent !== null).length;
  return `<svg class="obs-radar" viewBox="0 0 480 355" role="img" aria-labelledby="obs-radar-title obs-radar-desc"><title id="obs-radar-title">Captured metadata coverage radar</title><desc id="obs-radar-desc">${esc(summary)}. Missing measurements have no data point; a connecting polygon appears only when all six axes have measurements.</desc>
    ${[.25, .5, .75, 1].map(level => `<polygon class="obs-grid" points="${polygon(level * 112)}"/>`).join('')}
    ${model.coverage.map((_, i) => `<line class="obs-grid" x1="240" y1="178" x2="${point(i, 112)[0]}" y2="${point(i, 112)[1]}"/>`).join('')}
    ${available === 6 ? `<polygon class="obs-radar-area" points="${model.coverage.map((c, i) => point(i, c.percent! / 100 * 112).join(',')).join(' ')}"/>` : ''}
    ${model.coverage.map((c, i) => { const [x, y] = point(i, 151); const [dx, dy] = point(i, (c.percent ?? 0) / 100 * 112); return `${c.percent === null ? '' : `<circle class="obs-radar-dot" cx="${dx}" cy="${dy}" r="4"/>`}<text class="obs-axis" x="${x}" y="${y}" text-anchor="middle">${esc(c.label)}</text><text class="obs-axis-value" x="${x}" y="${y! + 17}" text-anchor="middle">${percent(c.percent)}</text>`; }).join('')}
    <text class="obs-scale" x="245" y="69">100%</text><text class="obs-scale" x="245" y="126">50%</text>
  </svg>${dataTable('coverage', ['Signal', 'Present', 'Eligible', 'Unit', 'Coverage'], model.coverage.map(c => [c.label, c.present, c.eligible, c.unit, percent(c.percent)]), 'Coverage of known measurements, not a quality or compliance score. N/A means no eligible measurements.')}`;
}
function horizontal(buckets: Bucket[]): string {
  const max = Math.max(1, ...buckets.map(b => b.count));
  return `<div class="obs-hbars" role="img" aria-label="HTTP outcome counts: ${esc(buckets.map(b => `${b.label} ${b.count}`).join('; '))}">${buckets.map((b, i) => `<div class="obs-hrow"><span>${esc(b.label)}</span><svg class="obs-htrack" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><rect class="obs-tone-${i % 4}" width="${b.count / max * 100}" height="14"/></svg><strong>${fmt(b.count)}</strong></div>`).join('')}</div>${dataTable('outcomes', ['Outcome', 'URLs'], buckets.map(b => [b.label, b.count]), 'Final captured page outcomes by distinct URL. Robots/sitemap failures and intermediate redirects are excluded.')}`;
}
function histogram(buckets: Bucket[]): string {
  const max = Math.max(1, ...buckets.map(b => b.count));
  return `<div class="obs-histogram" role="img" aria-label="Page visit durations: ${esc(buckets.map(b => `${b.label}: ${b.count}`).join('; '))}">${buckets.map(b => `<div class="obs-column"><strong>${fmt(b.count)}</strong><svg class="obs-vtrack" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><rect class="obs-tone-0" x="0" y="${150 - b.count / max * 150}" width="100" height="${b.count / max * 150}"/></svg><span>${esc(b.label)}</span></div>`).join('')}</div>${dataTable('durations', ['Visit duration', 'Pages'], buckets.map(b => [b.label, b.count]), 'Elapsed crawler visit time. Includes crawl/rendering work; not Core Web Vitals, TTFB or a controlled benchmark.')}`;
}
function depth(model: ObservatoryModel): string {
  const rows = model.depths; const max = Math.max(1, ...rows.map(d => d.clear + d.review));
  return `<div class="obs-legend"><span><i class="obs-tone-0"></i>With findings</span><span><i class="obs-tone-1"></i>No findings in these checks</span></div><div class="obs-depths" role="img" aria-label="Discovery depth: ${esc(rows.map(d => `${d.label}: ${d.review} with findings, ${d.clear} without findings`).join('; ') || 'No captured pages')}">${rows.map(d => `<div class="obs-hrow"><span>${esc(d.label)}</span><svg class="obs-htrack obs-stack" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><rect class="obs-tone-0" width="${d.review / max * 100}" height="14"/><rect class="obs-tone-1" x="${d.review / max * 100}" width="${d.clear / max * 100}" height="14"/></svg><strong>${d.review} / ${d.clear}</strong></div>`).join('') || '<p class="muted">No captured pages yet.</p>'}</div>${dataTable('depth', ['Discovery depth', 'With findings', 'Without findings'], rows.map(d => [d.label, d.review, d.clear]), 'Discovery depth is the crawler route depth, not URL directory depth. Labels show with / without findings; absence of findings is not a pass.')}`;
}
export class Observatory {
  private target?: HTMLElement;
  private events?: AbortController;
  private job?: Job;
  private model = analyzeCrawl();
  private filter: FindingFilter = { category: 'all', severity: 'all', query: '', order: 'severity' };
  private page = 0;
  private rankingPage = 0;
  private ranking = 'findings';
  private host: { openPage(url: string): void; notify(message: string): void };
  constructor(host: { openPage(url: string): void; notify(message: string): void }) { this.host = host; }
  leave(): void { this.events?.abort(); this.events = undefined; this.target = undefined; }
  render(target: HTMLElement, job?: Job): void {
    const different = this.job?.id !== job?.id;
    if (different) { this.filter = { category: 'all', severity: 'all', query: '', order: 'severity' }; this.page = 0; this.rankingPage = 0; }
    const changed = different || this.job?.result !== job?.result;
    this.job = job;
    if (changed) this.model = analyzeCrawl(job?.result);
    if (this.target !== target || !target.querySelector('#observatory')) {
      this.leave(); this.target = target; this.mount(target);
    }
    if (different) this.syncFilters();
    if (changed || !target.querySelector('#obs-charts')?.childElementCount) { this.charts(); this.lists(); }
  }
  private mount(target: HTMLElement): void {
    target.innerHTML = `<div id="observatory" class="observatory">
      <section class="obs-hero" aria-labelledby="obs-title"><div><p class="obs-kicker">THE CRAWL, IN PERSPECTIVE</p><h2 id="obs-title">A clearer view of the web.</h2><p>Find patterns. Follow the evidence. Make the next fix count.</p></div><span class="obs-orbit" aria-hidden="true">◎</span></section>
      <div id="obs-summary" class="obs-summary"></div>
      <p class="obs-context" id="obs-scope">These views describe the selected capture, not an entire website. Static checks need manual review.</p>
      <div class="obs-chart-grid" id="obs-charts"></div>
      <section class="obs-card obs-findings" aria-labelledby="obs-findings-title"><div class="obs-card-head"><div><p class="obs-kicker">FROM SIGNAL TO ACTION</p><h3 id="obs-findings-title">Evidence &amp; findings</h3></div><button class="button" id="obs-export-findings">Export filtered findings</button></div>
        <div class="obs-filters"><label>Search evidence<input id="obs-query" type="search" maxlength="500" placeholder="URL, finding, or captured detail" value="${esc(this.filter.query)}"></label>
        <label>Category<select id="obs-category"><option value="all">All categories</option>${categories.map(c => `<option${this.filter.category === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Severity<select id="obs-severity">${['all', 'error', 'review', 'info'].map(value => `<option value="${value}"${this.filter.severity === value ? ' selected' : ''}>${value === 'all' ? 'All severities' : value === 'error' ? 'Error' : value === 'review' ? 'Review' : 'Information'}</option>`).join('')}</select></label>
        <label>Order<select id="obs-order"><option value="severity">Severity first</option><option value="url"${this.filter.order === 'url' ? ' selected' : ''}>URL A–Z</option></select></label><button class="button" id="obs-reset">Reset filters</button></div>
        <p class="obs-list-count" id="obs-findings-count" role="status" aria-live="polite" aria-atomic="true"></p>
        <div id="obs-findings-list"></div><div class="obs-pagination"><button class="button" id="obs-previous">Previous findings</button><span id="obs-page-number"></span><button class="button" id="obs-next">Next findings</button></div>
      </section>
      <section class="obs-card" aria-labelledby="obs-ranking-title"><div class="obs-card-head"><div><p class="obs-kicker">THE COMPLETE INVENTORY</p><h3 id="obs-ranking-title">Page priorities</h3></div><button class="button" id="obs-export-pages">Export all page metrics</button></div>
        <label class="obs-rank-label">Rank pages by<select id="obs-rank"><option value="findings">Finding count</option><option value="duration">Slowest visit</option><option value="incoming">Most linking pages</option></select></label><div id="obs-ranking-list"></div>
        <div class="obs-pagination"><button class="button" id="obs-rank-previous">Previous pages</button><span id="obs-ranking-count"></span><button class="button" id="obs-rank-next">Next pages</button></div>
      </section>
      <p class="obs-context">All analysis stays in this application. No extra requests are made by opening the Observatory. Older captures show unknown values until recrawled.</p>
    </div>`;
    this.events = new AbortController(); const options = { signal: this.events.signal };
    target.addEventListener('input', event => { if ((event.target as HTMLElement).id === 'obs-query') { this.filter.query = (event.target as HTMLInputElement).value; this.page = 0; this.findings(); } }, options);
    target.addEventListener('change', event => {
      const el = event.target as HTMLSelectElement;
      if (el.id === 'obs-category') this.filter.category = el.value;
      else if (el.id === 'obs-severity') this.filter.severity = el.value;
      else if (el.id === 'obs-order') this.filter.order = el.value;
      else if (el.id === 'obs-rank') { this.ranking = el.value; this.rankingPage = 0; this.pages(); return; }
      else return;
      this.page = 0; this.findings();
    }, options);
    target.addEventListener('click', event => {
      const b = (event.target as Element).closest<HTMLButtonElement>('button'); if (!b || !target.contains(b)) return;
      if (b.dataset.obsPage) { this.host.openPage(b.dataset.obsPage); return; }
      switch (b.id) {
        case 'obs-export-findings': { const rows = filterFindings(this.model.findings, this.filter); saveFile(csv(rows.map(r => ({ ...r }))), 'observatory-findings.csv', 'text/csv;charset=utf-8'); this.host.notify(`Exported ${rows.length} filtered findings, across all pages.`); break; }
        case 'obs-export-pages': saveFile(csv(rankPages(this.model.metrics, this.ranking).map(r => ({ url: r.url, title: r.title, visit_ms: r.duration ?? '', words: r.words ?? '', incoming_pages: r.incoming, findings: r.findings }))), 'observatory-pages.csv', 'text/csv;charset=utf-8'); this.host.notify(`Exported all ${this.model.pages} captured page metrics.`); break;
        case 'obs-reset': this.filter = { query: '', category: 'all', severity: 'all', order: 'severity' }; this.page = 0; this.control<HTMLInputElement>('obs-query').value = ''; this.control<HTMLSelectElement>('obs-category').value = 'all'; this.control<HTMLSelectElement>('obs-severity').value = 'all'; this.control<HTMLSelectElement>('obs-order').value = 'severity'; this.findings(); break;
        case 'obs-previous': this.page--; this.findings(); break;
        case 'obs-next': this.page++; this.findings(); break;
        case 'obs-rank-previous': this.rankingPage--; this.pages(); break;
        case 'obs-rank-next': this.rankingPage++; this.pages(); break;
      }
    }, options);
    this.control<HTMLSelectElement>('obs-rank').value = this.ranking;
    this.charts(); this.lists();
  }
  private control<T extends HTMLElement = HTMLElement>(id: string): T { return this.target!.querySelector<T>(`#${id}`)!; }
  private syncFilters(): void {
    const values: Record<string, string> = { 'obs-query': this.filter.query ?? '', 'obs-category': this.filter.category ?? 'all', 'obs-severity': this.filter.severity ?? 'all', 'obs-order': this.filter.order ?? 'severity' };
    for (const [id, value] of Object.entries(values)) this.control<HTMLInputElement | HTMLSelectElement>(id).value = value;
  }
  private charts(): void {
    const m = this.model;
    this.control('obs-summary').innerHTML = [[fmt(m.pages), 'Captured pages'], [fmt(m.affected), 'Pages with findings'], [fmt(m.duplicateGroups), 'Matching-text groups'], [ms(m.p95), '95th-percentile visit']].map(([value, label]) => `<div><strong>${esc(value)}</strong><span>${label}</span></div>`).join('');
    this.control('obs-scope').textContent = `${fmt(m.inspected)} of ${fmt(m.pages)} pages have static accessibility snapshots (${fmt(m.partial)} partial). ${fmt(m.fingerprinted)} have complete body-text fingerprints. These checks are not a WCAG audit or SEO score.`;
    const charts = this.control('obs-charts'); const open = new Set(Array.from(charts.querySelectorAll<HTMLDetailsElement>('details[open]')).map(d => d.id));
    const focused = charts.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
    const focusDetails = focused?.closest('details')?.id;
    const focusSummary = focused?.tagName === 'SUMMARY';
    charts.innerHTML = `<section class="obs-card" aria-labelledby="obs-coverage-heading"><div class="obs-card-head"><div><p class="obs-kicker">01 / COVERAGE</p><h3 id="obs-coverage-heading">The shape of your capture</h3></div><span class="obs-chart-kind">Radar</span></div><p class="obs-note">Presence, not quality. Unknown axes are N/A, never a passing score.</p>${radar(m)}</section>
      <section class="obs-card" aria-labelledby="obs-outcome-heading"><div class="obs-card-head"><div><p class="obs-kicker">02 / RESPONSES</p><h3 id="obs-outcome-heading">What came back</h3></div><span class="obs-chart-kind">Horizontal bars</span></div><p class="obs-note">Final observed outcomes. Unvisited URLs are not failures.</p>${horizontal(m.outcomes)}</section>
      <section class="obs-card" aria-labelledby="obs-time-heading"><div class="obs-card-head"><div><p class="obs-kicker">03 / VISIT DURATION</p><h3 id="obs-time-heading">Where the time goes</h3></div><span class="obs-chart-kind">Histogram</span></div><p class="obs-note">Median ${ms(m.median)} · P95 ${ms(m.p95)} · ${fmt(m.measured)} measured. Not a page-speed benchmark.</p>${histogram(m.timings)}</section>
      <section class="obs-card" aria-labelledby="obs-depth-heading"><div class="obs-card-head"><div><p class="obs-kicker">04 / DISCOVERY</p><h3 id="obs-depth-heading">Patterns below the surface</h3></div><span class="obs-chart-kind">Stacked bars</span></div><p class="obs-note">Captured pages grouped by discovery depth, with / without findings.</p>${depth(m)}</section>`;
    charts.querySelectorAll<HTMLDetailsElement>('.obs-data').forEach(d => { d.open = open.has(d.id) || document.documentElement.dataset.chartTables === 'true'; });
    if (focusDetails) charts.querySelector<HTMLElement>(`#${CSS.escape(focusDetails)} ${focusSummary ? 'summary' : '.obs-table-scroll'}`)?.focus({ preventScroll: true });
  }
  private lists(): void { this.findings(); this.pages(); }
  private findings(): void {
    const list = filterFindings(this.model.findings, this.filter); const total = Math.max(1, Math.ceil(list.length / 20)); this.page = Math.max(0, Math.min(this.page, total - 1));
    const target = this.control('obs-findings-list'); const focused = target.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.obsPage : undefined;
    this.control('obs-findings-count').textContent = `${fmt(list.length)} matching findings of ${fmt(this.model.findings.length)}. Export includes every match, not just this page.`;
    target.innerHTML = list.length ? `<ol class="obs-evidence" start="${this.page * 20 + 1}">${list.slice(this.page * 20, (this.page + 1) * 20).map(f => `<li><span class="obs-severity obs-${f.severity}">${f.severity === 'error' ? 'Error' : f.severity === 'review' ? 'Review' : 'Info'}</span><div><p class="obs-category">${esc(f.category)}</p><h4>${esc(f.title)}</h4><p>${esc(f.detail)}</p><button class="obs-url" data-obs-page="${esc(f.url)}" title="Inspect ${esc(f.url)}">${esc(f.url)}</button>${f.related_url ? `<p class="obs-related">Related URL: ${esc(f.related_url)}</p>` : ''}</div></li>`).join('')}</ol>` : '<div class="obs-empty"><h4>No matching findings</h4><p>Reset the filters to see all observations. No findings does not prove a site is accessible or error-free.</p></div>';
    if (focused) target.querySelector<HTMLButtonElement>(`[data-obs-page="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    this.control('obs-page-number').textContent = `Page ${this.page + 1} of ${total}`;
    this.control<HTMLButtonElement>('obs-previous').disabled = this.page === 0; this.control<HTMLButtonElement>('obs-next').disabled = this.page === total - 1;
    this.control<HTMLButtonElement>('obs-export-findings').disabled = !list.length;
  }
  private pages(): void {
    const rows = rankPages(this.model.metrics, this.ranking); const total = Math.max(1, Math.ceil(rows.length / 20)); this.rankingPage = Math.max(0, Math.min(this.rankingPage, total - 1));
    const target = this.control('obs-ranking-list');
    const focused = target.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
    const focusURL = focused?.dataset.obsPage;
    const scrollLeft = target.querySelector('.obs-table-scroll')?.scrollLeft ?? 0;
    target.innerHTML = `<div class="obs-table-scroll" tabindex="0" role="region" aria-label="Page priorities"><table><caption>Every captured page, ranked by ${esc(this.ranking === 'duration' ? 'visit duration' : this.ranking === 'incoming' ? 'distinct linking pages' : 'finding count')}. Unknown measurements sort last.</caption><thead><tr><th scope="col">Page</th><th scope="col">Visit</th><th scope="col">Words</th><th scope="col">Linking pages</th><th scope="col">Findings</th></tr></thead><tbody>${rows.slice(this.rankingPage * 20, (this.rankingPage + 1) * 20).map(p => `<tr><th scope="row"><button class="obs-url" data-obs-page="${esc(p.url)}">${esc(p.title || p.url)}</button><small>${esc(p.url)}</small></th><td>${ms(p.duration)}</td><td>${p.words === null ? 'N/A' : fmt(p.words)}</td><td>${fmt(p.incoming)}</td><td>${fmt(p.findings)}</td></tr>`).join('') || '<tr><td colspan="5">No captured pages yet.</td></tr>'}</tbody></table></div>`;
    const region = target.querySelector<HTMLElement>('.obs-table-scroll')!; region.scrollLeft = scrollLeft;
    if (focused) (focusURL ? target.querySelector<HTMLElement>(`[data-obs-page="${CSS.escape(focusURL)}"]`) ?? region : region).focus({ preventScroll: true });
    this.control('obs-ranking-count').textContent = `Page ${this.rankingPage + 1} of ${total} · ${fmt(rows.length)} pages`;
    this.control<HTMLButtonElement>('obs-rank-previous').disabled = this.rankingPage === 0; this.control<HTMLButtonElement>('obs-rank-next').disabled = this.rankingPage === total - 1;
    this.control<HTMLButtonElement>('obs-export-pages').disabled = !rows.length;
  }
}
