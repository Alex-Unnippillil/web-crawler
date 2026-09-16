/** Emit the small browser modules without a runtime framework or a CDN dependency.
 * Syntax stripping is paired with the mandatory semantic TypeScript check.
 */
import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
const sourceRoot = new URL('../ui/', import.meta.url);
const outputRoot = new URL('../ui-dist/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
for (const name of await readdir(sourceRoot)) {
  if (!name.endsWith('.ts')) continue;
  const source = await readFile(new URL(name, sourceRoot), 'utf8');
  const output = stripTypeScriptTypes(source, { mode: 'strip' });
  await writeFile(new URL(name.replace(/\.ts$/, '.js'), outputRoot), output);
}
console.log('Built the TypeScript browser interface and visual explorer modules.');
