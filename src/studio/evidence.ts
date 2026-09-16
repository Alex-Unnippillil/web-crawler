/** Local rendering evidence is separate from hot crawl JSON to bound polling and RAM.
 * Only opaque SHA-256 identifiers are accepted; remote HTML is returned as text data.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserEvidence } from '../inspection-types.js';

const MAX_PAGE = 8 * 1024 * 1024;
const MAX_RUN = 128 * 1024 * 1024;
export class EvidenceStore {
  private used = 0;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  async save(url: string, evidence: BrowserEvidence): Promise<string> {
    const id = createHash('sha256').update(url).digest('hex');
    const data = JSON.stringify(evidence);
    const bytes = Buffer.byteLength(data);
    if (bytes > MAX_PAGE) throw new Error('Rendering evidence exceeds the 8 MiB per-page storage budget.');
    // Reserve before an await so concurrent renders cannot overrun the run budget.
    if (this.used + bytes > MAX_RUN) throw new Error('Rendering evidence storage reached 128 MiB; existing evidence is retained.');
    this.used += bytes;
    const work = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const path = join(this.directory, `${id}.json`);
      await writeFile(`${path}.tmp`, data, { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    });
    this.pending = work.catch(() => {});
    await work;
    return id;
  }
  async read(id: string): Promise<BrowserEvidence> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Rendering evidence not found.');
    const path = join(this.directory, `${id}.json`);
    if ((await stat(path)).size > MAX_PAGE) throw new Error('Rendering evidence exceeds the read limit.');
    return JSON.parse(await readFile(path, 'utf8')) as BrowserEvidence;
  }
  async close(): Promise<void> { await this.pending; }
  async delete(): Promise<void> { await this.close(); await rm(this.directory, { recursive: true, force: true }); }
}
