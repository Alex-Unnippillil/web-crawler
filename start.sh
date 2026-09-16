#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ -f runtime/node ]]; then
  chmod u+x runtime/node
  exec runtime/node scripts/launch.mjs "$@"
fi
# Finder and non-interactive shells may not initialize nvm.
if ! command -v node >/dev/null 2>&1 && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  printf '\nInstall Node.js 24 LTS from https://nodejs.org, or use a portable release.\n'
  read -r -p 'Press Enter to close…' _
  exit 1
fi
exec node scripts/launch.mjs "$@"
