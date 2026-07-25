'use strict';

/* Covers the section-lifecycle races in the AJAX cart. The theme editor swaps
   a whole section on re-render, which can strand an in-flight request against
   a node that is no longer in the document. `replaceWith` on a detached node is
   a silent no-op, so before these guards the page could show quantities the
   server no longer held, with no error raised anywhere. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent, tick } = require('./helpers/section.js');
const { cartSection } = require('./helpers/fixtures.js');

/* A cart whose /cart/change.js response is held open until the test releases
   it, so the section can be swapped while the request is in flight. */
function bootCart({ responseDelay = 0, serverQuantity = 5 } = {}) {
  const requests = [];
  let releaseResponse;
  const requestSent = new Promise((resolve) => {
    releaseResponse = resolve;
  });

  /* The cart page reports the new item count; the header is what applies it to
     the badge. Both scripts have to be on the page for that hand-off to happen,
     which on a real storefront they always are. */
  const window = bootSection(
    ['cart.liquid', 'header.liquid'],
    `<a data-cart-link data-cart-label-one="__COUNT__ item"
        data-cart-label-other="__COUNT__ items"><sup data-cart-count>1</sup></a>
     <div class="shopify-section" id="sec">${cartSection({ quantity: 1 })}</div>`,
    {
      beforeScript(win) {
        win.fetch = (url, options) => {
          requests.push({ url, body: JSON.parse(options.body) });
          releaseResponse();
          return new Promise((resolve) => {
            win.setTimeout(() => {
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    item_count: serverQuantity,
                    sections: {
                      cart: cartSection({ quantity: serverQuantity, marker: 'from-server' })
                    }
                  })
              });
            }, responseDelay);
          });
        };
      }
    }
  );

  return { window, requests, requestSent };
}

const visibleCart = (window) => window.document.querySelector('[data-cart-section]');

const shownQuantity = (window) =>
  visibleCart(window).querySelector('[data-cart-quantity]').getAttribute('data-current-quantity');

test('a quantity change renders the cart the server returned', async () => {
  const cart = bootCart();
  const window = cart.window;

  const input = window.document.querySelector('[data-cart-quantity]');
  input.value = '5';
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  await cart.requestSent;
  await tick(window, 50);

  assert.equal(cart.requests[0].body.quantity, 5);
  assert.equal(shownQuantity(window), '5');
  assert.equal(window.document.querySelectorAll('[data-cart-section]').length, 1);
});

test('a response landing after a section swap updates the cart on screen', async () => {
  const cart = bootCart({ responseDelay: 60 });
  const window = cart.window;

  const input = window.document.querySelector('[data-cart-quantity]');
  input.value = '5';
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  await cart.requestSent;

  // The theme editor re-renders the section while the request is in flight.
  const section = window.document.getElementById('sec');
  section.innerHTML = cartSection({ quantity: 1, marker: 'editor-rerender' });
  dispatchSectionEvent(window, 'shopify:section:load', section);

  await tick(window, 200);

  assert.equal(
    shownQuantity(window),
    '5',
    'the server accepted 5; rendering into the detached node would leave 1 on screen'
  );
  assert.equal(visibleCart(window).getAttribute('data-marker'), 'from-server');
  assert.equal(window.document.querySelectorAll('[data-cart-section]').length, 1);
  assert.deepEqual(window.navigations, []);
});

test('a queued update does not reach the server after the section unloads', async () => {
  const cart = bootCart();
  const window = cart.window;

  // Submitting queues a flush on a timer rather than firing synchronously.
  const input = window.document.querySelector('[data-cart-quantity]');
  input.value = '9';
  window.document
    .querySelector('.cart__form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  const section = window.document.getElementById('sec');
  dispatchSectionEvent(window, 'shopify:section:unload', section);
  section.remove();

  await tick(window, 200);

  assert.deepEqual(
    cart.requests,
    [],
    'the queued flush wrote to a cart the customer can no longer see'
  );
  assert.deepEqual(window.navigations, [], 'a stray page load would blow away the editor preview');
});

test('the header count follows the cart the server returned', async () => {
  const cart = bootCart({ serverQuantity: 3 });
  const window = cart.window;

  const input = window.document.querySelector('[data-cart-quantity]');
  input.value = '3';
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  await cart.requestSent;
  await tick(window, 50);

  const count = window.document.querySelector('[data-cart-count]');
  assert.equal(count.textContent, '3');
  assert.equal(
    window.document.querySelector('[data-cart-link]').getAttribute('aria-label'),
    '3 items'
  );
});
