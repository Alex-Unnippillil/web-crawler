/** Version and asset regression checks run before the slower extracted-archive gates. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStudio } from '../dist/studio/server.js';

test('Studio reports the package version and serves every Observatory asset without exposing its manifest', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-distribution-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = await startStudio({ port: 0, directory });
  try {
    const origin = `http://127.0.0.1:${app.port}`;
    const html = await (await fetch(origin)).text();
    const token = /name="session-token" content="([a-f0-9]+)"/.exec(html)?.[1];
    assert.ok(token);
    const expected = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
    const response = await fetch(`${origin}/api/state`, { headers: { 'X-Crawler-Token': token } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).version, expected);
    for (const asset of ['observatory.js', 'observatory-model.js', 'accessibility.js', 'observatory.css']) {
      const result = await fetch(`${origin}/${asset}`);
      assert.equal(result.status, 200, asset);
      assert.match(result.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /text\/javascript/);
      assert.ok((await result.text()).length > 0, asset);
    }
    assert.equal((await fetch(`${origin}/package.json`)).status, 404);
  } finally { await app.close(); }
});
