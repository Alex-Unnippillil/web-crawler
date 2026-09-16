// Repository note: Implements browser-side Studio interactions, views, filtering, history, controls, and exports.
// Browser-side controller for Web Crawler Studio: forms, live progress, results, history, and exports.

import { Workbench } from './workbench.js';
import { workbenchTabs, type WorkbenchTab } from './workbench-model.js';
import { PageInspector } from './inspector.js';
import { Profiles } from './profiles.js';
import { renderTelemetry } from './telemetry.js';
import { saveFile, csv } from './atlas-shared.js';
import { AtlasWorkspace, type AtlasTab } from './atlas.js';
import type { Job, JobMeta } from '../src/studio/jobs.js';
import type { CrawledPage } from '../src/types.js';

type Tab = 'overview' | 'pages' | 'issues' | 'graph' | 'paths' | 'elements' | 'activity' | WorkbenchTab;
type Issue = { title: string; detail: string; url: string; severity: 'error' | 'review' | 'info' };
const icons: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  layers: '<path d="m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>', pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>', stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', right: '<path d="m9 5 7 7-7 7"/>', left: '<path d="m15 5-7 7 7 7"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  link: '<path d="m10 13 4-4M8 15l-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0M13 17a3.5 3.5 0 0 0 5 0l5-5a3.5 3.5 0 0 0-5-5l-2 2" transform="translate(0 -1) scale(.95)"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  network: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="m10.5 8-4 8m7-8 4 8M8 19h8"/>',
  terminal: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 9 3 3-3 3m6 0h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-6M4 12a8 8 0 0 0 14 6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const icon = (name: string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? icons.file}</svg>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function hydrate(root: ParentNode = document): void { root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon!); }); }
const token = document.querySelector<HTMLMetaElement>('meta[name="session-token"]')!.content;
let jobs: JobMeta[] = []; let selected: Job | undefined; let selectedID = ''; let tab: Tab = 'pages';
let issueFilter = 'All';
let query = ''; let pageIndex = 0; let busy = false; let offline = false; let loading = false; let mutation = false;
let view: 'workspace' | 'history' = location.hash === '#history' ? 'history' : 'workspace';
let etag = ''; let toastTimer: ReturnType<typeof setTimeout>; let confirmAction: (() => Promise<void>) | undefined;
const PAGE_SIZE = 20;
const atlas = new AtlasWorkspace({ openPage, notify: toast, api: path => api(path), navigate: next => { showView('workspace'); setTab(next as Tab); } });
const host = { openPage, notify: toast, api: (path: string) => api(path), navigate: (next: string) => { showView('workspace'); setTab(next as Tab); } };
const workbench = new Workbench(host);
const inspector = new PageInspector(host);
const profiles = new Profiles($<HTMLFormElement>('crawl-form'), toast);
const active = (j?: JobMeta) => !!j && ['running', 'paused', 'stopping'].includes(j.status);
const fmt = (n: number) => n.toLocaleString();
const duration = (ms: number) => ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`;
const labelStatus = (j: JobMeta) => ({ completed: j.failures ? 'Completed with errors' : 'Completed', failed: 'Needs attention', paused: 'Paused', running: 'Crawling', stopped: 'Stopped', stopping: 'Stopping…', interrupted: 'Interrupted' })[j.status];
async function api(path: string, method = 'GET', data?: unknown): Promise<Response> {
  const response = await fetch(path, { method, headers: { 'X-Crawler-Token': token, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error ?? `Request failed (${response.status}).`); }
  return response;
}
function toast(message: string): void { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000); }
function showDialog(id: string): void { $<HTMLDialogElement>(id).showModal(); }
function closeDialog(id: string): void { $<HTMLDialogElement>(id).close(); }
function showView(next: typeof view): void {
  view = next; location.hash = next; $('workspace-view').hidden = next !== 'workspace'; $('history-view').hidden = next !== 'history';
  $('breadcrumb-current').textContent = next === 'workspace' ? (tab === 'graph' ? 'Visual Atlas' : tab[0]!.toUpperCase()+tab.slice(1)) : 'Crawl history';
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => el.classList.toggle('selected', el.dataset.view === next));
  if (next === 'history') renderHistory();
}
function setConnection(connected: boolean, message = ''): void {
  offline = !connected;
  $('connection').innerHTML = `<i></i>${connected ? 'Connected locally' : 'Connection lost'}`;
  $('connection').classList.toggle('offline', !connected);
  $('connection-banner').hidden = connected;
  $('connection-banner').textContent = message.includes('Session expired') ? 'The app restarted. Refresh this page to reconnect to the new session.' : 'Cannot reach the local app. Keep its terminal open, or restart it with npm run gui. Reconnecting automatically…';
  document.querySelectorAll<HTMLButtonElement>('[data-action="new"],[data-action="demo"],[data-action="atlas-demo"],[data-action="hybrid-demo"]').forEach(b => { b.disabled = busy || offline || mutation; });
}
function issues(job: Job): Issue[] {
  const result = job.result; if (!result) return [];
  const list: Issue[] = result.errors.map(e => ({ title: e.status_code ? `HTTP ${e.status_code} · ${e.kind === 'non-html' ? 'Not an HTML page' : 'Request failed'}` : `${e.kind === 'network' ? 'Connection failed' : e.kind} · Could not read page`, detail: e.message, url: e.url, severity: e.kind === 'non-html' || e.kind === 'aborted' ? 'info' : 'error' }));
  const titles = new Map<string, number>();
  for (const p of Object.values(result.pages)) if (p.title?.trim()) titles.set(p.title.trim(), (titles.get(p.title.trim()) ?? 0) + 1);
  for (const p of Object.values(result.pages)) {
    if (p.rendering?.failure) list.push({ title: 'JavaScript · Rendering incomplete', detail: p.rendering.failure, url: p.url, severity: 'review' });
    if ((p.rendering?.console_errors ?? 0) > 0) list.push({ title: 'JavaScript · Console entries', detail: `${p.rendering!.console_errors} console warnings/errors captured. Inspect JavaScript evidence; not all warnings indicate a broken page.`, url: p.url, severity: 'review' });
    if ((p.rendering?.network_errors ?? 0) > 0) list.push({ title: 'Resources · Failed or blocked requests', detail: `${p.rendering!.network_errors} requests failed or were blocked by crawl policy. Inspect the network waterfall.`, url: p.url, severity: 'review' });
    if (p.inspection?.structured_data.some(d => !d.valid)) list.push({ title: 'Structured data · Invalid JSON-LD', detail: 'At least one JSON-LD block could not be parsed. Inspect the captured error.', url: p.url, severity: 'review' });
    for (const error of p.inspection?.extraction_errors ?? []) list.push({ title: 'Custom extraction · Rule error', detail: error, url: p.url, severity: 'review' });
    if (/\bnoindex\b/i.test(`${p.elements?.robots ?? ''} ${p.http?.headers['x-robots-tag'] ?? ''}`)) list.push({ title: 'Indexability · noindex declared', detail: 'This page declares noindex. This may be intentional; review before including it in a sitemap.', url: p.url, severity: 'info' });
    if (!p.title?.trim()) list.push({ title: 'Missing page title', detail: 'No text was found in the HTML <title> element.', url: p.url, severity: 'review' });
    if (!p.heading) list.push({ title: 'Missing main heading', detail: 'No H1 or fallback H2 heading was found.', url: p.url, severity: 'review' });
    if (!p.description?.trim()) list.push({ title: 'Missing meta description', detail: 'No meta description was found in the downloaded HTML.', url: p.url, severity: 'review' });
    if (p.title && (titles.get(p.title.trim()) ?? 0) > 1) list.push({ title: 'Repeated page title', detail: `${titles.get(p.title.trim())} crawled pages share this exact title. Review whether this is intentional.`, url: p.url, severity: 'review' });
  }
  return list;
}
/** Evidence-based grouping; category counts are filters, not SEO quality scores. */
function issueGroup(issue: Issue): string {
  if (issue.title.includes(' · ')) {
    const prefix = issue.title.split(' · ')[0]!;
    if (['JavaScript', 'Resources', 'Structured data', 'Custom extraction', 'Indexability'].includes(prefix)) return prefix;
    if (/robots/i.test(prefix)) return 'Robots';
    return 'HTTP / Network';
  }
  return /heading/i.test(issue.title) ? 'Content' : 'Metadata';
}
function filteredIssues(): Issue[] {
  return (selected ? issues(selected) : []).filter(i => (issueFilter === 'All' || issueGroup(i) === issueFilter) && `${i.title} ${i.detail} ${i.url}`.toLowerCase().includes(query));
}
function renderSidebar(): void {
  $('history-count').textContent = String(jobs.length);
  $('recent').innerHTML = jobs.length ? jobs.slice(0, 6).map(j => `<button class="recent-item ${esc(j.status)} ${j.id === selectedID ? 'current' : ''}" data-job="${esc(j.id)}" title="${esc(j.name)}"><span class="status-dot"></span><span>${esc(j.name)}</span></button>`).join('') : '<p class="sidebar-empty">Your recent crawls will appear here. Start with a website or the local demo.</p>';
}
function renderHistory(): void {
  $('history-list').innerHTML = jobs.length ? jobs.map(j => `<article class="history-card"><div class="site-avatar">${esc(j.name.charAt(0).toUpperCase())}</div><div class="history-info"><h3>${esc(j.name)}</h3><p>${esc(j.url)}</p></div><div class="history-meta">${fmt(j.pages)} pages · ${duration(j.durationMs)}<span>${new Date(j.createdAt).toLocaleString()}</span></div><span class="badge ${esc(j.status)}">${esc(labelStatus(j))}</span><button class="button" data-job="${esc(j.id)}">Open ${icon('arrow')}</button><button class="icon-button" data-delete="${esc(j.id)}" ${active(j) ? 'disabled' : ''} aria-label="Delete ${esc(j.name)}">${icon('trash')}</button></article>`).join('') : `<div class="results-panel empty-state">${icon('clock')}<h3>A fresh workspace</h3><p>Your saved crawls will appear here. Start a crawl from the New crawl button.</p></div>`;
}
function updateElapsed(): void {
  if (!selected) return;
  $('elapsed').textContent = `${active(selected) ? duration(Date.now() - Date.parse(selected.createdAt)) : duration(selected.durationMs)} elapsed`;
}
function renderCrawl(): void {
  document.body.classList.toggle('has-crawl', !!selected);
  $('welcome').hidden = !!selected; $('getting-started').hidden = !!selected; $('crawl-section').hidden = !selected;
  if (!selected) return;
  const j = selected; const r = j.result; const s = r?.summary; const allIssues = issues(j);
  $('crawl-name').textContent = j.name; $('crawl-url').textContent = `${j.demo ? 'LOCAL DEMONSTRATION · ' : ''}${j.url}`;
  $('site-avatar').textContent = j.name.charAt(0).toUpperCase();
  $('crawl-status').className = `badge ${j.status}`; if ($('crawl-status').textContent !== labelStatus(j)) $('crawl-status').textContent = labelStatus(j);
  const pause = $<HTMLButtonElement>('pause-button'); pause.hidden = !['running', 'paused'].includes(j.status); pause.disabled = offline || mutation;
  pause.innerHTML = `${icon(j.status === 'paused' ? 'play' : 'pause')}${j.status === 'paused' ? 'Resume' : 'Pause'}`;
  $<HTMLButtonElement>('stop-button').hidden = !active(j); $<HTMLButtonElement>('stop-button').disabled = j.status === 'stopping' || offline || mutation;
  $<HTMLButtonElement>('rerun-button').hidden = active(j); $<HTMLButtonElement>('rerun-button').disabled = busy || offline || mutation;
  $<HTMLButtonElement>('export-button').disabled = !r || offline;
  $('metric-pages').textContent = fmt(s?.pages_crawled ?? 0); $('metric-internal').textContent = fmt(s?.unique_internal_links ?? 0);
  const atlasIndex = atlas.indexFor(j);
  $('metric-images').textContent = fmt(atlasIndex?.images.length ?? 0);
  $('metric-resources').textContent = fmt(atlasIndex?.resources.length ?? 0);
  $('metric-external').textContent = fmt(s?.unique_external_links ?? 0); $('metric-issues').textContent = fmt(allIssues.length);
  $('pages-count').textContent = String(s?.pages_crawled ?? 0); $('issues-count').textContent = String(allIssues.length);
  const latestURL = [...j.logs].reverse().find(l => l.includes('crawling: '))?.split('crawling: ')[1];
  $('progress-message').textContent = j.status === 'running' ? `Crawling ${latestURL ?? j.url}` : j.status === 'paused' ? 'Paused. In-flight requests may finish; the run deadline still applies.' : j.status === 'stopping' ? 'Stopping requests and saving partial results…' : j.status === 'completed' ? 'Crawl finished. Your results are saved locally.' : j.status === 'failed' ? 'The crawl could not collect HTML pages.' : 'Partial results saved. Run again to start a new crawl.';
  $('progress-numbers').textContent = `${fmt(s?.urls_scheduled ?? 0)} / ${fmt(j.options.maxPages)} URL budget`;
  const progress = $<HTMLProgressElement>('crawl-progress'); progress.max = j.options.maxPages; progress.value = s?.urls_scheduled ?? 0;
  const skipped = Object.values(r?.skipped ?? {}).reduce((a, b) => a + b, 0);
  $('progress-detail').textContent = `${j.options.maxConcurrency} workers · ${j.options.delayMs} ms pacing · ${s?.requests ?? 0} requests · ${s?.retries ?? 0} retries · ${skipped} skipped encounters`;
  const notice: string[] = [];
  if (j.message) notice.push(j.message);
  if (r?.summary.limit_reached) notice.push('The URL budget was reached. This is a partial inventory, not the whole website.');
  if (r?.skipped.depth_limit || r?.skipped.query_limit) notice.push('Some URLs were excluded by depth or query-variant limits.');
  if (r?.warnings.length) notice.push(...r.warnings.slice(0, 3));
  $('job-notice').hidden = !notice.length; $('job-notice').textContent = [...new Set(notice)].join(' ');
  renderTelemetry($('crawl-telemetry'), j);
  updateElapsed(); renderResults();
}
function pageList(): CrawledPage[] {
  const filter = $<HTMLSelectElement>('page-filter').value;
  const review = new Set(selected ? issues(selected).map(i => i.url) : []);
  return Object.values(selected?.result?.pages ?? {}).filter(p => (!query || `${p.url} ${p.title} ${p.heading}`.toLowerCase().includes(query)) &&
    (filter === 'all' || filter === 'browser' && p.rendering?.method === 'browser' || filter === 'http' && p.rendering?.method !== 'browser' || filter === 'render-failed' && !!p.rendering?.failure || filter === 'sitemap' && p.discovery?.method === 'sitemap' || filter === 'review' && review.has(p.url) || filter === 'external' && p.external_links.length > 0 || filter === 'no-external' && !p.external_links.length))
    .sort((a, b) => { switch ($<HTMLSelectElement>('sort').value) { case 'depth': return a.depth - b.depth || a.url.localeCompare(b.url); case 'duration': return b.duration_ms - a.duration_ms; case 'links': return b.outgoing_links.length - a.outgoing_links.length; default: return a.url.localeCompare(b.url); } });
}
function setTab(next: Tab): void {
  tab = next; pageIndex = 0;
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(el => {
    const chosen = el.dataset.tab === tab; el.classList.toggle('active', chosen); el.setAttribute('aria-selected', String(chosen)); el.tabIndex = chosen ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>('[data-section]').forEach(el => el.classList.toggle('selected', el.dataset.section === tab));
  $('breadcrumb-current').textContent = next === 'graph' ? 'Visual Atlas' : next[0]!.toUpperCase() + next.slice(1);
  $('result-content').setAttribute('aria-labelledby', `tab-${tab}`); renderResults();
}
function renderResults(): void {
  $('results-toolbar').hidden = !['pages', 'issues'].includes(tab); $('table-footer').hidden = tab !== 'pages';
  document.querySelector<HTMLButtonElement>('[data-action="pages-csv"]')!.hidden = tab !== 'pages';
  $('page-filter').hidden = tab !== 'pages'; $('sort').hidden = tab !== 'pages';
  $<HTMLInputElement>('search').placeholder = tab === 'issues' ? 'Search issues and URLs…' : 'Search pages, titles, or URLs…';
  const target = $('result-content');
  if (workbenchTabs.includes(tab as WorkbenchTab)) { atlas.leave(); workbench.show(target, tab as WorkbenchTab, selected); return; }
  workbench.leave();
  if (['overview', 'graph', 'paths', 'elements'].includes(tab)) { atlas.render(target, tab as AtlasTab, selected); return; }
  atlas.leave();
  if (tab === 'activity') { target.innerHTML = `<pre class="activity">${esc(selected?.logs.join('\n') || 'Waiting for the first request…')}</pre>`; return; }
  if (tab === 'issues') {
    const all = selected ? issues(selected) : [];
    const list = filteredIssues();
    const categories = ['All', ...new Set(all.map(issueGroup))];
    const warnings = selected?.result?.warnings ?? [];
    target.innerHTML = list.length ? `<div class="issue-list">${list.slice(0, 500).map(i => `<article class="issue ${i.severity}">${icon(i.severity === 'info' ? 'file' : 'alert')}<div><h3>${esc(i.title)}</h3><p>${esc(i.detail)}</p><button class="issue-url" data-page="${esc(i.url)}">${esc(i.url)}</button></div><span class="badge issue-badge ${i.severity === 'error' ? 'failed' : 'paused'}">${i.severity === 'error' ? 'Error' : i.severity === 'info' ? 'Info' : 'Review'}</span></article>`).join('')}${list.length > 500 ? '<p class="muted">Showing the first 500 matching issues. Narrow the search or export the complete crawl.</p>' : ''}</div>` : `<div class="empty-state">${icon('check')}<h3>${query ? 'No matching issues' : active(selected) ? 'No issues found so far' : 'Nothing flagged by these checks'}</h3><p>${query ? 'Try a different search.' : 'These are basic content and fetch checks, not a comprehensive site audit.'}${warnings.length ? ' Review the crawl notices above.' : ''}</p></div>`;
    target.insertAdjacentHTML('afterbegin', `<div class="issue-categories" role="group" aria-label="Issue category filters">${categories.map(category => `<button class="button" data-issue-category="${esc(category)}" aria-pressed="${category===issueFilter}">${esc(category)} <span>${category==='All'?all.length:all.filter(i=>issueGroup(i)===category).length}</span></button>`).join('')}<button class="button" data-action="issues-csv">Export filtered issues</button></div>`);
    return;
  }
  const pages = pageList(); const totalPages = Math.max(1, Math.ceil(pages.length / PAGE_SIZE));
  pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
  const shown = pages.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const review = new Set(selected ? issues(selected).map(i => i.url) : []);
  target.innerHTML = shown.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Page inventory"><table><thead><tr><th>Page / URL</th><th>Status</th><th>Method</th><th>Words</th><th>Depth</th><th>Internal</th><th>External</th><th>Duration</th><th><span class="sr-only">Inspect</span></th></tr></thead><tbody>${shown.map(p => `<tr><td><div class="page-cell"><span class="page-icon">${icon('file')}</span><button class="page-link" data-page="${esc(p.url)}" title="Inspect ${esc(p.url)}"><strong>${esc(p.title || p.heading || 'Untitled page')}${review.has(p.url) ? '<span class="tiny-dot" title="Needs review"></span>' : ''}</strong><small>${esc(new URL(p.url).pathname + new URL(p.url).search)}</small></button></div></td><td><span class="http-status">${p.status_code} OK</span></td><td><span class="method-${p.rendering?.method ?? 'http'}" title="${esc(p.rendering?.failure || p.rendering?.reasons.join('; ') || '')}">${p.rendering?.method === 'browser' ? 'BROWSER' : 'HTTP'}${p.rendering?.failure ? ' !' : ''}</span></td><td>${p.inspection?.word_count ?? '—'}</td><td>${p.discovery?.method === 'sitemap' ? 'seed' : p.depth}</td><td>${p.internal_links.length}</td><td>${p.external_links.length}</td><td class="duration">${fmt(p.duration_ms)} ms</td><td><button class="icon-button" data-page="${esc(p.url)}" aria-label="Inspect ${esc(p.title || p.url)}">${icon('right')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon(query ? 'search' : active(selected) ? 'globe' : 'file')}<h3>${query || $<HTMLSelectElement>('page-filter').value !== 'all' ? 'No matching pages' : active(selected) ? 'Discovering your first pages' : 'No HTML pages collected'}</h3><p>${query ? 'Try a different search or clear the filters.' : active(selected) ? 'Checking robots.txt and fetching the starting URL…' : 'Open Issues and Activity for details about this run.'}</p></div>`;
  $('result-count').textContent = pages.length ? `Showing ${pageIndex * PAGE_SIZE + 1}–${Math.min((pageIndex + 1) * PAGE_SIZE, pages.length)} of ${fmt(pages.length)} pages` : '0 pages';
  $('pagination').textContent = `${pageIndex + 1} / ${totalPages}`;
  document.querySelector<HTMLButtonElement>('[data-action="previous"]')!.disabled = pageIndex === 0;
  document.querySelector<HTMLButtonElement>('[data-action="next"]')!.disabled = pageIndex + 1 >= totalPages;
}
// The visual map is isolated in the TypeScript Atlas modules.
function safeLink(url: string): string {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? `<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>` : esc(url); } catch { return esc(url); }
}
function openPage(url: string): void { if (selected) inspector.open(selected, url, tab === 'javascript' ? 'javascript' : tab === 'resources' ? 'network' : 'overview'); }
async function loadJob(id: string, force = false): Promise<void> {
  const captured = id;
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { headers: { 'X-Crawler-Token': token, ...(!force && id === selectedID && etag ? { 'If-None-Match': etag } : {}) } });
  if (response.status === 304) return;
  if (!response.ok) throw new Error((await response.json()).error ?? 'Could not load this crawl.');
  const data = await response.json() as Job;
  if (selectedID && selectedID !== captured) return;
  selected = data; selectedID = id; etag = response.headers.get('etag') ?? ''; renderCrawl(); renderSidebar();
}
async function chooseJob(id: string): Promise<void> {
  selectedID = id; selected = undefined; etag = ''; query = ''; $<HTMLInputElement>('search').value = ''; pageIndex = 0;
  $<HTMLSelectElement>('page-filter').value = 'all'; setTab('pages'); showView('workspace');
  await loadJob(id, true);
}
async function poll(): Promise<void> {
  if (loading || mutation) return; loading = true;
  try {
    const data = await (await api('/api/state')).json() as { jobs: JobMeta[]; busy: boolean; dataDirectory: string; browser?: { installed: boolean; message: string } };
    if (data.browser) $('browser-availability').textContent = data.browser.message;
    const prev = JSON.stringify(jobs); jobs = data.jobs; busy = data.busy; setConnection(true); $('data-directory').textContent = data.dataDirectory;
    if (JSON.stringify(jobs) !== prev) { renderSidebar(); if (view === 'history') renderHistory(); }
    if (!selectedID && jobs.length) { selectedID = jobs[0]!.id; await loadJob(selectedID, true); }
    else if (selectedID) {
      const meta = jobs.find(j => j.id === selectedID);
      if (!meta) { selectedID = ''; selected = undefined; renderCrawl(); }
      else if (!selected || selected.revision !== meta.revision || selected.status !== meta.status) await loadJob(selectedID);
    }
  } catch (error) { setConnection(false, String(error)); }
  finally { loading = false; }
}
function showNew(rerun = false): void {
  if (busy) { toast('A crawl is already active. Stop it before starting another.'); return; }
  const form = $<HTMLFormElement>('crawl-form'); form.reset(); profiles.reset(); $('form-error').hidden = true;
  if (rerun && selected) {
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    field('url').value = selected.demo ? '' : selected.url; field('name').value = selected.name;
    const o = selected.options;
    for (const key of ['maxPages', 'maxDepth', 'maxConcurrency', 'delayMs', 'pathPrefix'] as const) field(key).value = String(o[key]);
    form.querySelectorAll<HTMLInputElement>('[name="preset"]').forEach(r => { r.checked = Number(r.value) === o.maxPages; });
    (form.elements.namedItem('mode') as RadioNodeList).value = o.mode ?? 'smart';
    field('browserConcurrency').value = String(o.browserConcurrency ?? 2); field('renderTimeout').value = String((o.renderTimeoutMs ?? 15000) / 1000); field('scrollIterations').value = String(o.scrollIterations ?? 0);
    field('sitemapURLs').value = (o.sitemapURLs ?? []).join('\n'); field('discoverSitemaps').checked = o.discoverSitemaps ?? true; field('captureScreenshots').checked = o.captureScreenshots ?? true; field('adaptiveConcurrency').checked = o.adaptiveConcurrency ?? false; profiles.setRules(o.extractionRules ?? []);
    field('timeout').value = String(o.timeoutMs / 1000); field('duration').value = String(o.maxDurationMs / 60000); field('stripTracking').checked = o.stripTracking;
    form.querySelector<HTMLDetailsElement>('details')!.open = true;
  }
  showDialog('crawl-dialog'); $<HTMLInputElement>('url-input').focus();
}
async function startCrawl(demo = false, visual = false, hybrid = false): Promise<void> {
  if (mutation || busy) return; mutation = true; setConnection(!offline);
  const startButton = $<HTMLButtonElement>('start-button'); startButton.disabled = true;
  try {
    const form = new FormData($<HTMLFormElement>('crawl-form'));
    let url = String(form.get('url') ?? '').trim();
    if (!demo && !/^[a-z][a-z\d+.-]*:/i.test(url)) url = `https://${url}`;
    const number = (name: string) => Number(form.get(name));
    const data = demo ? { demo: true, atlas: visual, hybrid, options: { mode: hybrid ? 'smart' : 'http', discoverSitemaps: hybrid, scrollIterations: hybrid ? 2 : 0, maxPages: visual ? 100 : 50, delayMs: hybrid || visual ? 100 : 350, extractionRules: hybrid ? [{ name: 'Price', selector: '.product-price', mode: 'text' }] : [] } } : { url, name: form.get('name'), options: {
      mode: String(form.get('mode') ?? 'smart'), browserConcurrency: number('browserConcurrency'), renderTimeoutMs: number('renderTimeout') * 1000, scrollIterations: number('scrollIterations'), discoverSitemaps: form.get('discoverSitemaps') === 'on', captureScreenshots: form.get('captureScreenshots') === 'on', adaptiveConcurrency: form.get('adaptiveConcurrency') === 'on', sitemapURLs: String(form.get('sitemapURLs') ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean), extractionRules: profiles.getRules(),
      maxPages: number('maxPages'), maxDepth: number('maxDepth'), maxConcurrency: number('maxConcurrency'), delayMs: number('delayMs'),
      timeoutMs: number('timeout') * 1000, maxDurationMs: number('duration') * 60000, pathPrefix: String(form.get('pathPrefix') ?? '').trim(), stripTracking: form.get('stripTracking') === 'on',
    } };
    const job = await (await api('/api/jobs', 'POST', data)).json() as Job;
    if ($<HTMLDialogElement>('crawl-dialog').open) closeDialog('crawl-dialog');
    busy = true; selectedID = job.id; selected = job; etag = ''; query = ''; $<HTMLInputElement>('search').value = ''; pageIndex = 0;
    issueFilter = 'All'; setTab(hybrid ? 'javascript' : visual ? 'graph' : 'pages'); showView('workspace'); renderCrawl(); toast(demo ? 'Crawling the local demo site. No external website is fetched.' : 'Crawl started. You can pause or stop at any time.');
  } catch (error) { if ($<HTMLDialogElement>('crawl-dialog').open) { $('form-error').textContent = String(error).replace(/^Error: /, ''); $('form-error').hidden = false; } else toast(String(error).replace(/^Error: /, '')); }
  finally { mutation = false; startButton.disabled = false; renderCrawl(); await poll(); }
}
function confirm(title: string, message: string, action: () => Promise<void>): void {
  $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-accept').textContent = title.startsWith('Delete') ? 'Delete crawl' : 'Stop crawl'; confirmAction = action; showDialog('confirm-dialog');
}
async function control(action: string): Promise<void> {
  if (!selected || mutation) return; mutation = true;
  try { selected = await (await api(`/api/jobs/${selected.id}/${action}`, 'POST')).json(); renderCrawl(); }
  finally { mutation = false; renderCrawl(); await poll(); }
}
async function download(format: string): Promise<void> {
  if (!selected) return;
  const response = await api(`/api/jobs/${selected.id}/export?format=${encodeURIComponent(format)}`);
  const blob = await response.blob(); const address = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = address; link.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `crawl.${format}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(address), 60000); toast('Report downloaded. Check your browser’s Downloads folder.');
}
function theme(toggle = false): void {
  let value = document.documentElement.dataset.theme ?? 'light'; try { value = document.documentElement.dataset.theme ?? localStorage.getItem('crawler-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { /* storage can be disabled */ }
  if (toggle) value = value === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value; $('theme-label').textContent = value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  try { localStorage.setItem('crawler-theme', value); } catch { /* optional preference */ }
}
document.addEventListener('click', e => {
  const el = (e.target as Element).closest<HTMLElement>('button,[data-page],[data-view]'); if (!el) return;
  const run = async () => {
    if (el.dataset.issueCategory) { issueFilter = el.dataset.issueCategory; renderResults(); return; }
    if (el.dataset.section) { showView('workspace'); setTab(el.dataset.section as Tab); return; }
    if (el.dataset.command) { closeDialog('command-dialog'); runCommand(el.dataset.command); return; }
    if (el.dataset.jump) { closeDialog('command-dialog'); showView('workspace'); setTab(el.dataset.jump as Tab); return; }
    if (el.dataset.inspectElements) { closeDialog('detail-dialog'); atlas.openElementsForPage(el.dataset.inspectElements); return; }
    if (el.dataset.close) { closeDialog(el.dataset.close); return; }
    if (el.dataset.job) { await chooseJob(el.dataset.job); return; }
    if (el.dataset.page) { if ($<HTMLDialogElement>('command-dialog').open) closeDialog('command-dialog'); openPage(el.dataset.page); return; }
    if (el.dataset.tab) { setTab(el.dataset.tab as Tab); return; }
    if (el.dataset.view) { showView(el.dataset.view as typeof view); return; }
    if (el.dataset.export) { await download(el.dataset.export); return; }
    if (el.dataset.copy) { try { await navigator.clipboard.writeText(el.dataset.copy); toast('URL copied.'); } catch { toast('Clipboard unavailable. Select and copy the URL above.'); } return; }
    if (el.dataset.delete) {
      const id = el.dataset.delete;
      confirm('Delete this crawl?', 'This permanently removes its saved results from this computer. Export anything you need first.', async () => { await api(`/api/jobs/${id}`, 'DELETE'); if (selectedID === id) { selectedID = ''; selected = undefined; etag = ''; renderCrawl(); } await poll(); toast('Crawl deleted.'); }); return;
    }
    switch (el.dataset.action) {
      case 'new': showNew(); break; case 'help': showDialog('help-dialog'); break; case 'theme': theme(true); break;
      case 'demo': await startCrawl(true); break;
      case 'hybrid-demo': await startCrawl(true, false, true); break;
      case 'browser-help': showDialog('browser-dialog'); break;
      case 'refresh-browser': { const data = await (await api('/api/browser')).json(); $('browser-check-result').textContent = data.message; $('browser-availability').textContent = data.message; break; }
      case 'issues-csv': saveFile(csv(filteredIssues().map(i => ({ Category: issueGroup(i), Severity: i.severity, Issue: i.title, URL: i.url, Evidence: i.detail }))), 'filtered-issues.csv', 'text/csv'); break;
      case 'pages-csv': saveFile(csv(pageList().map(p => ({ URL: p.url, Title: p.title, Status: p.status_code, Method: p.rendering?.method ?? 'http', Words: p.inspection?.word_count, Depth: p.depth, Duration_ms: p.duration_ms }))), 'filtered-pages.csv', 'text/csv'); break;
      case 'atlas-demo': await startCrawl(true, true); break;
      case 'commands': showDialog('command-dialog'); $('command-search').focus(); break;
      case 'density': toggleDensity(); break;
      case 'rerun': if (selected?.demo) await startCrawl(true, selected.demoMode === 'atlas', selected.demoMode === 'hybrid'); else showNew(true); break;
      case 'pause': await control(selected?.status === 'paused' ? 'resume' : 'pause'); break;
      case 'stop': confirm('Stop this crawl?', 'Completed pages will be saved and remain available to inspect and export.', () => control('stop')); break;
      case 'export': showDialog('export-dialog'); break; case 'previous': pageIndex--; renderResults(); break; case 'next': pageIndex++; renderResults(); break;
    }
  };
  void run().catch(error => toast(String(error).replace(/^Error: /, '')));
});
$('confirm-accept').addEventListener('click', () => { const action = confirmAction; confirmAction = undefined; closeDialog('confirm-dialog'); void action?.().catch(error => toast(String(error))); });
$<HTMLFormElement>('crawl-form').addEventListener('submit', e => { e.preventDefault(); void startCrawl(); });
document.querySelectorAll<HTMLInputElement>('[name="preset"]').forEach(radio => radio.addEventListener('change', () => { ($<HTMLFormElement>('crawl-form').elements.namedItem('maxPages') as HTMLInputElement).value = radio.value; }));
($<HTMLFormElement>('crawl-form').elements.namedItem('maxPages') as HTMLInputElement).addEventListener('input', e => { document.querySelectorAll<HTMLInputElement>('[name="preset"]').forEach(r => { r.checked = r.value === (e.target as HTMLInputElement).value; }); });
$('search').addEventListener('input', () => { query = $<HTMLInputElement>('search').value.trim().toLowerCase(); pageIndex = 0; renderResults(); });
for (const id of ['page-filter', 'sort']) $(id).addEventListener('change', () => { pageIndex = 0; renderResults(); });
document.querySelector('[role="tablist"]')!.addEventListener('keydown', event => {
  const e = event as KeyboardEvent; if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.result-tabs [data-tab]')).map(el => el.dataset.tab as Tab); const index = tabs.indexOf(tab);
  const next = e.key === 'Home' ? tabs[0]! : e.key === 'End' ? tabs[tabs.length - 1]! : tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
  setTab(next); $(`tab-${next}`).focus();
});
document.addEventListener('keydown', e => {
  const target = e.target as HTMLElement;
  if (target.closest('input,textarea,select,[contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key.toLowerCase() === 'n' && !offline) { e.preventDefault(); showNew(); }
  if (e.key === '/' && selected) { e.preventDefault(); showView('workspace'); setTab('pages'); $('search').focus(); }
});
window.addEventListener('hashchange', () => { if (location.hash === '#history' && view !== 'history') showView('history'); if (location.hash === '#workspace' && view !== 'workspace') showView('workspace'); });

/** Optional reading density changes spacing, never content or crawl limits. */
function toggleDensity(): void {
  const compact = document.documentElement.dataset.density !== 'compact';
  document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
  $('density-label').textContent = compact ? 'Comfortable' : 'Compact';
  try { localStorage.setItem('crawler-density', compact ? 'compact' : 'comfortable'); } catch { /* optional preference */ }
}
try { if (localStorage.getItem('crawler-density') === 'compact') toggleDensity(); } catch { /* optional preference */ }
function runCommand(command: string): void {
  showView('workspace');
  if (command === 'show 404s') { query = '404'; $<HTMLInputElement>('search').value = query; setTab('issues'); }
  else if (command === 'javascript pages') { $<HTMLSelectElement>('page-filter').value = 'browser'; setTab('pages'); }
  else if (command === 'images missing alt') { setTab('elements'); atlas.openImages('missing'); }
  else if (command === 'external links') { setTab('links'); workbench.setFilter('Type','External'); }
  else if (command === 'new crawl') showNew();
}
$('command-search').addEventListener('input', () => {
  const q = $<HTMLInputElement>('command-search').value.trim().toLowerCase();
  const sections: [string,string][] = [['overview','Insights'],['pages','Pages'],['graph','Visual Atlas spiderweb'],['paths','URL paths'],['elements','Images and elements'],['issues','Issues'],['javascript','JavaScript analysis'],['resources','Resources and network'],['structured','Structured data'],['sitemaps','Sitemaps'],['robots','Robots'],['custom','Custom extraction'],['activity','Activity']];
  const commands = ['show 404s','javascript pages','images missing alt','external links','new crawl'].filter(c => c.includes(q));
  const pages = Object.values(selected?.result?.pages ?? {}).filter(p => q && `${p.url} ${p.title} ${p.heading} ${p.image_urls.join(' ')}`.toLowerCase().includes(q)).slice(0,12);
  $('command-results').innerHTML = commands.map(c=>`<button data-command="${esc(c)}"><b>Command</b> ${esc(c)}</button>`).join('') + sections.filter(([,name])=>name.toLowerCase().includes(q)).map(([key,name])=>`<button data-jump="${key}">${name}<span>↗</span></button>`).join('') + pages.map(p=>`<button data-page="${esc(p.url)}"><span>${esc(p.title||p.heading||p.url)}<small>${esc(p.url)}</small></span></button>`).join('') || '<p>No matches in this crawl.</p>';
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); if (document.querySelector('dialog[open]')) return;
    showDialog('command-dialog'); $('command-search').focus();
  }
});

hydrate(); theme(); showView(view); renderSidebar(); renderCrawl(); void poll();
setInterval(() => { updateElapsed(); if (!document.hidden) void poll(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
