/** Shared bounded body reader for browser traffic. Limits apply after decompression. */
export async function boundedBytes(response: Response, limit: number, onChunk?: (bytes: number) => void): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error(`Response exceeds ${limit} bytes.`); }
  const reader = response.body?.getReader(); if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const value = await reader.read(); if (value.done) break;
      size += value.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error(`Response exceeds ${limit} bytes.`); }
      onChunk?.(value.value.byteLength);
      chunks.push(value.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
/** Header allowlist intentionally omits cookies, authorization, and request payloads. */
export function inspectHeaders(headers: Headers): Record<string, string> {
  const fields = ['content-type', 'content-length', 'content-language', 'cache-control', 'etag', 'last-modified', 'expires', 'server', 'x-powered-by', 'x-robots-tag', 'strict-transport-security', 'content-security-policy', 'referrer-policy', 'location', 'vary'];
  const result: Record<string, string> = {};
  for (const key of fields) { const value = headers.get(key); if (value !== null) result[key] = value.slice(0, 4000); }
  return result;
}
