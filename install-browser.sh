#!/usr/bin/env bash
# Optional Chromium download. Never run the crawler or this installer with sudo.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ -x runtime/node ]]; then NODE=./runtime/node; else NODE=node; fi
"$NODE" node_modules/playwright/cli.js install chromium
printf '\nChromium installed. Restart Studio or choose Recheck installation.\n'
