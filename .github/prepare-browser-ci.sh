#!/usr/bin/env bash
# CI-only preparation for sandboxed Chromium on disposable GitHub-hosted Linux runners.
# Allows namespaces for the exact installed browser executables, never globally.
# The application installer does not invoke this administrative script.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]] || {
  echo 'This script is for the disposable GitHub Linux test runner only.' >&2; exit 1;
}
if [[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == 1 ]]; then
  python3 - <<'PY'
import os
from pathlib import Path
root = Path.home() / '.cache/ms-playwright'
binaries = sorted(p.resolve() for p in root.rglob('*') if p.name in {'chrome', 'chrome-headless-shell'} and p.is_file() and os.access(p, os.X_OK))
assert binaries, 'No installed Chromium executables found'
entries = ['abi <abi/4.0>,', 'include <tunables/global>']
for i, binary in enumerate(binaries):
    assert binary.is_relative_to(root.resolve()) and '"' not in str(binary)
    entries.append(f'profile web-crawler-ci-{i} "{binary}" flags=(unconfined) {{ userns, }}')
Path(os.environ['RUNNER_TEMP'], 'crawler-chromium.apparmor').write_text('\n'.join(entries) + '\n')
PY
  sudo apparmor_parser -r "$RUNNER_TEMP/crawler-chromium.apparmor"
fi
node --input-type=module - <<'JS'
import { chromium } from 'playwright';
for (const executablePath of [undefined, chromium.executablePath()]) {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath });
  await browser.close();
}
console.log('Default and full Chromium start with their sandbox enabled.');
JS
