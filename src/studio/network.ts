import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable, pipeline } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

/** GUI requests are restricted to public addresses. CLI policy remains unchanged. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Permit global unicast, excluding documentation, transition and special-use ranges.
  const v = address.toLowerCase();
  return isIP(v) === 6 && /^[23][0-9a-f]{3}:/.test(v) &&
    !/^2001:(?:0{1,4}:|db8:|[01]?[0-9a-f]{1,2}:)/.test(v) && !v.startsWith('2002:') && !v.startsWith('3fff:');
}

/** Resolve and pin each request to the checked IP: no DNS-check/fetch rebinding gap. */
export const publicFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public HTTP(S) URL without credentials.');
  const signal = init.signal;
  signal?.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const abort = () => reject(signal?.reason ?? new Error('DNS lookup cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    void lookup(hostname, { all: true, verbatim: true }).then(resolve, reject)
      .finally(() => signal?.removeEventListener('abort', abort));
    if (signal?.aborted) abort();
  });
  signal?.throwIfAborted();
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) {
    throw new Error('Private, loopback and reserved network targets are blocked in the GUI. Use the built-in demo for a local test.');
  }
  const selected = addresses[0]!;
  return new Promise<Response>((resolve, reject) => {
    const headers = { ...Object.fromEntries(new Headers(init.headers).entries()), 'Accept-Encoding': 'identity' };
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', headers, agent: false,
      lookup: ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options?.all) callback(null, [selected]); else callback(null, selected.address, selected.family);
      }) as never,
    }, res => {
      const responseHeaders = new Headers();
      for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
      const status = res.statusCode ?? 502;
      if ([204, 205, 304].includes(status)) { res.resume(); resolve(new Response(null, { status, headers: responseHeaders })); }
      else {
        const encoding = responseHeaders.get('content-encoding')?.toLowerCase();
        const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : undefined;
        if (decoder) {
          responseHeaders.delete('content-length'); responseHeaders.delete('content-encoding');
          pipeline(res, decoder, error => { if (error) decoder.destroy(error); });
        }
        resolve(new Response(Readable.toWeb(decoder ?? res) as ReadableStream<Uint8Array>, { status, statusText: res.statusMessage, headers: responseHeaders }));
      }
      res.once('close', () => signal?.removeEventListener('abort', abort));
    });
    const abort = () => req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('Request cancelled.'));
    req.once('error', reject);
    req.once('close', () => signal?.removeEventListener('abort', abort));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else req.end();
  });
};
