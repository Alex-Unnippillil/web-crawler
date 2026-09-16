// Repository note: Builds browser JavaScript from the erasable TypeScript UI source.
// Converts browser TypeScript into dependency-free JavaScript after semantic checks run.

import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
// The UI uses erasable TypeScript syntax. Node emits browser JavaScript
// without depending on TypeScript's version-specific compiler API.
// Full semantic checking runs in npm run typecheck and npm run check.
const source = await readFile(new URL('../ui/app.ts', import.meta.url), 'utf8');
const output = stripTypeScriptTypes(source, { mode: 'strip' });
await mkdir(new URL('../ui-dist/', import.meta.url), { recursive: true });
await writeFile(new URL('../ui-dist/app.js', import.meta.url), output);
console.log('Built the dependency-free TypeScript browser interface.');
