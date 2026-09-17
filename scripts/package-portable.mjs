// Repository note: Assembles portable application ZIPs with an official Node.js runtime.
// Produces self-contained portable archives with a bundled official Node.js runtime.

/** Build a redistributable ZIP with a verified official Node runtime.
 * Run on Linux CI after npm run check. No credentials or crawl data are copied.
 */
import { cp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const platform = process.argv[2] ?? 'linux-x64';
if (!['win-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'].includes(platform)) throw new Error('Unknown package platform.');
const root = resolve('.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const name = `Web-Crawler-Studio-${pkg.version}-${platform}`;
const work = join(root, 'release', name);
await rm(work, { recursive: true, force: true }); await mkdir(join(work, 'runtime'), { recursive: true });
for (const path of ['dist', 'ui', 'ui-dist', 'scripts/launch.mjs', 'Start Web Crawler.cmd', 'Start Web Crawler.command', 'start.sh', 'Install Browser.cmd', 'install-browser.sh', 'README.md', 'LICENSE', 'SECURITY.md', 'CHANGELOG.md', 'docs', 'package.json', 'package-lock.json']) {
  await mkdir(dirname(join(work, path)), { recursive: true });
  await cp(join(root, path), join(work, path), { recursive: true });
}
execFileSync('npm', ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: work, stdio: 'inherit' });
const version = process.version;
if (Number(version.split('.')[0].slice(1)) !== 24) throw new Error('Use Node 24 LTS to build portable releases.');
const archive = `node-${version}-${platform}.${platform.startsWith('win') ? 'zip' : 'tar.gz'}`;
const base = `https://nodejs.org/dist/${version}/`;
async function get(url) { const response = await fetch(url, { signal: AbortSignal.timeout(120000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response; }
const sums = await (await get(base + 'SHASUMS256.txt')).text();
const expected = sums.split('\n').find(line => line.trim().endsWith(`  ${archive}`))?.split(/\s+/)[0];
if (!expected) throw new Error('Runtime is not listed in the official checksum manifest.');
const bytes = Buffer.from(await (await get(base + archive)).arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Official runtime checksum mismatch.');
const archivePath = join(root, 'release', archive); await writeFile(archivePath, bytes);
const extracted = join(root, 'release', `runtime-${platform}`); await mkdir(extracted, { recursive: true });
if (platform.startsWith('win')) execFileSync('python3', ['-m', 'zipfile', '-e', archivePath, extracted]);
else execFileSync('tar', ['-xzf', archivePath, '-C', extracted]);
const runtimeRoot = join(extracted, `node-${version}-${platform}`);
await cp(join(runtimeRoot, platform.startsWith('win') ? 'node.exe' : 'bin/node'), join(work, 'runtime', platform.startsWith('win') ? 'node.exe' : 'node'));
await cp(join(runtimeRoot, 'LICENSE'), join(work, 'runtime', 'NODE-LICENSE.txt'));
await writeFile(join(work, 'runtime', 'RUNTIME.txt'), `Official Node.js ${version}\nPlatform: ${platform}\nSource: ${base + archive}\nSHA-256: ${expected}\nVerified against the official HTTPS checksum manifest.\n`);
await writeFile(join(work, 'START HERE.txt'), `WEB CRAWLER STUDIO ${pkg.version}\n\nExtract the entire ZIP before launching.\n\nWindows: double-click Start Web Crawler.cmd\nmacOS: double-click Start Web Crawler.command\nLinux: run bash start.sh\n\nThis package includes Node.js; no separate Node or npm installation is needed.\nThe app opens http://localhost:4310 in your browser. Keep its terminal open.\nOn Home, open Explore sample sites and choose Explore visual demo to try
the spiderweb and image galleries locally. Use Examples when a run is open.\nFor JavaScript sites: run Install Browser.cmd (Windows) or bash install-browser.sh\nonce to download matching Chromium. This is optional; Fast HTTP needs no browser.\nAfter installation choose Recheck installation, then Examples > Try hybrid lab.\n\nThese community builds are unsigned. Verify the release checksum and review\nthe source before opening. Follow your organization's security policy.\nSee README.md for usage, troubleshooting and limitations.\n`);
const zip = join(root, 'release', `${name}.zip`);
execFileSync('python3', ['-c', `import pathlib,zipfile,sys\nr=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])\nwith zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:\n for p in sorted(r.rglob('*')):\n  if p.is_file(): z.write(p,pathlib.Path(r.name)/p.relative_to(r))\n`, work, zip]);
const digest = createHash('sha256').update(await readFile(zip)).digest('hex');
await writeFile(`${zip}.sha256`, `${digest}  ${name}.zip\n`);
console.log(`Packaged ${zip} (${Math.round((await stat(zip)).size / 1024 / 1024)} MB)`);
