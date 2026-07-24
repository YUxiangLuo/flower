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
- **Shop by occasion** – occasion-based entry cards
- **Featured products**, **testimonials**, **gallery**, **creator story**
- **Product page** – media gallery, variant picker, highlights, collapsible details
- **Collection** – facet filters and sorting
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

Run the same checks used in CI before opening a pull request:

```bash
bash scripts/check-theme.sh
```

This runs Shopify Theme Check and the repository's static regression checks. The GitHub Actions workflow pins Shopify CLI to `4.5.2` for reproducible results.

## License

Flower builds on Shopify's Online Store 2.0 starter foundation. It is released under the [license](./LICENSE.md) in this repository; Shopify theme use terms apply.
