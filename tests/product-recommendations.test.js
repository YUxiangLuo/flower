'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent, tick } = require('./helpers/section.js');
const { productRecommendationsSection } = require('./helpers/fixtures.js');

function resolvedResponse(html) {
  return {
    ok: true,
    text() {
      return Promise.resolve(html);
    }
  };
}

function boot(initial, response) {
  const requests = [];
  const window = bootSection('product-recommendations.liquid', initial, {
    beforeScript(win) {
      win.fetch = (url, options) => {
        requests.push({ url, options });
        return response instanceof Error
          ? Promise.reject(response)
          : Promise.resolve(resolvedResponse(response));
      };
    }
  });

  return { window, requests };
}

test('Shopify recommendations replace the collection fallback', async () => {
  const native = productRecommendationsSection({
    source: 'shopify',
    marker: 'native'
  });
  const page = boot(productRecommendationsSection(), native);

  await tick(page.window);

  const root = page.window.document.querySelector('[data-product-recommendations]');
  assert.equal(page.requests.length, 1);
  assert.match(page.requests[0].url, /product_id=42/);
  assert.match(page.requests[0].url, /intent=related/);
  assert.equal(root.getAttribute('data-recommendation-source'), 'shopify');
  assert.ok(root.querySelector('[data-recommendation-marker="native"]'));
  assert.equal(root.querySelector('[data-recommendation-marker="fallback"]'), null);
});

test('an empty native response leaves the collection fallback in place', async () => {
  const empty = productRecommendationsSection({
    source: 'none',
    marker: 'empty',
    hidden: true
  });
  const page = boot(productRecommendationsSection(), empty);

  await tick(page.window);

  const root = page.window.document.querySelector('[data-product-recommendations]');
  assert.equal(root.getAttribute('data-recommendation-source'), 'collection');
  assert.ok(root.querySelector('[data-recommendation-marker="fallback"]'));
});

test('a failed native request leaves the collection fallback in place', async () => {
  const page = boot(productRecommendationsSection(), new Error('network down'));

  await tick(page.window);

  const root = page.window.document.querySelector('[data-product-recommendations]');
  assert.equal(root.getAttribute('data-recommendation-source'), 'collection');
  assert.ok(root.querySelector('[data-recommendation-marker="fallback"]'));
});

test('native results reveal a shell that had no collection fallback', async () => {
  const initial = productRecommendationsSection({
    source: 'none',
    marker: 'empty',
    hidden: true
  });
  const native = productRecommendationsSection({
    source: 'shopify',
    marker: 'native'
  });
  const page = boot(initial, native);

  await tick(page.window);

  const root = page.window.document.querySelector('[data-product-recommendations]');
  assert.equal(root.hidden, false);
  assert.equal(root.getAttribute('data-recommendation-source'), 'shopify');
  assert.ok(root.querySelector('[data-recommendation-marker="native"]'));
});

test('re-initialising the same section does not request recommendations twice', () => {
  const page = boot(productRecommendationsSection(), productRecommendationsSection());
  const section = page.window.document.getElementById('section-related');

  dispatchSectionEvent(page.window, 'shopify:section:load', section);

  assert.equal(page.requests.length, 1);
});

test('unloading the section aborts its recommendation request', () => {
  let aborts = 0;
  const window = bootSection(
    'product-recommendations.liquid',
    productRecommendationsSection(),
    {
      beforeScript(win) {
        win.AbortController = class AbortController {
          constructor() {
            this.signal = {};
          }

          abort() {
            aborts += 1;
          }
        };
        win.fetch = () => new Promise(() => {});
      }
    }
  );

  const section = window.document.getElementById('section-related');
  dispatchSectionEvent(window, 'shopify:section:unload', section);

  assert.equal(aborts, 1);
});
