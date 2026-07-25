'use strict';

/* Descends from the static assertion that sections/collection.liquid contained
   the literal `event.target.matches('[data-auto-submit]')`. That text could sit
   in a comment, or in a handler that never runs, and the check would still pass.

   The rule it stands for now: the collection bar has no apply button with
   scripting on — it exists only inside <noscript> — so changing the sort order
   has to apply it, and a change on anything else must not. A section that
   quietly stopped listening would look entirely correct on screen while the
   select did nothing at all. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent } = require('./helpers/section.js');
const { collectionSection } = require('./helpers/fixtures.js');

function boot(html = collectionSection()) {
  const window = bootSection('collection.liquid', html);

  /* Catch the submit on the way down so the browser never tries to navigate.
     What is under test is whether a submit was requested at all. */
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
    form: window.document.querySelector('.collection__form'),
    submits,
    change(selector) {
      window.document
        .querySelector(selector)
        .dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  };
}

test('changing the sort order applies it', () => {
  const collection = boot();

  collection.change('[name="sort_by"]');

  assert.equal(collection.submits.length, 1, 'the sort select did nothing');
  assert.equal(collection.submits[0], collection.form);
});

test('a change on a control that did not opt in does not apply', () => {
  const collection = boot(
    collectionSection().replace(
      '<span class="collection__count">94 products</span>',
      '<input name="unrelated">'
    )
  );

  collection.change('[name="unrelated"]');

  assert.equal(
    collection.submits.length,
    0,
    'any control on the bar could reload the page, not only the sort select'
  );
});

test('every collection bar on the page is wired, not just the first', () => {
  const collection = boot(
    `<div class="shopify-section">${collectionSection()}</div>
     <div class="shopify-section">${collectionSection()}</div>`
  );

  const forms = collection.window.document.querySelectorAll('.collection__form');
  assert.equal(forms.length, 2, 'fixture should render two collection bars');

  forms[1]
    .querySelector('[name="sort_by"]')
    .dispatchEvent(new collection.window.Event('change', { bubbles: true }));

  assert.equal(collection.submits.length, 1, 'the second bar never got wired up');
  assert.equal(collection.submits[0], forms[1]);
});

test('a re-render by the theme editor does not leave the bar applying twice', () => {
  const collection = boot();

  /* Shopify runs the concatenated section JavaScript once per page, so a second
     init pass comes from a theme-editor re-render rather than a reload. Over the
     same DOM it must not bind a second change handler. */
  dispatchSectionEvent(collection.window, 'shopify:section:load', collection.window.document.body);

  collection.change('[name="sort_by"]');

  assert.equal(collection.submits.length, 1, 'the change handler was bound twice');
});
