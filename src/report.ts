// Repository note: Builds JSON, CSV, HTML, summary, and SVG crawl reports safely.
// Builds JSON, CSV, HTML, summary, and SVG report outputs from completed crawl data.

import { writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { safeHTTP } from './url.js';
import type { ExtractedPageData, CrawlResult, CrawledPage } from './types.js';

export function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Protect spreadsheet applications from formula interpretation, including whitespace prefixes.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function atomicWrite(filename: string, content: string): void {
  const target = resolve(filename);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  try { writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); renameSync(tmp, target); }
  finally { rmSync(tmp, { force: true }); }
}
function sorted<T extends ExtractedPageData>(pages: Record<string, T>): T[] {
  return Object.values(pages).sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
}
export function writeJSONReport(pageData: Record<string, ExtractedPageData>, filename = 'report.json'): void {
  atomicWrite(filename, `${JSON.stringify(sorted(pageData), null, 2)}\n`);
}
export function renderCSV(pages: Record<string, CrawledPage>): string {
  const columns = ['url', 'status_code', 'depth', 'title', 'heading', 'first_paragraph', 'internal_links', 'external_links', 'images', 'duration_ms', 'content_bytes'];
  const rows = sorted(pages).map(p => [p.url, p.status_code, p.depth, p.title ?? '', p.heading, p.first_paragraph,
    p.internal_links.length, p.external_links.length, p.image_urls.length, p.duration_ms, p.content_bytes]);
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function renderGraph(result: CrawlResult): string {
  const all = sorted(result.pages);
  const pages = all.slice(0, 120);
  const nodes = new Map(pages.map((p, i) => {
    const angle = 2 * Math.PI * i / Math.max(1, pages.length) - Math.PI / 2;
    return [p.url, { x: pages.length === 1 ? 500 : 500 + 330 * Math.cos(angle), y: pages.length === 1 ? 410 : 410 + 300 * Math.sin(angle), i }];
  }));
  let edges = '';
  let edgeCount = 0;
  for (const p of pages) {
    const from = nodes.get(p.url)!;
    for (const url of p.outgoing_links) {
      const to = nodes.get(url);
      if (!to || to === from || edgeCount >= 2000) continue;
      edgeCount++;
      edges += `<path d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}"/>`;
    }
  }
  const circles = pages.map(p => {
    const point = nodes.get(p.url)!;
    const label = `${point.i + 1}. ${new URL(p.url).pathname}${new URL(p.url).search}`;
    return `<g><title>${escapeHTML(p.url)}</title><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${pages.length < 30 ? 12 : 6}" fill="${p.depth === 0 ? '#ddaa58' : '#427b83'}"/><text x="${point.x.toFixed(1)}" y="${(point.y - 19).toFixed(1)}" text-anchor="middle" fill="#e5eef4" font-size="11">${escapeHTML(pages.length < 25 ? label.slice(0, 38) : point.i + 1)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 830" role="img" aria-labelledby="graph-title graph-desc"><title id="graph-title">Crawled page link graph</title><desc id="graph-desc">${pages.length} of ${all.length} successful pages; ${edgeCount} directed link relationships drawn as connecting lines. Hover over a node for its full URL.</desc><rect width="1000" height="830" rx="18" fill="#132531"/><text x="32" y="42" fill="#e5eef4" font-family="system-ui" font-size="19">Internal link map</text><text x="32" y="69" fill="#b4c6d0" font-family="system-ui" font-size="13">${pages.length} / ${all.length} pages · up to 2,000 connections · gold = start page</text><g stroke="#55818f" stroke-opacity="0.32" fill="none">${edges}</g><g font-family="system-ui">${circles}</g></svg>`;
}
function link(url: string): string {
  const safe = safeHTTP(url);
  return safe ? `<a href="${escapeHTML(safe)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a>` : escapeHTML(url);
}
const reportScript = `const q=document.getElementById('search');const rows=[...document.querySelectorAll('#pages tbody tr')];q.addEventListener('input',()=>{const needle=q.value.toLowerCase().trim();let n=0;for(const row of rows){const visible=row.textContent.toLowerCase().includes(needle);row.hidden=!visible;if(visible)n++;}document.getElementById('visible-count').textContent=n+' pages shown';});`;
export function renderHTML(result: CrawlResult): string {
  const s = result.summary;
  const pages = sorted(result.pages);
  const scriptHash = createHash('sha256').update(reportScript).digest('base64');
  const rows = pages.map(p => `<tr><td><strong>${link(p.url)}</strong><small>${escapeHTML(p.title || p.heading || 'No title or heading')}</small></td><td><span class="status">${p.status_code}</span></td><td>${p.depth}</td><td>${p.internal_links.length}</td><td>${p.external_links.length}</td><td>${p.image_urls.length}</td><td>${p.duration_ms.toLocaleString('en-US')} ms</td></tr>`).join('');
  const errors = result.errors.map(e => `<tr><td>${link(e.url)}</td><td>${escapeHTML(e.kind)}</td><td>${escapeHTML(e.message)}</td><td>${e.attempts}</td></tr>`).join('');
  const skipped = Object.entries(result.skipped).map(([k, v]) => `<span class="tag">${escapeHTML(k.replace(/_/g, ' '))}: <b>${v}</b></span>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>Crawl report · ${escapeHTML(new URL(result.start_url).hostname)}</title><style>
:root{color-scheme:light;--ink:#192f3a;--muted:#526976;--line:#d9e3e7;--paper:#f4f7f8;--accent:#285e65}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{background:#132531;color:#f3f7fa;padding:44px max(24px,calc((100vw - 1260px)/2)) 36px}.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b4c6d0}h1{font-size:clamp(28px,4vw,44px);line-height:1.12;margin:12px 0 16px;letter-spacing:-.03em}header p{color:#c7d6de;overflow-wrap:anywhere;margin:8px 0}main{max-width:1308px;margin:0 auto;padding:28px 24px 44px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}.metric,.panel{background:#fff;border:1px solid var(--line);border-radius:12px}.metric{padding:20px}.metric b{display:block;font-size:32px;line-height:1.25;letter-spacing:-.04em}.metric span{color:var(--muted);font-size:12px}.panel{padding:24px;margin-bottom:22px}h2{font-size:20px;margin:0 0 6px}p.note{color:var(--muted);font-size:13px;margin:0 0 20px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:22px 0 15px}.toolbar label{flex:1;max-width:550px}input{display:block;width:100%;padding:12px 14px;font:inherit;border:1px solid #9baeb9;border-radius:7px;margin-top:6px}input:focus{outline:3px solid #b2d8db}table{border-collapse:collapse;width:100%;font-size:13px}th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);text-align:left;background:#f3f7f8}td,th{padding:13px 12px;border-bottom:1px solid var(--line);vertical-align:top}td:first-child{min-width:260px;max-width:530px;overflow-wrap:anywhere}a{color:var(--accent);text-underline-offset:3px}small{display:block;color:var(--muted);margin-top:4px}.scroll{overflow:auto}.status{background:#e4f2ed;color:#245d4e;padding:3px 7px;border-radius:4px;font-size:11px}.tag{display:inline-block;background:#edf2f5;border-radius:5px;padding:6px 10px;margin:4px 5px 4px 0;font-size:12px}.warning{background:#fff6e4;border-left:3px solid #be8c32;padding:12px 16px;margin-bottom:12px;overflow-wrap:anywhere}.graph{max-width:1000px;margin:20px auto 0}.graph svg{display:block;width:100%;height:auto}summary{cursor:pointer;font-weight:650}footer{color:var(--muted);font-size:12px;padding-top:8px}code{font-size:12px}#visible-count{font-size:12px;color:var(--muted)}[hidden]{display:none!important}@media(max-width:680px){.metrics{grid-template-columns:repeat(2,1fr)}.toolbar{display:block}.panel{padding:18px}header{padding:30px 24px}main{padding:20px 14px}}@media print{header{background:white;color:#132531}header p{color:#526976}.toolbar{display:none}.panel{break-inside:avoid}a{color:inherit}.graph{max-width:650px}}
</style></head><body><header><div class="eyebrow">Web crawler / site intelligence</div><h1>Understand the pages.<br>See the connections.</h1><p>${escapeHTML(result.start_url)}</p><p>${escapeHTML(result.finished_at)} · ${(result.duration_ms / 1000).toFixed(2)} seconds · ${s.requests} HTTP requests · ${s.retries} retries</p></header><main><section class="metrics" aria-label="Crawl summary"><div class="metric"><b>${s.pages_crawled}</b><span>Successful HTML pages</span></div><div class="metric"><b>${s.unique_internal_links}</b><span>Unique same-origin links found</span></div><div class="metric"><b>${s.unique_external_links}</b><span>Unique external links found</span></div><div class="metric"><b>${s.failed}</b><span>Failed / non-HTML candidates</span></div></section>${result.warnings.map(w => `<div class="warning">${escapeHTML(w)}</div>`).join('')}${s.limit_reached ? '<div class="warning">The candidate URL budget was reached. This is a partial crawl, not a complete inventory.</div>' : ''}<section class="panel"><h2>Page inventory</h2><p class="note">Only successfully fetched and parsed HTML is listed. Link totals describe discovered URLs, not verified availability. External URLs are not fetched.</p><div class="toolbar"><label for="search">Search URL, title, status or depth<input id="search" type="search" placeholder="Filter the page inventory…" autocomplete="off"></label><span id="visible-count" aria-live="polite">${pages.length} pages shown</span></div><div class="scroll"><table id="pages"><thead><tr><th>Page / title</th><th>Status</th><th>Depth</th><th>Internal</th><th>External</th><th>Images</th><th>Elapsed</th></tr></thead><tbody>${rows}</tbody></table></div>${pages.length ? '' : '<p>No successful HTML pages. Inspect diagnostics and the seed URL before treating this run as successful.</p>'}</section><section class="panel"><details open><summary>Internal link map</summary><p class="note">Successful pages only; limited to 120 nodes and 2,000 connections. Lines show relationships, not crawl order. Node tooltips contain the URL.</p><div class="graph">${renderGraph(result)}</div></details></section><section class="panel"><h2>Diagnostics &amp; crawl boundaries</h2><p class="note">Depth is the discovery depth, not a guaranteed shortest path. Skipped counts are encounters, not unique URLs.</p>${skipped || '<p>No skipped candidates.</p>'}<div class="scroll"><table><thead><tr><th>URL</th><th>Type</th><th>Details</th><th>Attempts</th></tr></thead><tbody>${errors}</tbody></table></div>${errors ? '' : '<p>No request or parsing errors recorded.</p>'}</section><footer>BootCrawler · schema ${result.schema_version} · ${result.options.maxConcurrency} workers · candidate budget ${result.options.maxPages} · depth cap ${result.options.maxDepth}. Reports contain extracted site content; review before publishing.</footer></main><script>${reportScript}</script></body></html>`;
}
export function writeReports(result: CrawlResult, output = 'report.json'): string[] {
  const ext = extname(output);
  const prefix = ext.toLowerCase() === '.json' ? output.slice(0, -ext.length) : output;
  const files = [`${prefix}.json`, `${prefix}.csv`, `${prefix}.html`, `${prefix}.svg`, `${prefix}.summary.json`];
  writeJSONReport(result.pages, files[0]);
  atomicWrite(files[1]!, renderCSV(result.pages));
  atomicWrite(files[2]!, renderHTML(result));
  atomicWrite(files[3]!, `${renderGraph(result)}\n`);
  const { pages: _pages, ...metadata } = result;
  atomicWrite(files[4]!, `${JSON.stringify(metadata, null, 2)}\n`);
  return files.map(name => resolve(name));
}
