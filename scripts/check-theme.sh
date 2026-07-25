#!/usr/bin/env bash

set -euo pipefail

theme_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$theme_root"

if ! command -v shopify >/dev/null 2>&1; then
  printf 'Shopify CLI is required. Install @shopify/cli before running this check.\n' >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  printf 'Test dependencies are missing. Run `npm ci` before this check.\n' >&2
  exit 1
fi

shopify theme check --fail-level warning
bash scripts/theme-static-checks.sh

# `node --test` exits 0 when it discovers no test files, so a broken glob or a
# moved directory would read as a green run. Require that tests actually ran.
test_output="$(npm test --silent)" || {
  printf '%s\n' "$test_output"
  exit 1
}
printf '%s\n' "$test_output"

# Node's test reporter colourises its summary whenever FORCE_COLOR is set, which
# most terminals and editors do. The escape codes wrap the whole line, so the
# anchored match below finds nothing and the guard misfires with "discovery is
# broken" on a run that was in fact green. CI has neither a TTY nor FORCE_COLOR,
# which is why this only ever bit locally. Strip the codes before parsing; the
# output printed above keeps its colour.
escape="$(printf '\033')"
tests_passed="$(
  printf '%s\n' "$test_output" \
    | sed "s/${escape}\[[0-9;]*m//g" \
    | sed -n 's/^[^ ]* pass \([0-9]\{1,\}\)$/\1/p' \
    | tail -1
)"
if [[ -z "$tests_passed" ]] || (( tests_passed < 1 )); then
  printf 'No regression tests ran. Test discovery is broken.\n' >&2
  exit 1
fi

git diff --check
git diff --cached --check
