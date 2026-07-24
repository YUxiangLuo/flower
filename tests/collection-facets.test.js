'use strict';

/* Replaces the former static assertion that sections/collection.liquid contains
   the literal `event.target.matches('[data-auto-submit]')`. That text could sit
   in a comment, or in a handler that never runs, and the check would still pass.

   The rule it stood for: a change on an opted-in control submits the facet form,
   and a change on anything else does not — typing in the price field must not
   reload the page on every keystroke. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection } = require('./helpers/section.js');
const { collectionSection } = require('./helpers/fixtures.js');

function boot() {
  const window = bootSection('collection.liquid', collectionSection());
  const form = window.document.querySelector('.facets__form');

  /* Catch the submit on the way down so the section's own handler — which ends
     in a full page load — never runs. What is under test is whether a submit
     was requested at all. */
  const submits = [];
  window.document.addEventListener(
    'submit',
    (event) => {
      submits.push(event.target);
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  return {
    window,
    form,
    submits,
    change(selector) {
      const field = form.querySelector(selector);
      field.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  };
}

test('changing a control marked data-auto-submit submits the facet form', () => {
  const facets = boot();

  facets.change('[name="sort_by"]');

  assert.equal(facets.submits.length, 1);
  assert.equal(facets.submits[0], facets.form);
});

test('a checkbox filter marked data-auto-submit submits the facet form', () => {
  const facets = boot();

  facets.change('[name="filter.p.vendor"]');

  assert.equal(facets.submits.length, 1);
});

test('changing the price field does not submit the form', () => {
  const facets = boot();

  facets.change('.facet__price input');

  assert.equal(
    facets.submits.length,
    0,
    'the price field would reload the page while the customer is still typing'
  );
});

test('every facet form on the page is wired, not just the first', () => {
  const window = bootSection(
    'collection.liquid',
    `<div class="shopify-section">${collectionSection()}</div>
     <div class="shopify-section">${collectionSection()}</div>`
  );

  const submits = [];
  window.document.addEventListener(
    'submit',
    (event) => {
      submits.push(event.target);
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  const forms = window.document.querySelectorAll('.facets__form');
  assert.equal(forms.length, 2, 'fixture should render two facet forms');

  forms[1].querySelector('[name="sort_by"]').dispatchEvent(
    new window.Event('change', { bubbles: true })
  );

  assert.equal(submits.length, 1, 'the second facet form never got wired up');
  assert.equal(submits[0], forms[1]);
});
