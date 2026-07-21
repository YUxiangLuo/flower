# Contributing to Flower

Thanks for your interest in improving Flower. Bug fixes, features, and typo
corrections are all welcome, as long as you follow our
[Code of Conduct](./CODE_OF_CONDUCT.md).

If you're planning a larger change — a new section, block, or a pattern that
touches multiple files — please open an issue first so we can discuss the
approach before you invest time in it.

## Standards

- Follow the theme architecture and conventions documented in
  [`AGENTS.md`](./AGENTS.md) (sections, blocks, snippets, LiquidDoc, and schema
  practices).
- Keep component styles co-located via `{% stylesheet %}` / `{% javascript %}`;
  reserve `assets/critical.css` for global essentials.
- Route every user-facing string through translation filters and add new keys to
  `locales/en.default.json`.
- Run [Theme Check](https://shopify.dev/docs/storefronts/themes/tools/theme-check)
  (`shopify theme check`) before opening a pull request.

## Steps to contribute

1. Fork the repository: <https://github.com/YUxiangLuo/flower/fork>
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to your branch: `git push origin my-new-feature`
5. Open a pull request

## Preview locally

```bash
shopify theme dev
```

See the [README](./README.md) for prerequisites and project layout.
