'use strict';

/* The drawer, the product form, the cart page and the header are four separate
   sections that only ever meet through document events. Nothing in any one file
   shows whether that conversation actually works, so it is asserted here with
   the real scripts on one page, which is how Shopify serves them.

   The contract under test:

     cart:refresh  carries drawer HTML, or nothing when the sender has none
     cart:updated  reports the item count, and only the header acts on it
     cart:open     asks for the drawer

   The drawer swaps its contents rather than itself, because replacing an open
   <dialog> would close it in the customer's face. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent, tick } = require('./helpers/section.js');
const { cartDrawerSection, headerSection, productSection } = require('./helpers/fixtures.js');

const HEADER_LINK = `
<a data-cart-link data-cart-label-one="__COUNT__ item"
   data-cart-label-other="__COUNT__ items" href="/cart"><sup data-cart-count>1</sup></a>`;

/* A drawer plus the header that owns the cart badge. `respond` decides what the
   stubbed network returns for each request. */
function bootDrawer({ respond, html } = {}) {
  const requests = [];

  const window = bootSection(
    ['cart-drawer.liquid', 'header.liquid'],
    html === undefined ? `${HEADER_LINK}${cartDrawerSection()}` : html,
    {
      beforeScript(win) {
        win.fetch = (url, options = {}) => {
          const request = {
            url,
            method: options.method || 'GET',
            body: options.body ? JSON.parse(options.body) : null
          };
          requests.push(request);

          const answer = respond ? respond(request) : { ok: true, json: {} };
          if (answer.reject) return Promise.reject(new Error('network down'));

          return Promise.resolve({
            ok: answer.ok !== false,
            json: () => Promise.resolve(answer.json || {}),
            text: () => Promise.resolve(answer.text || '')
          });
        };
      }
    }
  );

  return { window, requests };
}

const drawerOf = (window) => window.document.querySelector('[data-cart-drawer]');
const contentsOf = (window) => window.document.querySelector('[data-cart-drawer-contents]');
const badgeOf = (window) => window.document.querySelector('[data-cart-count]');

const fire = (window, type, detail) =>
  window.document.dispatchEvent(new window.CustomEvent(type, { detail: detail }));

test('cart:open shows the drawer', () => {
  const { window } = bootDrawer();

  fire(window, 'cart:open', {});

  assert.equal(drawerOf(window).open, true, 'the drawer never opened');
});

test('cart:refresh swaps the contents and leaves the dialog itself alone', () => {
  const { window } = bootDrawer();
  const dialog = drawerOf(window);

  fire(window, 'cart:open', {});
  fire(window, 'cart:refresh', {
    sections: { 'cart-drawer': cartDrawerSection({ itemCount: 3, quantity: 3, marker: 'server' }) }
  });

  assert.equal(contentsOf(window).getAttribute('data-marker'), 'server');
  assert.equal(drawerOf(window), dialog, 'the dialog element was replaced');
  assert.equal(dialog.open, true, 'swapping the contents closed the open drawer');
});

test('a render reports the new item count to the header', () => {
  const { window } = bootDrawer();

  fire(window, 'cart:refresh', {
    sections: { 'cart-drawer': cartDrawerSection({ itemCount: 4, quantity: 4 }) }
  });

  assert.equal(badgeOf(window).textContent, '4');
  assert.equal(
    window.document.querySelector('[data-cart-link]').getAttribute('aria-label'),
    '4 items'
  );
});

test('an emptied cart hides the header badge', () => {
  const { window } = bootDrawer();

  fire(window, 'cart:refresh', {
    sections: { 'cart-drawer': cartDrawerSection({ itemCount: 0 }) }
  });

  assert.equal(badgeOf(window).textContent, '0');
  assert.equal(badgeOf(window).hidden, true, 'an empty cart should not show a badge');
});

test('the drawer ignores a count it did not understand', () => {
  const { window } = bootDrawer();
  const before = badgeOf(window).textContent;

  fire(window, 'cart:updated', {});

  assert.equal(badgeOf(window).textContent, before, 'a detail-less event overwrote the badge');
});

test('the header cart link opens the drawer instead of loading the cart page', () => {
  const { window } = bootDrawer();

  const link = window.document.querySelector('[data-cart-link]');
  const event = new window.Event('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);

  assert.equal(drawerOf(window).open, true, 'the link did not open the drawer');
  assert.equal(event.defaultPrevented, true, 'the browser would still navigate to /cart');
  assert.deepEqual(window.navigations, []);
});

test('a quantity step sends one change request and renders what came back', async () => {
  const drawer = bootDrawer({
    respond: () => ({
      ok: true,
      json: {
        item_count: 2,
        sections: { 'cart-drawer': cartDrawerSection({ itemCount: 2, quantity: 2, marker: 'server' }) }
      }
    })
  });
  const window = drawer.window;

  window.document.querySelector('[data-drawer-qty-step="1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );
  await tick(window, 20);

  assert.equal(drawer.requests.length, 1);
  assert.equal(drawer.requests[0].url, '/cart/change.js');
  assert.equal(
    drawer.requests[0].body.id,
    'k1',
    'the line was addressed by position, which shifts when the cart moves under the drawer'
  );
  assert.equal(drawer.requests[0].body.line, undefined);
  assert.deepEqual(drawer.requests[0].body.quantity, 2, 'the step did not increment from 1 to 2');
  assert.equal(contentsOf(window).getAttribute('data-marker'), 'server');
  assert.equal(badgeOf(window).textContent, '2');
});

test('a quantity step never goes below zero', async () => {
  const drawer = bootDrawer({
    respond: () => ({
      ok: true,
      json: { item_count: 0, sections: { 'cart-drawer': cartDrawerSection({ itemCount: 0 }) } }
    })
  });
  const window = drawer.window;

  window.document.querySelector('[data-drawer-qty-step="-1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );
  await tick(window, 20);

  assert.equal(drawer.requests[0].body.quantity, 0);
});

test('remove takes the line to zero without following its href', async () => {
  const drawer = bootDrawer({
    respond: () => ({
      ok: true,
      json: { item_count: 0, sections: { 'cart-drawer': cartDrawerSection({ itemCount: 0 }) } }
    })
  });
  const window = drawer.window;

  const remove = window.document.querySelector('[data-cart-drawer-remove]');
  const event = new window.Event('click', { bubbles: true, cancelable: true });
  remove.dispatchEvent(event);
  await tick(window, 20);

  assert.equal(event.defaultPrevented, true, 'the remove link would have loaded a page');
  assert.equal(drawer.requests[0].body.quantity, 0);
  assert.deepEqual(window.navigations, []);
});

test('a second change is refused while one is in flight', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });

  const requests = [];
  const window = bootSection(
    ['cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        win.fetch = (url, options) => {
          requests.push(JSON.parse(options.body));
          return held.then(() => ({
            ok: true,
            json: () => Promise.resolve({ item_count: 2, sections: {} })
          }));
        };
      }
    }
  );

  const step = window.document.querySelector('[data-drawer-qty-step="1"]');
  step.dispatchEvent(new window.Event('click', { bubbles: true }));
  step.dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(requests.length, 1, 'a double tap sent two conflicting writes');
  release();
  await tick(window, 20);
});

test('a request in flight never disables the way out', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });

  const window = bootSection(
    ['cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        win.fetch = () =>
          held.then(() => ({ ok: true, json: () => Promise.resolve({ sections: {} }) }));
      }
    }
  );

  fire(window, 'cart:open', {});
  window.document.querySelector('[data-drawer-qty-step="1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );

  const close = window.document.querySelector('[data-cart-drawer-close]');
  assert.equal(close.disabled, false, 'a hung request would trap the customer in the drawer');

  close.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(drawerOf(window).open, false, 'the close button did nothing mid-request');

  release();
  await tick(window, 20);
});

test('a rejected change shows the reason and leaves the drawer usable', async () => {
  const drawer = bootDrawer({
    respond: () => ({ ok: false, json: { description: 'Only 1 left in stock' } })
  });
  const window = drawer.window;

  window.document.querySelector('[data-drawer-qty-step="1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );
  await tick(window, 20);

  const status = window.document.querySelector('[data-cart-drawer-status]');
  assert.equal(status.textContent, 'Only 1 left in stock');
  assert.equal(drawerOf(window).getAttribute('aria-busy'), 'false', 'the drawer stayed disabled');
  assert.deepEqual(window.navigations, []);
});

test('a dropped connection shows the translated message, not the engine string', async () => {
  const drawer = bootDrawer({ respond: () => ({ reject: true }) });
  const window = drawer.window;

  window.document.querySelector('[data-drawer-qty-step="1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );
  await tick(window, 20);

  /* fetch rejects with TypeError("Failed to fetch"); a 5xx HTML page makes
     response.json() reject with a SyntaxError. Both messages are truthy, and
     both would be shown to a customer verbatim and untranslated. */
  assert.equal(window.document.querySelector('[data-cart-drawer-status]').textContent, 'Error');
});

test('a malformed error response falls back to the translated message', async () => {
  const requests = [];
  const window = bootSection(
    ['cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        win.fetch = () => {
          requests.push(1);
          return Promise.resolve({
            ok: false,
            json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0'))
          });
        };
      }
    }
  );

  window.document.querySelector('[data-drawer-qty-step="1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );
  await tick(window, 20);

  assert.equal(window.document.querySelector('[data-cart-drawer-status]').textContent, 'Error');
});

test('a change the server took but could not render leaves the drawer wanting a refresh', async () => {
  /* The quantity was changed server-side; only the section HTML is missing. If
     the drawer keeps showing the old numbers and does not consider itself
     stale, nothing will ever correct it. */
  let sections = {};
  const requests = [];
  const window = bootSection(
    ['cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        win.fetch = (url) => {
          requests.push(url);
          if (String(url).indexOf('section_id') !== -1) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(cartDrawerSection({ itemCount: 2, marker: 'corrected' }))
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ item_count: 2, sections: sections })
          });
        };
      }
    }
  );

  window.document.querySelector('[data-drawer-qty-step="1"]').dispatchEvent(
    new window.Event('click', { bubbles: true })
  );
  await tick(window, 20);

  window.document.dispatchEvent(new window.CustomEvent('cart:open', { detail: {} }));
  await tick(window, 20);

  assert.equal(
    window.document.querySelector('[data-cart-drawer-contents]').getAttribute('data-marker'),
    'corrected',
    'the drawer kept showing quantities the server had already moved past'
  );
});

test('a re-render puts keyboard focus back on the control that was pressed', async () => {
  const drawer = bootDrawer({
    respond: () => ({
      ok: true,
      json: {
        item_count: 2,
        sections: { 'cart-drawer': cartDrawerSection({ itemCount: 2, quantity: 2, marker: 'server' }) }
      }
    })
  });
  const window = drawer.window;

  const plus = window.document.querySelector('[data-drawer-qty-step="1"]');
  plus.focus();
  plus.dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick(window, 20);

  /* replaceWith destroys the node holding focus, so without restoring it the
     customer has to tab in from the top of the page to press "+" twice. */
  assert.equal(
    window.document.activeElement,
    window.document.querySelector('[data-drawer-qty-step="1"]'),
    'focus was dropped when the contents were swapped'
  );
  assert.notEqual(window.document.activeElement, plus, 'the fixture should have re-rendered');
});

test('a re-render that removes the focused line keeps focus inside the drawer', async () => {
  const drawer = bootDrawer({
    respond: () => ({
      ok: true,
      json: { item_count: 0, sections: { 'cart-drawer': cartDrawerSection({ itemCount: 0 }) } }
    })
  });
  const window = drawer.window;

  const minus = window.document.querySelector('[data-drawer-qty-step="-1"]');
  minus.focus();
  minus.dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick(window, 20);

  assert.equal(
    window.document.activeElement,
    window.document.querySelector('[data-cart-drawer-title]'),
    'focus fell out of the drawer onto the page behind it'
  );
});

test('a modified click on the cart link is left to the browser', () => {
  const { window } = bootDrawer();

  const link = window.document.querySelector('[data-cart-link]');
  const event = Object.assign(new window.Event('click', { bubbles: true, cancelable: true }), {
    metaKey: true
  });
  link.dispatchEvent(event);

  assert.equal(event.defaultPrevented, false, 'cmd-click could no longer open /cart in a new tab');
  assert.equal(drawerOf(window).open, false);
});

test('the drawer stands down on the cart page', () => {
  /* Both would edit the same lines, and the cart page would be left holding
     quantities and line indexes the server has moved past. */
  const { window } = bootDrawer({
    html: `${HEADER_LINK}<div data-cart-section data-section-id="cart"></div>${cartDrawerSection()}`
  });

  const link = window.document.querySelector('[data-cart-link]');
  const event = new window.Event('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);

  assert.equal(drawerOf(window).open, false, 'the drawer took over the cart page');
  assert.equal(event.defaultPrevented, false, 'the cart link was hijacked on the cart page itself');
});

/* Safari before 15.4 and Firefox before 98 have no <dialog>. There is nothing
   to open there, so the drawer must not claim the cart link — that would turn
   the cart icon into a dead control — and the product form must post normally
   rather than adding over AJAX into a drawer nobody will ever see. */
function bootWithoutDialog(html) {
  return bootSection(['product.liquid', 'cart-drawer.liquid', 'header.liquid'], html, {
    beforeScript(win) {
      delete win.HTMLDialogElement.prototype.showModal;
      win.fetch = () => {
        throw new Error('nothing should reach the network without a drawer');
      };
    }
  });
}

test('a browser without <dialog> leaves the cart link working', () => {
  const window = bootWithoutDialog(`${HEADER_LINK}${cartDrawerSection()}`);

  assert.equal(drawerOf(window).getAttribute('data-drawer-initialized'), null);

  const event = new window.Event('click', { bubbles: true, cancelable: true });
  window.document.querySelector('[data-cart-link]').dispatchEvent(event);

  assert.equal(event.defaultPrevented, false, 'the cart icon became a dead link');
});

test('a browser without <dialog> posts the product form normally', () => {
  const window = bootWithoutDialog(
    `${HEADER_LINK}${productSection()}${cartDrawerSection()}`
  );

  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  window.document.querySelector('.product__form').dispatchEvent(event);

  assert.equal(
    event.defaultPrevented,
    false,
    'the add went over AJAX with no drawer to show the result in'
  );
});

test('the product form posts normally when the drawer stood down', () => {
  const window = bootSection(
    ['product.liquid', 'cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}<div data-cart-section data-section-id="cart"></div>${productSection()}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        win.fetch = () => {
          throw new Error('nothing should reach the network on the cart page');
        };
      }
    }
  );

  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  window.document.querySelector('.product__form').dispatchEvent(event);

  assert.equal(event.defaultPrevented, false, 'the add had nowhere to show its result');
});

test('a cart:refresh with no HTML makes the drawer re-fetch on its next open', async () => {
  const drawer = bootDrawer({
    respond: () => ({ ok: true, text: cartDrawerSection({ itemCount: 7, marker: 'refetched' }) })
  });
  const window = drawer.window;

  /* This is what the cart page sends: it changed the cart but only holds its
     own section's HTML, so the drawer has to go and get its own. */
  fire(window, 'cart:refresh', {});
  assert.equal(drawer.requests.length, 0, 'the drawer refetched while still closed');

  fire(window, 'cart:open', {});
  await tick(window, 20);

  assert.equal(drawer.requests.length, 1);
  assert.match(drawer.requests[0].url, /section_id=cart-drawer/);
  assert.equal(contentsOf(window).getAttribute('data-marker'), 'refetched');
  assert.equal(badgeOf(window).textContent, '7');
});

test('a fresh drawer does not refetch when opened', async () => {
  const drawer = bootDrawer();
  const window = drawer.window;

  fire(window, 'cart:refresh', {
    sections: { 'cart-drawer': cartDrawerSection({ itemCount: 2 }) }
  });
  fire(window, 'cart:open', {});
  await tick(window, 20);

  assert.equal(drawer.requests.length, 0, 'the drawer refetched HTML it had just been handed');
});

test('the drawer still opens when its refresh fails', async () => {
  const drawer = bootDrawer({ respond: () => ({ reject: true }) });
  const window = drawer.window;

  fire(window, 'cart:refresh', {});
  fire(window, 'cart:open', {});
  await tick(window, 20);

  assert.equal(drawerOf(window).open, true, 'a failed refresh left the customer with no drawer');
  assert.equal(window.document.querySelector('[data-cart-drawer-status]').textContent, 'Error');
});

test('unloading the section stops the drawer responding', () => {
  const { window } = bootDrawer({
    html: `${HEADER_LINK}<div class="shopify-section" id="sec">${cartDrawerSection()}</div>`
  });
  const section = window.document.getElementById('sec');

  dispatchSectionEvent(window, 'shopify:section:unload', section);
  fire(window, 'cart:open', {});

  assert.equal(drawerOf(window).open, false, 'a listener outlived the section');
});

/* --- the product form's side of the hand-off ------------------------------ */

function bootProductWithDrawer({ respond } = {}) {
  const requests = [];

  const window = bootSection(
    ['product.liquid', 'cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}${productSection()}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        win.fetch = (url, options = {}) => {
          requests.push({ url, options, body: options.body });
          const answer = respond ? respond() : { ok: true, json: {} };
          return Promise.resolve({
            ok: answer.ok !== false,
            json: () => Promise.resolve(answer.json || {}),
            text: () => Promise.resolve(answer.text || '')
          });
        };
      }
    }
  );

  return { window, requests };
}

const submitProduct = (window) =>
  window.document
    .querySelector('.product__form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

test('adding to cart posts to the cart and opens the drawer', async () => {
  const product = bootProductWithDrawer({
    respond: () => ({
      ok: true,
      json: {
        sections: { 'cart-drawer': cartDrawerSection({ itemCount: 5, marker: 'after-add' }) }
      }
    })
  });
  const window = product.window;

  submitProduct(window);
  await tick(window, 20);

  assert.equal(product.requests.length, 1);
  assert.equal(product.requests[0].url, '/cart/add.js');
  assert.equal(product.requests[0].options.method, 'POST');
  assert.equal(drawerOf(window).open, true, 'the drawer did not open after adding');
  assert.equal(contentsOf(window).getAttribute('data-marker'), 'after-add');
  assert.equal(badgeOf(window).textContent, '5');
  assert.deepEqual(window.navigations, [], 'the form posted and navigated instead of adding');
});

test('the add request asks for the drawer section by name', async () => {
  const product = bootProductWithDrawer({
    respond: () => ({ ok: true, json: { sections: {} } })
  });
  const window = product.window;

  submitProduct(window);
  await tick(window, 20);

  const body = product.requests[0].body;
  assert.equal(body.get('sections'), 'cart-drawer');
  assert.equal(body.get('id'), '11', 'the selected variant did not reach the request');
});

test('the browser sets the multipart boundary, not the theme', async () => {
  const product = bootProductWithDrawer({ respond: () => ({ ok: true, json: { sections: {} } }) });
  const window = product.window;

  submitProduct(window);
  await tick(window, 20);

  /* Setting Content-Type by hand omits the boundary and Shopify rejects the
     body, which is the kind of failure that only shows up against the real
     endpoint. */
  const headers = product.requests[0].options.headers || {};
  assert.equal(headers['Content-Type'], undefined);
  assert.ok(product.requests[0].body instanceof window.FormData);
});

test('a rejected add reports why and re-enables the button', async () => {
  const product = bootProductWithDrawer({
    respond: () => ({ ok: false, json: { description: 'Sold out' } })
  });
  const window = product.window;

  submitProduct(window);
  await tick(window, 20);

  assert.equal(window.document.querySelector('[data-add-status]').textContent, 'Sold out');
  assert.equal(drawerOf(window).open, false, 'the drawer opened on a failed add');
  assert.equal(
    window.document.querySelector('[data-add-button]').disabled,
    false,
    'the customer was left with a dead button'
  );
});

test('an add that fails without a server message shows the translated one', async () => {
  const window = bootSection(
    ['product.liquid', 'cart-drawer.liquid', 'header.liquid'],
    `${HEADER_LINK}${productSection()}${cartDrawerSection()}`,
    {
      beforeScript(win) {
        /* A dropped connection rejects with TypeError("Failed to fetch"); a 5xx
           HTML page makes response.json() reject with a SyntaxError. Both carry
           a truthy message that means nothing to a customer and is not
           translated. */
        win.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      }
    }
  );

  submitProduct(window);
  await tick(window, 20);

  assert.equal(window.document.querySelector('[data-add-status]').textContent, 'Add error');
});

test('an add that finishes on an unmatched combination leaves the button disabled', async () => {
  const product = bootProductWithDrawer({ respond: () => ({ ok: true, json: { sections: {} } }) });
  const window = product.window;

  submitProduct(window);

  /* Mid-request the customer picks a combination that has no variant. That
     clears the select, so it has no selected option — the finalizer must read
     that as "unbuyable", not as "nothing to restore, switch the button on".
     A button enabled here posts an add with an empty variant id. */
  const large = window.document.querySelector('#opt-a-L');
  large.checked = true;
  large.dispatchEvent(new window.Event('change', { bubbles: true }));

  await tick(window, 20);

  const addBtn = window.document.querySelector('[data-add-button]');
  assert.equal(window.document.querySelector('[data-variant-select]').value, '');
  assert.equal(addBtn.disabled, true, 'add to cart was re-enabled for a variant that does not exist');
  assert.equal(addBtn.textContent, 'Unavailable');
});

test('optional personalization fields are re-enabled after an add', async () => {
  const product = bootProductWithDrawer({ respond: () => ({ ok: true, json: { sections: {} } }) });
  const window = product.window;

  /* Blank optional fields are disabled on the way out so they are not stored as
     empty line-item properties. Leaving them disabled would silently drop the
     customer's next personalization. */
  submitProduct(window);
  await tick(window, 20);

  assert.equal(window.document.querySelector('[data-property-optional]').disabled, false);
});

test('without a drawer on the page the form posts normally', () => {
  const requests = [];
  const window = bootSection('product.liquid', productSection(), {
    beforeScript(win) {
      win.fetch = (url) => {
        requests.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      };
    }
  });

  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  window.document.querySelector('.product__form').dispatchEvent(event);

  assert.deepEqual(requests, [], 'the form went to fetch with nowhere to show the result');
  assert.equal(event.defaultPrevented, false, 'the plain form post was cancelled');
});

/* A modal <dialog> keeps focus inside itself, but tabbing off the last control
   stops on the dialog element on the way round — one press that moves the ring
   nowhere visible before the next reaches the close button. The section closes
   that loop itself, so these drive Tab and assert where focus lands.

   jsdom has no sequential focus navigation, which is exactly why this is
   assertable: nothing moves focus here except the handler under test. */

function bootOpenDrawer() {
  const { window } = bootDrawer();
  fire(window, 'cart:open', {});
  return window;
}

const tabbables = (window) =>
  Array.from(
    window.document.querySelectorAll('[data-cart-drawer] button, [data-cart-drawer] a[href]')
  );

function pressTab(window, { shift = false } = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true
  });
  window.document.activeElement.dispatchEvent(event);
  return event;
}

test('tabbing off the last control returns to the first, with no stop in between', () => {
  const window = bootOpenDrawer();
  const items = tabbables(window);
  const last = items[items.length - 1];

  last.focus();
  const event = pressTab(window);

  assert.equal(event.defaultPrevented, true, 'the browser was not left to make the round trip');
  assert.equal(
    window.document.activeElement,
    items[0],
    'focus went straight to the first control rather than parking on the dialog'
  );
});

test('shift-tabbing off the first control returns to the last', () => {
  const window = bootOpenDrawer();
  const items = tabbables(window);

  items[0].focus();
  const event = pressTab(window, { shift: true });

  assert.equal(event.defaultPrevented, true);
  assert.equal(window.document.activeElement, items[items.length - 1]);
});

test('shift-tabbing off the title reaches the last control, not the dialog', () => {
  const window = bootOpenDrawer();
  const items = tabbables(window);

  /* The title takes focus when the drawer opens and carries tabindex="-1", so
     it sits outside the cycle. Going backwards from it has nothing above to
     land on and stops on the dialog — the same dead press as tabbing off the
     end, and the one a customer meets first. */
  window.document.querySelector('[data-cart-drawer-title]').focus();
  const event = pressTab(window, { shift: true });

  assert.equal(event.defaultPrevented, true);
  assert.equal(window.document.activeElement, items[items.length - 1]);
});

test('tabbing through the middle of the drawer is left to the browser', () => {
  const window = bootOpenDrawer();
  const items = tabbables(window);

  /* Forwards off the title is a plain move to the first control, and a middle
     control has neighbours on both sides. Intercepting either would take over
     navigation the browser already gets right. */
  window.document.querySelector('[data-cart-drawer-title]').focus();
  assert.equal(pressTab(window).defaultPrevented, false, 'the title was intercepted going forward');

  items[1].focus();
  assert.equal(pressTab(window).defaultPrevented, false, 'a middle control was intercepted');
  assert.equal(
    pressTab(window, { shift: true }).defaultPrevented,
    false,
    'a middle control was intercepted going backward'
  );
});
