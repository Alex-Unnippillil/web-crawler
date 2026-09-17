/** Classify explicit access challenges without solving them or guessing from HTTP 429 alone. */
export interface AccessProblem { kind: string; provider?: string; message: string; guidance: string }
export function challenge(headers: Headers, status: number, sample = ''): AccessProblem | undefined {
  const vercel = headers.get('x-vercel-mitigated') === 'challenge' ||
    ([403, 429, 503].includes(status) && /<title[^>]*>\s*Vercel Security Checkpoint\s*<\/title>/i.test(sample));
  const cloudflare = headers.get('cf-mitigated') === 'challenge';
  if (!vercel && !cloudflare) return;
  const provider = vercel ? 'Vercel' : 'Cloudflare';
  return { kind: 'access-challenge', provider, message: `${provider} requires site-owner authorization (HTTP ${status}). This is a security checkpoint, not a crawlable page.`,
    guidance: vercel ? 'For your own Vercel deployment, configure an owner-issued Protection Bypass for Automation secret in Owner access, or review the blocked request in the project Firewall. Custom deny rules may need a separate, narrowly scoped owner-approved exception.' : 'Review the blocked request in the site owner’s Firewall and allow only your authorized testing traffic. Changing crawl mode does not grant access.' };
}
/** Only a www/apex transition or HTTP→HTTPS upgrade at standard ports can establish the entry origin. */
export function canonicalTransition(from: string, to: string): boolean {
  try {
    const a = new URL(from), b = new URL(to);
    if (a.username || a.password || b.username || b.password || !['http:', 'https:'].includes(b.protocol)) return false;
    if (a.protocol === 'https:' && b.protocol !== 'https:') return false;
    if (a.port || b.port) return a.origin === b.origin;
    const host = (x: URL) => x.hostname.toLowerCase().replace(/^www\./, '');
    return host(a) === host(b) && (a.hostname === b.hostname || a.hostname === `www.${b.hostname}` || b.hostname === `www.${a.hostname}`);
  } catch { return false; }
}
export function diagnosticKind(message: string): string {
  if (/ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) return 'dns';
  if (/CERT_|CERTIFICATE|TLS|SSL|SELF_SIGNED/i.test(message)) return 'tls';
  if (/ECONNREFUSED/.test(message)) return 'connection-refused';
  if (/ENETUNREACH|EHOSTUNREACH/.test(message)) return 'unreachable';
  if (/ETIMEDOUT|timed out/i.test(message)) return 'timeout';
  return 'network';
}
export function redactMessage(message: string): string {
  return message.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@').slice(0, 3000);
}

/** Bounded recursion retains native aggregate connection failures without serializing raw objects. */
export function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error).slice(0, 3000);
  const code = 'code' in error ? ` [${String(error.code)}]` : '';
  const nested = depth < 3 ? [...(error.cause ? [error.cause] : []), ...(error instanceof AggregateError ? error.errors.slice(0, 4) : [])].map(e => describeError(e, depth + 1)).join('; ') : '';
  return redactMessage(`${error.message}${code}${nested ? '; ' + nested : ''}`);
}
