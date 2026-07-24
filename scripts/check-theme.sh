#!/usr/bin/env bash

set -euo pipefail

theme_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$theme_root"

if ! command -v shopify >/dev/null 2>&1; then
  printf 'Shopify CLI is required. Install @shopify/cli before running this check.\n' >&2
  exit 1
fi

shopify theme check --fail-level warning
bash scripts/theme-static-checks.sh
git diff --check
git diff --cached --check
