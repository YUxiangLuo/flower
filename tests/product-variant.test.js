'use strict';

/* Replaces the former static assertion that sections/product.liquid contains
   the literal `select.value = '';`. That check passed whenever the text was
   present anywhere in the file — including inside a comment — so it could not
   tell a working guard from a removed one. These tests drive the option inputs
   and assert what the guard exists to guarantee: an option combination with no
   matching variant must not leave a purchasable variant id in the form. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection } = require('./helpers/section.js');
const { productSection } = require('./helpers/fixtures.js');

function boot(selected = 'S') {
  const window = bootSection('product.liquid', productSection({ selected }));
  const root = window.document.querySelector('[data-product]');
  return {
    window,
    root,
    select: root.querySelector('[data-variant-select]'),
    addButton: root.querySelector('[data-add-button]'),
    choose(value) {
      const input = root.querySelector(`[data-option-input][value="${value}"]`);
      input.checked = true;
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  };
}

test('a valid option combination resolves to its variant id', () => {
  const { select } = boot('S');
  assert.equal(select.value, '11');
});

test('an option combination with no variant clears the stale variant id', () => {
  const product = boot('S');
  assert.equal(product.select.value, '11', 'precondition: starts on a real variant');

  product.choose('L'); // no variant carries option L

  assert.equal(
    product.select.value,
    '',
    'a stale id here would let accelerated checkout buy the previous variant'
  );
});

test('an unmatched combination disables add to cart', () => {
  const product = boot('S');
  product.choose('L');

  assert.equal(product.addButton.disabled, true);
  assert.equal(product.addButton.textContent, 'Unavailable');
});

test('returning to a valid combination restores the variant id', () => {
  const product = boot('S');
  product.choose('L');
  product.choose('M');

  assert.equal(product.select.value, '12');
  assert.equal(product.addButton.disabled, false);
  assert.equal(product.addButton.textContent, 'Add to cart');
});

test('an unmatched combination drops ?variant= from the address bar', () => {
  const product = boot('S');
  product.choose('M');
  assert.equal(
    new URL(product.window.location.href).searchParams.get('variant'),
    '12',
    'precondition: a valid pick writes the variant into the URL'
  );

  product.choose('L');

  assert.equal(new URL(product.window.location.href).searchParams.get('variant'), null);
});
