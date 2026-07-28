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

function boot(options = 'S') {
  const fixtureOptions = typeof options === 'string' ? { selected: options } : options;
  const window = bootSection('product.liquid', productSection(fixtureOptions));
  const root = window.document.querySelector('[data-product]');
  return {
    window,
    root,
    select: root.querySelector('[data-variant-select]'),
    addButton: root.querySelector('[data-add-button]'),
    choose(value, position = 1) {
      const group = root.querySelector(`[data-option-position="${position}"]`);
      const input = group.querySelector(`[data-option-input][value="${value}"]`);
      input.checked = true;
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  };
}

const contextualOptions = {
  options: [
    { values: ['Red', 'Blue'], selected: 'Red' },
    { values: ['Small', 'Large'], selected: 'Small' }
  ],
  variants: [
    { id: 21, options: ['Red', 'Small'], available: true, price: '$21' },
    { id: 22, options: ['Red', 'Large'], available: false, price: '$22' },
    { id: 23, options: ['Blue', 'Small'], available: false, price: '$23' },
    { id: 24, options: ['Blue', 'Large'], available: true, price: '$24' }
  ]
};

test('a valid option combination resolves to its variant id', () => {
  const { select } = boot('S');
  assert.equal(select.value, '11');
});

test('an unavailable option stays visible but disabled', () => {
  const product = boot('S');
  const unavailable = product.root.querySelector('[data-option-input][value="L"]');
  const status = unavailable.closest('.product__swatch').querySelector('[data-option-unavailable]');

  assert.equal(unavailable.disabled, true);
  assert.equal(unavailable.closest('.product__swatch').classList.contains('is-disabled'), true);
  assert.equal(status.hidden, false);
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

test('availability follows preceding option values and ignores later ones', () => {
  const product = boot({ variantConfig: contextualOptions });
  const blue = product.root.querySelector('[data-option-position="1"] [value="Blue"]');
  const small = product.root.querySelector('[data-option-position="2"] [value="Small"]');
  const large = product.root.querySelector('[data-option-position="2"] [value="Large"]');

  assert.equal(
    blue.disabled,
    false,
    'Blue has an available Large variant even though the currently selected Small is sold out'
  );
  assert.equal(small.disabled, false);
  assert.equal(large.disabled, true, 'Red / Large is sold out');

  product.choose('Blue', 1);

  assert.equal(small.disabled, true, 'Blue / Small is sold out');
  assert.equal(large.disabled, false, 'Blue / Large is available');
  assert.equal(product.select.value, '23');
  assert.equal(product.addButton.disabled, true);
  assert.equal(product.addButton.textContent, 'Sold out');

  product.choose('Large', 2);

  assert.equal(product.select.value, '24');
  assert.equal(product.addButton.disabled, false);
  assert.equal(product.addButton.textContent, 'Add to cart');
});
