// Centralizes URL normalization, identity, scope checks, and tracking-parameter handling.

/** Legacy exercise helper. Do not use this lossy representation as a crawl key. */
export function normalizeURL(input: string): string {
  const url = new URL(input);
  const key = `${url.hostname}${url.pathname}`;
  return key.endsWith('/') ? key.slice(0, -1) : key;
}
export function httpURL(input: string, base?: string, stripTracking = false): string {
  const url = base === undefined ? new URL(input) : new URL(input, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not accepted.');
  url.hash = '';
  if (stripTracking) {
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
    }
  }
  // Keep path case, query order/repetition, ports and trailing slashes: these can be meaningful.
  return url.href;
}
export function safeHTTP(input: string, base?: string): string | undefined {
  try { return httpURL(input, base); } catch { return undefined; }
}
export function isInScope(input: string, origin: string, pathPrefix = ''): boolean {
  const url = new URL(input);
  if (url.origin !== origin) return false;
  if (!pathPrefix || pathPrefix === '/') return true;
  const prefix = pathPrefix.replace(/\/$/, '');
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
}
