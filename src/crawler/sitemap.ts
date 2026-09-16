/** Bounded sitemap discovery. Sitemap URLs are metadata, never arbitrary API requests. */
import { JSDOM } from 'jsdom';
import { httpURL } from '../url.js';
import type { SitemapEntry, SitemapFile } from '../inspection-types.js';
export interface SitemapInventory { files: SitemapFile[]; urls: SitemapEntry[]; truncated: boolean }
export function robotsSitemaps(text: string, origin: string): string[] {
  const result = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const value = /^\s*sitemap\s*:\s*(\S+)/i.exec(line)?.[1];
    if (value) { try { const url = httpURL(value, origin); if (new URL(url).origin === origin) result.add(url); } catch { /* Invalid directives cannot expand scope. */ } }
  }
  return [...result].slice(0, 20);
}
export function parseSitemap(text: string, source: string): { kind: SitemapFile['kind']; children: string[]; urls: SitemapEntry[] } {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Sitemap DTD/entity declarations are not supported.');
  if (text.length > 2 * 1024 * 1024) throw new Error('Sitemap exceeds 2 MiB.');
  const dom = new JSDOM(text, { contentType: 'text/xml' });
  try {
    const root = dom.window.document.documentElement;
    if (!['sitemapindex', 'urlset'].includes(root.localName)) throw new Error('Expected a sitemapindex or urlset XML document.');
    const kind = root.localName === 'sitemapindex' ? 'index' : 'urlset';
    const children: string[] = [], urls: SitemapEntry[] = [];
    for (const el of Array.from(root.children).slice(0, 10001)) {
      const get = (name: string) => Array.from(el.children).find(c => c.localName === name)?.textContent?.trim() ?? '';
      const loc = get('loc'); if (!loc || loc.length > 8192) continue;
      let url: string; try { url = httpURL(loc, source); } catch { continue; }
      if (new URL(url).origin !== new URL(source).origin) continue;
      if (kind === 'index') children.push(url);
      else urls.push({ url, sitemap: source, lastmod: get('lastmod').slice(0, 100), changefreq: get('changefreq').slice(0, 40), priority: get('priority').slice(0, 20) });
    }
    return { kind, children, urls };
  } finally { dom.window.close(); }
}
export async function discoverSitemaps(origin: string, seeds: string[], fetcher: (url: string) => Promise<{ text: string; status: number; url: string }>, signal: AbortSignal): Promise<SitemapInventory> {
  const queue = [...new Set([...seeds, new URL('/sitemap.xml', origin).href])];
  const visited = new Set<string>(), seen = new Set<string>(); let inventoryBytes = 0;
  const result: SitemapInventory = { files: [], urls: [], truncated: false };
  for (let i = 0; i < queue.length && !signal.aborted; i++) {
    if (visited.size >= 16 || result.urls.length >= 10000) { result.truncated = true; break; }
    let url: string; try { url = httpURL(queue[i]!); } catch { continue; }
    if (new URL(url).origin !== origin || visited.has(url)) continue;
    visited.add(url);
    const entry: SitemapFile = { url, status: null, kind: 'unknown', urls: 0 }; result.files.push(entry);
    try {
      const response = await fetcher(url); entry.status = response.status;
      if (response.status >= 400) throw new Error(`Sitemap returned HTTP ${response.status}.`);
      const parsed = parseSitemap(response.text, response.url); entry.kind = parsed.kind;
      if (parsed.children.length > 32) result.truncated = true;
      for (const child of parsed.children.slice(0, 32)) if (!visited.has(child) && queue.length < 100) queue.push(child);
      for (const candidate of parsed.urls) {
        if (seen.has(candidate.url)) continue;
        if (result.urls.length >= 10000) { result.truncated = true; break; }
        const size = Buffer.byteLength(JSON.stringify(candidate));
        if (inventoryBytes + size > 4 * 1024 * 1024) { result.truncated = true; return result; }
        inventoryBytes += size; seen.add(candidate.url); result.urls.push(candidate); entry.urls++;
      }
    } catch (error) { entry.error = (error instanceof Error ? error.message : String(error)).slice(0, 500); }
  }
  return result;
}
