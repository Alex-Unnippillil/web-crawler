/** Explicit, read-only connectivity checks and ephemeral owner-authorized credentials. */
import type { ConnectionReport } from '../src/studio/connection.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class ConnectionUI {
  private report?: ConnectionReport;
  private checking = false;
  private api: (path: string, method?: string, data?: unknown) => Promise<Response>;
  private show: (id: string) => void;
  private notify: (message: string) => void;
  constructor(api: (path: string, method?: string, data?: unknown) => Promise<Response>, show: (id: string) => void, notify: (message: string) => void) {
    this.api = api; this.show = show; this.notify = notify;
    $('connection-form').addEventListener('submit', e => { e.preventDefault(); void this.check(); });
    $('connection-owner').addEventListener('click', () => this.openAccess($<HTMLInputElement>('connection-url').value));
    $('connection-copy').addEventListener('click', () => { if (this.report) void navigator.clipboard.writeText(JSON.stringify(this.report, null, 2)).then(() => this.notify('Diagnostic report copied; no credentials included.')).catch(() => this.notify('Clipboard unavailable. Select the diagnostic text to copy it.')); });
    $('owner-form').addEventListener('submit', e => { e.preventDefault(); void this.save(); });
    $('owner-clear').addEventListener('click', () => void this.clear());
    $('owner-dialog').addEventListener('close', () => { $<HTMLInputElement>('owner-token').value = ''; $<HTMLInputElement>('owner-confirm').checked = false; });
  }
  open(url = ''): void { if (!this.checking) { $<HTMLInputElement>('connection-url').value = url; $('connection-result').textContent = ''; $('connection-copy').hidden = true; this.report = undefined; } this.show('connection-dialog'); $('connection-url').focus(); }
  openAccess(url = ''): void {
    try { $<HTMLInputElement>('owner-origin').value = new URL(/^[a-z]+:/i.test(url) ? url : `https://${url}`).origin; } catch { $<HTMLInputElement>('owner-origin').value = ''; }
    $('owner-error').hidden = true; $<HTMLInputElement>('owner-token').value = ''; this.show('owner-dialog');
    void this.refresh().catch(error => this.error(error));
  }
  private async refresh(): Promise<void> {
    const state = await (await this.api('/api/access')).json();
    $('owner-state').textContent = state.configured ? `Active for ${state.origin} · expires ${new Date(state.expiresAt).toLocaleTimeString()}` : 'No owner credential configured. Public crawling remains available.';
  }
  private error(error: unknown): void { $('owner-error').hidden = false; $('owner-error').textContent = error instanceof Error ? error.message : 'Owner access could not be updated.'; }
  private async save(): Promise<void> {
    const secret = $<HTMLInputElement>('owner-token'); const value = secret.value; secret.value = '';
    $<HTMLButtonElement>('owner-save').disabled = true;
    try { await this.api('/api/access', 'POST', { origin: $<HTMLInputElement>('owner-origin').value, token: value }); $('owner-error').hidden = true; await this.refresh(); this.notify('Owner credential is active in memory for this session. Check the connection again.'); }
    catch (error) { this.error(error); } finally { $<HTMLButtonElement>('owner-save').disabled = false; }
  }
  private async clear(): Promise<void> { try { await this.api('/api/access', 'DELETE'); $<HTMLInputElement>('owner-token').value = ''; await this.refresh(); this.notify('Owner credential removed.'); } catch (error) { this.error(error); } }
  private async check(): Promise<void> {
    if (this.checking) return; this.checking = true;
    const button = $<HTMLButtonElement>('connection-submit'); button.disabled = true; button.textContent = 'Checking…';
    $('connection-result').textContent = 'Checking robots policy and the starting page…'; $('connection-copy').hidden = true;
    try {
      const r = await (await this.api('/api/connection', 'POST', { url: $<HTMLInputElement>('connection-url').value })).json() as ConnectionReport;
      this.report = r;
      $('connection-result').innerHTML = `<section class="connection-outcome ${esc(r.outcome)}"><span class="eyebrow">${esc(r.outcome === 'ready' ? 'CONNECTION VERIFIED' : 'ACTIONABLE DIAGNOSIS')}</span><h3>${esc(r.title)}</h3><p>${esc(r.message)}</p><p>${esc(r.guidance)}</p></section><ol class="connection-checks">${r.checks.map(c => `<li><span class="check-indicator">${c.status && c.status < 400 ? '✓' : '!'}</span><div><strong>${esc(c.stage)} <span>${esc(c.state)}${c.status ? ` · HTTP ${c.status}` : ''}</span></strong><code>${esc(c.url)}</code><p>${esc(c.detail)}</p></div></li>`).join('')}</ol><p class="privacy-note">${r.requests} request(s) · ${(r.durationMs / 1000).toFixed(1)} seconds · no history saved</p>`;
      $('connection-copy').hidden = false;
    } catch (error) { $('connection-result').textContent = error instanceof Error ? error.message : 'Connection check failed.'; }
    finally { this.checking = false; button.disabled = false; button.textContent = 'Check connection'; }
  }
}
