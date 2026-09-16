/** Contextual page inspector. Remote sources are escaped text, never live HTML.
 * Screenshot blobs are authenticated local evidence and revoked when the drawer closes.
 */
import { sourceDiff } from './source-diff.js';
import type { Job } from '../src/studio/jobs.js';
import type { CrawledPage } from '../src/types.js';
import type { BrowserEvidence } from '../src/inspection-types.js';
import { esc, externalLink, bytes, saveFile, csv, type AtlasHost } from './atlas-shared.js';
type InspectTab = 'overview' | 'content' | 'links' | 'headers' | 'structured' | 'javascript' | 'network' | 'source' | 'screenshot';
const tabs: InspectTab[] = ['overview','content','links','headers','structured','javascript','network','source','screenshot'];
export class PageInspector {
  private sequence = 0; private blob = ''; private job?: Job; private url = ''; private tab: InspectTab = 'overview';
  private evidence?: BrowserEvidence; private error = ''; private loading = false;
  private host: AtlasHost;
  constructor(host: AtlasHost) {
    this.host = host;
    document.getElementById('detail-dialog')!.addEventListener('close', () => { this.sequence++; this.revoke(); this.evidence = undefined; });
  }
  private revoke(): void { if (this.blob) URL.revokeObjectURL(this.blob); this.blob = ''; }
  open(job: Job, url: string, tab: InspectTab = 'overview'): void {
    this.sequence++; this.revoke(); this.job = job; this.url = url; this.tab = tab; this.evidence = undefined; this.error = ''; this.loading = false;
    this.draw(); const dialog = document.getElementById('detail-dialog') as HTMLDialogElement; if (!dialog.open) dialog.showModal();
  }
  private async loadEvidence(): Promise<void> {
    if (this.evidence || this.loading || this.error || !this.job?.result?.pages[this.url]?.rendering?.artifact_id) return;
    const sequence = this.sequence; this.loading = true;
    try {
      const response = await this.host.api(`/api/jobs/${this.job.id}/evidence?url=${encodeURIComponent(this.url)}`);
      const record = await response.json() as BrowserEvidence;
      if (sequence !== this.sequence) return;
      this.evidence = record;
    } catch (error) { if (sequence === this.sequence) this.error = String(error); }
    finally { if (sequence === this.sequence) { this.loading = false; this.draw(); } }
  }
  private async loadScreenshot(): Promise<void> {
    if (this.blob || this.loading || this.error || !this.job?.result?.pages[this.url]?.rendering?.artifact_id) return;
    const sequence = this.sequence; this.loading = true;
    try {
      const response = await this.host.api(`/api/jobs/${this.job.id}/evidence?url=${encodeURIComponent(this.url)}&format=screenshot`);
      const blob = await response.blob();
      if (sequence !== this.sequence) return;
      this.blob = URL.createObjectURL(blob);
    } catch (error) { if (sequence === this.sequence) this.error = String(error); }
    finally { if (sequence === this.sequence) { this.loading = false; this.draw(); } }
  }
  private draw(): void {
    const page = this.job?.result?.pages[this.url]; const root = document.getElementById('detail-content')!;
    const inbound = Object.values(this.job?.result?.pages ?? {}).filter(p => p.internal_links.includes(this.url) || page && p.internal_links.includes(page.requested_url));
    root.innerHTML = `<div class="inspect-identity"><h3>${esc(page?.title || page?.heading || 'URL inspection')}</h3><p>${externalLink(this.url)}</p><div class="inspect-badges"><span class="method-${page?.rendering?.method ?? 'http'}">${page?.rendering?.method === 'browser' ? 'BROWSER' : 'HTTP'}</span><span>${esc(page?.status_code ?? 'Not collected')}</span><span>${page ? bytes(page.content_bytes) : ''}</span><button class="button" data-copy="${esc(this.url)}">Copy URL</button></div></div><div class="inspect-tabs" role="tablist" aria-label="Page inspection tabs">${tabs.map(t => `<button role="tab" id="inspect-tab-${t}" aria-selected="${t === this.tab}" tabindex="${t === this.tab ? 0 : -1}" data-inspect-tab="${t}">${t[0]!.toUpperCase()+t.slice(1)}</button>`).join('')}</div><div class="inspect-pane" role="tabpanel" aria-labelledby="inspect-tab-${this.tab}" tabindex="0">${page ? this.content(page, inbound) : `<p>${esc(this.job?.result?.errors.find(e => e.url === this.url)?.message ?? 'Discovered URL; no successful page record is available.')}</p><h3>Linked from · ${inbound.length}</h3>${this.linkList(inbound.map(p => p.url))}`}</div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-inspect-tab]').forEach(button => button.addEventListener('click', () => { this.tab = button.dataset.inspectTab as InspectTab; this.error = ''; this.draw(); }));
    root.querySelector('.inspect-tabs')!.addEventListener('keydown', event => {
      const e = event as KeyboardEvent; if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault(); const index = tabs.indexOf(this.tab); this.tab = e.key === 'Home' ? tabs[0]! : e.key === 'End' ? tabs.at(-1)! : tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length-1)) % tabs.length]!; this.error = ''; this.draw(); document.getElementById(`inspect-tab-${this.tab}`)?.focus();
    });
    root.querySelector<HTMLButtonElement>('[data-save-source]')?.addEventListener('click', () => saveFile(JSON.stringify(this.evidence, null, 2), 'page-rendering-evidence.json'));
    root.querySelector<HTMLButtonElement>('[data-save-network]')?.addEventListener('click', () => saveFile(csv((this.evidence?.network ?? page?.rendering?.network ?? []).map(r => ({ ...r, redirects: JSON.stringify(r.redirects) }))), 'page-network.csv', 'text/csv'));
    if (page?.rendering?.artifact_id && ['source','network'].includes(this.tab) && !this.evidence && !this.error) void this.loadEvidence();
    if (page?.rendering?.artifact_id && this.tab === 'screenshot' && !this.blob && !this.error) void this.loadScreenshot();
  }
  private diffMarkup(evidence: BrowserEvidence): string {
    const diff = sourceDiff(evidence.raw_html,evidence.rendered_html);
    return `<details class="source-diff" open><summary>Source comparison · + added / − removed${diff.truncated ? ' · bounded preview' : ''}</summary><p class="muted">Formatting comparison, limited to 300 tag-separated lines per source. DOM normalization also changes source; use JavaScript metadata measurements for semantic changes.</p><pre tabindex="0">${diff.lines.map(line=>`<span class="diff-${line.kind}">${line.kind==='added'?'+':line.kind==='removed'?'−':' '} ${esc(line.text)}</span>`).join('')}</pre></details>`;
  }
  private linkList(urls: string[]): string { return urls.length ? `<ul class="detail-links">${urls.slice(0,500).map(url => `<li>${externalLink(url)}</li>`).join('')}</ul>` : '<p class="muted">None captured.</p>'; }
  private content(page: CrawledPage, inbound: CrawledPage[]): string {
    const p = page; const inspection = p.inspection; const rendering = p.rendering;
    const stats = (values: Record<string, unknown>) => `<div class="inspect-stats">${Object.entries(values).map(([key,value]) => `<div><span>${esc(key)}</span><b>${esc(value)}</b></div>`).join('')}</div>`;
    switch (this.tab) {
      case 'overview': return `${stats({ Status: p.status_code, 'Page time': `${p.duration_ms} ms`, 'Source bytes': bytes(p.content_bytes), Words: inspection?.word_count ?? 'unknown', Inlinks: inbound.length, 'Link depth': p.discovery?.method === 'sitemap' ? 'Sitemap seed' : p.depth })}<dl><dt>Page title · ${p.title?.length ?? 0} characters</dt><dd>${esc(p.title || 'Not found')}</dd><dt>Meta description · ${p.description?.length ?? 0} characters</dt><dd>${esc(p.description || 'Not found')}</dd><dt>Canonical URL</dt><dd>${p.canonical_url ? externalLink(p.canonical_url) : 'Not declared'}</dd><dt>Main heading</dt><dd>${esc(p.heading)}</dd><dt>Language / robots</dt><dd>${esc(p.elements?.language)} / ${esc(p.elements?.robots || 'Not declared')}</dd><dt>Discovery</dt><dd>${esc(p.discovery?.method ?? 'Legacy crawl')} ${esc(p.discovery?.source_url ?? '')}</dd><dt>Source response URL</dt><dd>${esc(rendering?.source_url ?? p.requested_url)}</dd><dt>Rendering decision</dt><dd>${esc(rendering?.reasons.join('; ') ?? 'HTTP page')} ${esc(rendering?.failure ?? '')}</dd></dl><h3>Technology evidence</h3>${(inspection?.technologies ?? []).map(t => `<p><b>${esc(t.name)} · ${t.confidence} confidence</b><br>${esc(t.evidence)}</p>`).join('') || '<p>No supported signatures detected.</p>'}<button class="button primary" data-inspect-elements="${esc(p.url)}">Browse this page’s elements</button>`;
      case 'content': return `<h3>Heading outline</h3><ul class="detail-links">${(p.elements?.headings ?? []).map(h => `<li><b>H${h.level}</b> ${esc(h.text)}</li>`).join('')}</ul><h3>Text sample</h3><p>${esc(inspection?.text_sample ?? p.first_paragraph)}</p><h3>Custom fields</h3><pre>${esc(JSON.stringify(inspection?.custom ?? {}, null, 2))}</pre><h3>Forms · structure only</h3><pre>${esc(JSON.stringify(p.elements?.forms ?? [], null, 2))}</pre><h3>Metadata</h3><pre>${esc(JSON.stringify(inspection?.metadata ?? {}, null, 2))}</pre>`;
      case 'links': return `<h3>Linked from · ${inbound.length}</h3>${this.linkList(inbound.map(p => p.url))}<h3>Internal links · ${p.internal_links.length}</h3>${this.linkList(p.internal_links)}<h3>External links · ${p.external_links.length}</h3>${this.linkList(p.external_links)}<h3>Images · ${p.image_urls.length}</h3>${this.linkList(p.image_urls)}`;
      case 'headers': return `<h3>Response headers</h3><p>Allowlisted headers only; cookies and authorization headers are not stored in diagnostics.</p><pre>${esc(JSON.stringify(p.http ?? { note: 'Headers not recorded in this legacy crawl.' }, null, 2))}</pre><h3>Hreflang</h3><pre>${esc(JSON.stringify(inspection?.hreflang ?? [], null, 2))}</pre>`;
      case 'structured': return (inspection?.structured_data ?? []).map(item => `<details class="inspect-object" open><summary>${esc(item.format)} · ${esc(item.types.join(', ') || 'Unspecified type')} · ${item.valid ? 'Parsed' : 'Invalid JSON'}</summary><pre>${esc(item.error || JSON.stringify(item.value, null, 2))}</pre></details>`).join('') || '<p>No structured data captured. Parsing does not establish search-engine eligibility.</p>';
      case 'javascript': {
        const d = rendering?.comparison;
        if (!d) return `<h3>${esc(rendering?.status ?? 'HTTP crawl')}</h3><p>${esc(rendering?.reasons.join('; ') ?? 'Browser rendering was not requested.')}</p><p>${esc(rendering?.failure ?? '')}</p>`;
        return `${stats({ 'Raw words': d.raw_words, 'Rendered words': d.rendered_words, 'Net words': d.word_delta, 'New links': d.added_links.length, 'Added text estimate': `${d.added_text_percent}%`, Settling: rendering?.settled })}<p class="muted">Positive net word-count increase divided by rendered word count; an estimate, not an exact JavaScript-generated-content percentage.</p><h3>Metadata changed by rendering</h3>${d.metadata_changes.map(m => `<section class="source-change"><h4>${esc(m.field)}</h4><div><b>Before</b><p>${esc(m.raw || '(empty)')}</p></div><div><b>After</b><p>${esc(m.rendered || '(empty)')}</p></div></section>`).join('') || '<p>No metadata changes.</p>'}<h3>New JavaScript links</h3>${this.linkList(d.added_links)}<h3>Removed links</h3>${this.linkList(d.removed_links)}<h3>New images</h3>${this.linkList(d.added_images)}<p>Structured objects: ${d.raw_structured} raw → ${d.rendered_structured} rendered</p><h3>Console / JavaScript entries</h3><pre>${esc((rendering?.console ?? []).map(c => `[${c.level}] ${c.text}`).join('\n') || 'None captured.')}</pre>${(rendering?.notes ?? []).map(n=>`<p class="notice">${esc(n)}</p>`).join('')}`;
      }
      case 'network': {
        const entries = this.evidence?.network ?? rendering?.network ?? []; const max = Math.max(1,...entries.map(r=>r.start_ms+r.duration_ms));
        return `<div class="wb-object-heading"><h3>Request waterfall · ${entries.length}</h3><button class="button" data-save-network>Export network CSV</button></div><p>Timings include crawler pacing and checked-transport time, not Chrome wire timing. ${this.loading ? 'Loading full evidence…' : ''}</p>${this.error ? `<p class="notice">${esc(this.error)}</p>` : ''}<div class="network-waterfall">${entries.map(r => `<details><summary><span class="net-status ${r.error ? 'net-error' : ''}">${esc(r.error ? '×' : r.status ?? '?')}</span><span class="net-name" title="${esc(r.url)}">${esc(r.type)} · ${esc(new URL(r.url).pathname)}</span><svg viewBox="0 0 240 18" role="img" aria-label="Starts ${r.start_ms} ms, duration ${r.duration_ms} ms"><rect x="${Math.round(r.start_ms / max * 240)}" y="3" width="${Math.max(2,Math.round(r.duration_ms / max * 240))}" height="12" class="${r.error ? 'net-fail' : 'net-bar'}"/></svg><span>${Math.round(r.duration_ms)} ms</span></summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details>`).join('') || '<p>No browser requests recorded. DOM resources are available in Resources.</p>'}</div>`;
      }
      case 'source': return !rendering?.artifact_id ? '<p>No stored rendering source for this page. Use Smart or Browser mode on a JavaScript page.</p>' : `<div class="wb-object-heading"><h3>Raw HTML ↔ rendered DOM</h3><button class="button" data-save-source ${this.evidence ? '' : 'disabled'}>Export evidence JSON</button></div><p>Inert source text. Remote HTML is never executed in this inspector. Sources and embedded text may contain sensitive website data; review before sharing.</p>${this.error ? `<p class="notice">${esc(this.error)}</p>` : this.evidence ? `${this.diffMarkup(this.evidence)}<p class="muted">Source previews show up to 120,000 characters per document. Export evidence for the complete retained source.</p><div class="source-columns"><section><h4>Raw response HTML</h4><pre tabindex="0">${esc(this.evidence.raw_html.slice(0,120000))}</pre></section><section><h4>Rendered DOM</h4><pre tabindex="0">${esc(this.evidence.rendered_html.slice(0,120000))}</pre></section></div><details><summary>Same-origin frames and open shadow roots · ${this.evidence.contexts.length}</summary><pre>${esc(JSON.stringify(this.evidence.contexts,null,2))}</pre></details>` : '<p role="status">Loading stored source…</p>'}`;
      case 'screenshot': return !rendering?.artifact_id ? '<p>No screenshot evidence for this HTTP-only page.</p>' : this.error ? `<p class="notice">${esc(this.error)}</p>` : this.blob ? `<p>Viewport snapshot from the isolated Chromium page. This is an image, not a live remote preview.</p><img class="inspect-screenshot" src="${esc(this.blob)}" alt="Rendered viewport for ${esc(p.url)}">` : '<p role="status">Loading viewport screenshot…</p>';
    }
  }
}
