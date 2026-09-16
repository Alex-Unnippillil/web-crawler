import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) { console.error('Web Crawler Studio needs Node.js 24 or newer. Install the LTS release from https://nodejs.org, or use a portable download from GitHub Releases.'); process.exit(1); }
const portable = existsSync(resolve(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'));
function run(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!portable) {
  const hash = createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
  const marker = resolve(root, 'node_modules', '.crawler-install');
  if (!existsSync(marker) || readFileSync(marker, 'utf8') !== hash || !existsSync('node_modules/typescript')) {
    console.log('\nFirst-time setup: installing the locked project dependencies. Internet access is required.\n');
    run(['ci']); writeFileSync(marker, hash);
  }
  run(['run', 'build']);
}
const server = resolve(root, 'dist/studio/server.js');
if (!existsSync(server)) { console.error('Application files are missing. Extract the entire ZIP, then run the launcher again.'); process.exit(1); }
const child = spawn(process.execPath, [server, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => { if (process.platform !== 'win32') child.kill('SIGINT'); });
process.on('SIGTERM', () => child.kill('SIGTERM'));
