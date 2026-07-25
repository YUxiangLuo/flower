'use strict';

/* The nested menus and the search field are <details> disclosures, so they open
   and close without any JavaScript at all. What the section's script adds is
   the behaviour a bare disclosure lacks: only one panel open at a time, hover
   for pointer users, Escape and outside-click to dismiss, and closing when
   focus tabs past the end of a panel.

   None of that is visible in the markup, and all of it is what makes the menu
   usable rather than merely present — so it is asserted here rather than left
   to a source-text check. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent, stubMatchMedia, tick } = require('./helpers/section.js');
const { headerSection } = require('./helpers/fixtures.js');

const HOVER = '(hover: hover)';

function bootHeader(html = headerSection(), { hover = true } = {}) {
  return bootSection('header.liquid', html, {
    beforeScript(win) {
      stubMatchMedia(win, { [HOVER]: hover });
    }
  });
}

const dropdown = (window, name) => window.document.querySelector(`[data-menu="${name}"]`);
const search = (window) => window.document.querySelector('[data-header-search]');

const fire = (window, target, type, init = {}) =>
  target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true }), init));

/* jsdom queues the toggle event as a task, so anything reacting to it lands a
   tick after `open` changes. */
const settle = (window) => tick(window, 0);

/* A real pointer arriving over an element: the guard against the synthetic
   mouseenter a browser fires under a stationary cursor on load. */
function hoverOnto(window, element) {
  fire(window, window.document, 'mousemove');
  element.dispatchEvent(new window.Event('mouseenter'));
}

test('opening one dropdown closes the one already open', async () => {
  const window = bootHeader();

  dropdown(window, 'shop').open = true;
  await settle(window);
  dropdown(window, 'gifts').open = true;
  await settle(window);

  assert.equal(dropdown(window, 'gifts').open, true);
  assert.equal(dropdown(window, 'shop').open, false, 'two panels were left open at once');
});

test('hover opens a dropdown once the pointer has actually moved', async () => {
  const window = bootHeader();

  hoverOnto(window, dropdown(window, 'shop'));
  await settle(window);

  assert.equal(dropdown(window, 'shop').open, true, 'hover never opened the panel');
});

test('a stationary cursor over a menu on load does not open it', async () => {
  const window = bootHeader();

  /* No mousemove first: this is the synthetic mouseenter the browser fires at
     whatever sits under the cursor when the page loads. Honouring it would pop
     a menu open on every page load for anyone whose pointer happens to rest on
     the nav. */
  dropdown(window, 'shop').dispatchEvent(new window.Event('mouseenter'));
  await settle(window);

  assert.equal(dropdown(window, 'shop').open, false, 'a synthetic mouseenter opened the menu');
});

test('hover does nothing on a device without one', async () => {
  const window = bootHeader(headerSection(), { hover: false });

  hoverOnto(window, dropdown(window, 'shop'));
  await settle(window);

  assert.equal(
    dropdown(window, 'shop').open,
    false,
    'a touch tap that synthesises mouseenter would open the panel under the finger'
  );
});

test('the panel closes a moment after the pointer leaves', async () => {
  const window = bootHeader();
  const shop = dropdown(window, 'shop');

  hoverOnto(window, shop);
  await settle(window);

  shop.dispatchEvent(new window.Event('mouseleave'));
  /* The grace period is there so cutting a corner on the way to the panel does
     not snap it shut; it must still close once the pointer stays away. */
  await tick(window, 40);
  assert.equal(shop.open, true, 'the panel closed before the grace period elapsed');

  await tick(window, 200);
  assert.equal(shop.open, false, 'the panel stayed open after the pointer left');
});

test('escape closes the open panel and hands focus back to its trigger', async () => {
  const window = bootHeader();
  const shop = dropdown(window, 'shop');
  const summary = shop.querySelector('summary');

  shop.open = true;
  await settle(window);
  shop.querySelector('.header__panel-link').focus();

  fire(window, window.document.querySelector('.header'), 'keydown', { key: 'Escape' });

  assert.equal(shop.open, false, 'escape left the panel open');
  assert.equal(
    window.document.activeElement,
    summary,
    'focus was dropped instead of returning to the trigger'
  );
});

test('clicking outside the header closes an open panel', async () => {
  const window = bootHeader(`<div id="elsewhere">page</div>${headerSection()}`);
  const shop = dropdown(window, 'shop');

  shop.open = true;
  await settle(window);

  fire(window, window.document.getElementById('elsewhere'), 'click');
  await settle(window);

  assert.equal(shop.open, false, 'the panel stayed open over the rest of the page');
});

test('clicking inside the panel leaves it open', async () => {
  const window = bootHeader();
  const shop = dropdown(window, 'shop');

  shop.open = true;
  await settle(window);

  fire(window, shop.querySelector('.header__panel-link'), 'click');
  await settle(window);

  assert.equal(shop.open, true, 'the panel closed before its own link could be followed');
});

test('tabbing out of a panel closes it', async () => {
  const window = bootHeader();
  const shop = dropdown(window, 'shop');

  shop.open = true;
  await settle(window);

  const outside = window.document.querySelector('.header__nav-link');
  shop
    .querySelector('.header__panel-link')
    .dispatchEvent(
      Object.assign(new window.Event('focusout', { bubbles: true }), { relatedTarget: outside })
    );

  assert.equal(shop.open, false, 'the panel stayed open behind the next focused element');
});

test('focus moving within a panel keeps it open', async () => {
  const window = bootHeader();
  const shop = dropdown(window, 'shop');

  shop.open = true;
  await settle(window);

  const links = shop.querySelectorAll('.header__panel-link');
  links[0].dispatchEvent(
    Object.assign(new window.Event('focusout', { bubbles: true }), { relatedTarget: links[1] })
  );

  assert.equal(shop.open, true, 'tabbing to the next item in the same panel closed it');
});

test('opening search closes the menus and focuses the field', async () => {
  const window = bootHeader();
  const shop = dropdown(window, 'shop');

  shop.open = true;
  await settle(window);

  search(window).open = true;
  await settle(window);

  assert.equal(shop.open, false, 'a menu was left open behind the search panel');
  assert.equal(
    window.document.activeElement,
    window.document.querySelector('[data-search-input]'),
    'the search field did not take focus when its panel opened'
  );
});

test('escape closes the search panel too', async () => {
  const window = bootHeader();

  search(window).open = true;
  await settle(window);

  fire(window, window.document.querySelector('.header'), 'keydown', { key: 'Escape' });

  assert.equal(search(window).open, false, 'escape left the search field open');
});

test('a header without search still wires its menus', async () => {
  const window = bootHeader(headerSection({ search: false }));

  assert.equal(search(window), null, 'fixture should render no search disclosure');

  hoverOnto(window, dropdown(window, 'shop'));
  await settle(window);

  assert.equal(dropdown(window, 'shop').open, true);
});

test('unloading the section stops the header responding', async () => {
  const window = bootHeader();
  const section = window.document.getElementById('section-header');

  dispatchSectionEvent(window, 'shopify:section:unload', section);

  hoverOnto(window, dropdown(window, 'shop'));
  await settle(window);

  assert.equal(dropdown(window, 'shop').open, false, 'a listener outlived the section');
  assert.equal(
    window.document.querySelector('.header').headerCleanup,
    null,
    'the cleanup handle was left dangling'
  );
});

test('a section re-rendered by the theme editor is wired against the fresh DOM', async () => {
  const window = bootHeader();
  const section = window.document.getElementById('section-header');

  section.innerHTML = headerSection().replace(/^[\s\S]*?<header/, '<header').replace(/<\/div>\s*$/, '');
  dispatchSectionEvent(window, 'shopify:section:load', section);

  hoverOnto(window, dropdown(window, 'gifts'));
  await settle(window);

  assert.equal(dropdown(window, 'gifts').open, true, 'the re-rendered header never got wired up');
});

test('re-initialising does not leave a second set of listeners behind', async () => {
  const window = bootHeader();
  const section = window.document.getElementById('section-header');

  /* Same DOM, initialised twice. A doubled outside-click listener would still
     close the panel, so the observable symptom is a doubled hover timer: the
     first cleanup must run before the second wiring. */
  dispatchSectionEvent(window, 'shopify:section:load', section);

  const shop = dropdown(window, 'shop');
  hoverOnto(window, shop);
  await settle(window);
  assert.equal(shop.open, true);

  shop.dispatchEvent(new window.Event('mouseleave'));
  await tick(window, 200);

  assert.equal(shop.open, false, 'the panel did not close after a re-init');
});
