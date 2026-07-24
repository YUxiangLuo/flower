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

# Runtime behaviour is not checked here. Assertions that grep for a specific
# source expression pass when the text survives in a comment and fail when a
# variable is renamed, so they report on how a fix was written rather than on
# what it guarantees. Those rules live in tests/ instead:
#
#   invalid option combinations clear the variant id  -> tests/product-variant.test.js
#   the gallery initializes before the buy box        -> tests/product-init.test.js
#   only [data-auto-submit] controls submit a facet   -> tests/collection-facets.test.js
#   the cart survives a section swap mid-request      -> tests/cart-lifecycle.test.js

if (( failed != 0 )); then
  exit 1
fi

printf 'Static theme checks passed.\n'
