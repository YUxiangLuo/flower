'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const themeRoot = path.join(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(themeRoot, relativePath), 'utf8');
}

function parseThemeJson(relativePath) {
  return JSON.parse(source(relativePath).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
}

function parseSectionSchema(relativePath) {
  const match = source(relativePath).match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/);
  assert.ok(match, `${relativePath} has no schema`);
  return JSON.parse(match[1]);
}

test('the homepage and new hero sections default to manual navigation', () => {
  const homepage = parseThemeJson('templates/index.json');
  const schema = parseSectionSchema('sections/hero.liquid');
  const autoplay = schema.settings.find((setting) => setting.id === 'autoplay');

  assert.equal(homepage.sections.banner.settings.autoplay, false);
  assert.equal(autoplay.default, false);
});

test('collection and search counts expose singular and plural forms in every locale', () => {
  ['en.default.json', 'de.json', 'es.json', 'fr.json', 'it.json'].forEach((filename) => {
    const locale = parseThemeJson(`locales/${filename}`);

    assert.deepEqual(Object.keys(locale.collection.products_count).sort(), ['one', 'other']);
    assert.deepEqual(Object.keys(locale.search.results_for_html).sort(), ['one', 'other']);
    assert.match(locale.collection.products_count.one, /{{\s*count\s*}}/);
    assert.match(locale.search.results_for_html.one, /{{\s*count\s*}}/);
    assert.match(locale.search.results_for_html.one, /{{\s*terms\s*}}/);
  });
});

test('gift-card expiry dates use Shopify locale-aware formatting', () => {
  const giftCard = source('templates/gift_card.liquid');

  assert.match(giftCard, /gift_card\.expires_on\s*\|\s*time_tag:\s*format:\s*'date'/);
  assert.doesNotMatch(giftCard, /gift_card\.expires_on\s*\|\s*date:\s*'%B/);
});

test('legacy storefront links are replaced with locale-aware resource URLs', () => {
  const hero = source('sections/hero.liquid');
  const giftCta = source('sections/gift-cta.liquid');
  const product = source('sections/product.liquid');

  [hero, giftCta].forEach((section) => {
    assert.match(section, /routes\.all_products_collection_url/);
    assert.match(section, /remove_first:\s*all_products_path/);
  });
  assert.match(
    product,
    /replace:\s*'href="\/policies\/shipping-policy"',\s*shipping_policy_href/
  );
  assert.doesNotMatch(
    product,
    /replace:\s*'\/policies\/shipping-policy',/
  );
});

test('both cart views separate subtotal, discounts and final total', () => {
  ['sections/cart.liquid', 'sections/cart-drawer.liquid'].forEach((relativePath) => {
    const cart = source(relativePath);

    assert.match(cart, /cart\.items_subtotal_price\s*\|\s*money/);
    assert.match(cart, /item\.line_level_discount_allocations/);
    assert.match(cart, /cart\.cart_level_discount_applications/);
    assert.match(cart, /discount_application\.total_allocated_amount\s*\|\s*money/);
    assert.match(cart, /cart\.total_price\s*\|\s*money/);
  });
});
