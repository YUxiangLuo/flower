<h1 align="center">Flower</h1>

<p align="center">
  A Shopify theme for pressed-flower keepsakes, by
  <a href="https://vesein.dev">vesein.dev</a>.
  Built on Online Store 2.0 with modular sections, warm sunflower-inspired styling,
  and Shopify's recommended architecture.
</p>

<p align="center">
  <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-see%20LICENSE.md-green.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/author-vesein.dev-informational.svg" alt="Author">
</p>

## Theme info

| Field | Value |
|-------|--------|
| Name | Flower |
| Version | 1.0.0 |
| Author | [vesein.dev](https://vesein.dev) |
| Docs / support | [vesein.dev](https://vesein.dev) |

Defined in `config/settings_schema.json` under `theme_info`.

## Getting started

### Prerequisites

- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) – download, upload, and preview themes
- Optional (VS Code): [Shopify Liquid extension](https://shopify.dev/docs/storefronts/themes/tools/shopify-liquid-vscode) – highlighting, linting, and docs

### Clone

```bash
git clone git@github.com:YUxiangLuo/flower.git
cd flower
```

### Preview

```bash
shopify theme dev
```

## What's included

Homepage and storefront modules tailored to a handmade keepsake brand:

- **Hero carousel** – full-bleed autoplay slides
- **Header** – nested drop-down menus, an expanding search field, and a language switcher
- **Shop by occasion** – occasion-based entry cards
- **Featured products**, **testimonials**, **gallery**, **creator story**
- **Product page** – media gallery, variant picker, highlights, collapsible details
- **Cart drawer** – adds from the product page over AJAX and opens in place
- **Collection** – a curated sort control that applies on change
- **Theme and app blocks** – flexible content and app-host sections
- Cart, search, blog, article, collections list, and 404 – styled to match

Design tokens (cream paper background, serif headings, gold accent) live in `snippets/css-variables.liquid`.

## Theme architecture

```bash
.
├── assets          # Static assets (CSS, JS, images, fonts, etc.)
├── blocks          # Reusable, nestable, customizable UI components
├── config          # Global theme settings and customization options
├── layout          # Top-level wrappers for pages (layout templates)
├── locales         # Translation files for theme internationalization
├── sections        # Modular full-width page components
├── snippets        # Reusable Liquid code or HTML fragments
└── templates       # Templates combining sections to define page structures
```

To learn more, refer to the [theme architecture documentation](https://shopify.dev/docs/storefronts/themes/architecture).

### Templates

[Templates](https://shopify.dev/docs/storefronts/themes/architecture/templates#template-types) control what's rendered on each type of page.

This theme uses [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates) so merchants can rearrange sections in the theme editor.

### Sections

[Sections](https://shopify.dev/docs/storefronts/themes/architecture/sections) are Liquid modules that merchants can customize. They may include blocks for nested content. Each section exposes settings via a `{% schema %}` tag. See the [section schema docs](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema).

### Blocks

[Blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks) break sections into smaller reusable pieces with their own settings. See the [block schema docs](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema).

## Schemas

When developing components defined by schema settings:

- **Single property settings**: map to CSS variables:

  ```liquid
  <div class="collection" style="--gap: {{ block.settings.gap }}px">
    ...
  </div>

  {% stylesheet %}
    .collection {
      gap: var(--gap);
    }
  {% endstylesheet %}

  {% schema %}
  {
    "settings": [{
      "type": "range",
      "label": "gap",
      "id": "gap",
      "min": 0,
      "max": 100,
      "unit": "px",
      "default": 0
    }]
  }
  {% endschema %}
  ```

- **Multiple property settings**: use CSS classes:

  ```liquid
  <div class="collection {{ block.settings.layout }}">
    ...
  </div>

  {% stylesheet %}
    .collection--full-width {
      /* multiple styles */
    }
    .collection--narrow {
      /* multiple styles */
    }
  {% endstylesheet %}

  {% schema %}
  {
    "settings": [{
      "type": "select",
      "id": "layout",
      "label": "layout",
      "options": [
        { "value": "collection--full-width", "label": "t:options.full" },
        { "value": "collection--narrow", "label": "t:options.narrow" }
      ]
    }]
  }
  {% endschema %}
  ```

## CSS & JavaScript

Prefer the [`{% stylesheet %}`](https://shopify.dev/docs/api/liquid/tags#stylesheet) and [`{% javascript %}`](https://shopify.dev/docs/api/liquid/tags/javascript) tags on sections, blocks, and snippets. Each file can contain at most one tag of each kind; Shopify deduplicates that file's output when the component appears more than once.

### `critical.css`

Global essentials (reset, base layout) live in `assets/critical.css` and load on every page. Component styles stay co-located with their Liquid files.

## Validation

Install the test dependencies once, then run the same checks used in CI before opening a pull request:

```bash
npm ci
bash scripts/check-theme.sh
```

This runs three things:

1. **Shopify Theme Check** — the platform's own linter.
2. **Static checks** (`scripts/theme-static-checks.sh`) — repository rules a grep can decide, such as "no placeholder `href="#"` links" and "every snippet opens with a LiquidDoc header". They apply to whole file globs, so new files are covered automatically.
3. **Regression tests** (`npm test`) — behavioural tests for section JavaScript.

The GitHub Actions workflow pins Shopify CLI to `4.5.2` for reproducible results.

### Regression tests

The theme has no build step; `package.json` exists only to carry the test suite, and everything in it is excluded from theme uploads via `.shopifyignore`.

Tests run on Node's built-in runner with [jsdom](https://github.com/jsdom/jsdom) as the only dependency:

```bash
npm test
```

Each test boots a section's `{% javascript %}` block in jsdom and drives it through real events. Shopify concatenates section JavaScript into one file that loads once per page and is *not* re-executed when a section re-renders, so the tests evaluate it once and dispatch `shopify:section:load` and `shopify:section:unload` by hand, the way the theme editor does.

Sections that talk to each other are booted together — `bootSection` takes a list — because on a real storefront they always share a page. The cart drawer, the product form, the cart page and the header only meet through three document events (`cart:refresh`, `cart:updated`, `cart:open`), and that hand-off is only observable with all of them running.

jsdom has gaps the helpers fill: `<dialog>` has no `showModal`/`close`, `matchMedia` cannot be driven, and there is no layout engine. Those stubs live in `tests/helpers/section.js` and are deliberately minimal — the focus trap, the top layer and Escape-to-close are the browser's, so nothing asserts on them.

Rules about runtime behaviour belong here rather than in the static checks. An assertion that greps for a specific source expression passes when that text survives in a comment and fails when a variable is renamed — it pins how a fix was written, not what it guarantees. Helpers live in `tests/helpers/`; `fixtures.js` carries the minimal markup each section reads, so a markup change that drops a hook surfaces as a failing test.

## License

Flower builds on Shopify's Online Store 2.0 starter foundation. It is released under the [license](./LICENSE.md) in this repository; Shopify theme use terms apply.
