#!/usr/bin/env bash

set -euo pipefail

theme_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$theme_root"

failed=0

report_failure() {
  printf 'Static check failed: %s\n' "$1" >&2
  failed=1
}

if rg -n --glob '*.liquid' "default: '#'|href=\"#\"" .; then
  report_failure "Liquid must not emit placeholder hash links."
fi

if rg -n --pcre2 "\{%\s*form\s+'customer'(?![^%]*\bid:)" sections; then
  report_failure "Every customer form must declare a unique id."
fi

if rg -n '"quote"\s*:' templates; then
  report_failure "Customer review fixtures must not be committed in JSON templates."
fi

structured_data_count="$(
  rg -o 'product\s*\|\s*structured_data' layout sections snippets templates \
    | wc -l \
    | tr -d '[:space:]'
)"
if [[ "$structured_data_count" != "1" ]]; then
  report_failure "Product structured data must be emitted exactly once."
fi

for snippet in snippets/*.liquid; do
  if ! rg -q '\A\{%\s+doc\s+%\}' "$snippet"; then
    report_failure "$snippet must start with a LiquidDoc header."
  fi
done

if ! rg -q 'id="MainContent"' layout/theme.liquid; then
  report_failure "The main layout must expose the skip-link target."
fi

if ! rg -q "select\.value = '';" sections/product.liquid; then
  report_failure "Invalid option combinations must clear the stale variant id."
fi

if ! rg -q -U 'initGallery\(root\);\s+initBuyBox\(root\);' sections/product.liquid; then
  report_failure "The product gallery must initialize before the buy box."
fi

if ! rg -q "event\.target\.matches\('\[data-auto-submit\]'\)" sections/collection.liquid; then
  report_failure "Collection filters must not auto-submit on every field change."
fi

if (( failed != 0 )); then
  exit 1
fi

printf 'Static theme checks passed.\n'
