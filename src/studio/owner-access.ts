/** Owner-issued Vercel automation credentials: exact HTTPS origin, memory only, one-hour TTL.
 * This is documented authentication, not challenge solving. Nothing creates tokens or modifies a firewall.
 */
import { describeError } from '../crawler/diagnostics.js';
import { httpURL } from '../url.js';
const HEADER = 'x-vercel-protection-bypass';
export class OwnerAccess {
  private secret = '';
  private origin = '';
  private expires = 0;
  configure(value: unknown): void {
    if (!value || typeof value !== 'object') throw new Error('Provide an HTTPS origin and an owner-issued automation secret.');
    const { origin, token } = value as Record<string, unknown>;
    httpURL(String(origin ?? ''));
    const parsed = new URL(String(origin));
    if (parsed.protocol !== 'https:' || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Owner access requires an exact HTTPS origin without a path, port, query, or credentials.');
    if (typeof token !== 'string' || !/^[\x21-\x7e]{16,1024}$/.test(token)) throw new Error('Enter a valid owner-issued secret (16–1024 characters, no whitespace).');
    this.origin = parsed.origin; this.secret = token; this.expires = Date.now() + 3600000;
  }
  clear(): void { this.secret = ''; this.origin = ''; this.expires = 0; }
  state(): { configured: boolean; origin: string; expiresAt: string | null } {
    if (this.expires <= Date.now()) this.clear();
    return { configured: !!this.secret, origin: this.origin, expiresAt: this.secret ? new Date(this.expires).toISOString() : null };
  }
  wrap(transport: typeof fetch): typeof fetch {
    return async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const state = this.state(); const secret = state.configured ? this.secret : '';
      const headers = new Headers(init.headers);
      // Do not trust a caller-supplied credential or forward it to a redirected host/CDN.
      headers.delete(HEADER);
      if (secret && url.origin === state.origin) headers.set(HEADER, secret);
      try {
        const response = await transport(input, { ...init, headers, redirect: 'manual' });
        if (!secret) return response;
        const clean = (value: string) => value.split(secret).join('[redacted]');
        const safeHeaders = new Headers(); response.headers.forEach((value, key) => safeHeaders.set(key, clean(value)));
        safeHeaders.delete(HEADER);
        if (!response.body) return new Response(null, { status: response.status, statusText: clean(response.statusText), headers: safeHeaders });
        safeHeaders.delete('content-length');
        // Redact literal reflections even across chunks BEFORE parsing, storage or browser execution.
        const needle = Buffer.from(secret), replacement = Buffer.from('[redacted]'); let pending = Buffer.alloc(0);
        const stream = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            pending = Buffer.concat([pending, chunk]);
            const parts: Buffer[] = []; let start = 0, position: number;
            // Find matches once; repeated buffer replacement would be quadratic on hostile reflected bodies.
            while ((position = pending.indexOf(needle, start)) >= 0) {
              parts.push(pending.subarray(start, position), replacement); start = position + needle.length;
            }
            const safe = Math.max(start, pending.length - needle.length + 1);
            if (safe > start) parts.push(pending.subarray(start, safe));
            if (parts.length) controller.enqueue(Buffer.concat(parts));
            pending = pending.subarray(safe);
          },
          flush(controller) { if (pending.length) controller.enqueue(pending); }
        });
        return new Response(response.body.pipeThrough(stream), { status: response.status, statusText: clean(response.statusText), headers: safeHeaders });
      } catch (error) {
        // Never serialize transport errors containing a credential. Retain safe network codes.
        const message = describeError(error);
        const safe = new Error(secret ? message.split(secret).join('[redacted]') : message);
        if (error && typeof error === 'object' && 'code' in error) Object.assign(safe, { code: String(error.code) });
        throw safe;
      }
    };
  }
}
