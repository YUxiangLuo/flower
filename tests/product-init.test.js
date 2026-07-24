'use strict';

/* Replaces the former static assertion that the strings `initGallery(root);`
   and `initBuyBox(root);` sit textually adjacent in that order. That check
   pinned the parameter name and the spacing rather than the ordering rule, so
   a rename broke CI while the behaviour was untouched.

   The ordering matters for one concrete reason: initGallery installs
   root.selectMedia, and initBuyBox calls it during its own setup to jump the
   gallery to the pre-selected variant's featured media. Assert that outcome. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent } = require('./helpers/section.js');
const { productSection } = require('./helpers/fixtures.js');

const activeMediaId = (root) => {
  const item = root.querySelector('[data-stage-item].is-active');
  return item && item.getAttribute('data-media-id');
};

test('the gallery is ready before the buy box selects the variant media', () => {
  // Variant 12 (option M) is featured on media 2, while media 1 renders active.
  const window = bootSection('product.liquid', productSection({ selected: 'M' }));
  const root = window.document.querySelector('[data-product]');

  assert.equal(
    activeMediaId(root),
    '2',
    'the buy box ran before the gallery installed root.selectMedia'
  );
});

test('every product section on the page is initialised, not just the first', () => {
  const window = bootSection(
    'product.liquid',
    `<div class="shopify-section">${productSection({ id: 'a', selected: 'S' })}</div>
     <div class="shopify-section">${productSection({ id: 'b', selected: 'S' })}</div>`
  );

  const [first, second] = window.document.querySelectorAll('[data-product]');
  for (const [label, root] of [['first', first], ['second', second]]) {
    const input = root.querySelector('[data-option-input][value="M"]');
    input.checked = true;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.equal(
      root.querySelector('[data-variant-select]').value,
      '12',
      `the ${label} product section never got wired up`
    );
  }
});

test('re-initialising over an already-wired section does not double-bind', () => {
  const window = bootSection(
    'product.liquid',
    `<div class="shopify-section" id="sec">${productSection({ selected: 'S' })}</div>`
  );

  const root = window.document.querySelector('[data-product]');
  let changeEvents = 0;
  root.querySelector('[data-variant-select]').addEventListener('change', () => {
    changeEvents += 1;
  });

  // A load event scoped wide enough to cover an already-initialised section.
  dispatchSectionEvent(window, 'shopify:section:load', window.document.getElementById('sec'));

  const input = root.querySelector('[data-option-input][value="M"]');
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(changeEvents, 1, 'the option input fired its handler more than once');
});

test('a section re-rendered by the theme editor is wired against the fresh DOM', () => {
  const window = bootSection(
    'product.liquid',
    `<div class="shopify-section" id="sec">${productSection({ selected: 'S' })}</div>`
  );

  const section = window.document.getElementById('sec');
  section.innerHTML = productSection({ selected: 'S' });
  dispatchSectionEvent(window, 'shopify:section:load', section);

  const root = window.document.querySelector('[data-product]');
  const input = root.querySelector('[data-option-input][value="L"]');
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(root.querySelector('[data-variant-select]').value, '');
});
