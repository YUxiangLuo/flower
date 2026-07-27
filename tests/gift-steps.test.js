'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootSection,
  dispatchSectionEvent,
  stubIntersectionObserver
} = require('./helpers/section.js');
const { giftStepsSection } = require('./helpers/fixtures.js');

function boot(html = giftStepsSection(), { observe = true, designMode = false } = {}) {
  let observer = null;
  const window = bootSection('gift-steps.liquid', html, {
    beforeScript(win) {
      if (observe) observer = stubIntersectionObserver(win);
      if (designMode) win.Shopify = { designMode: true };
    }
  });

  return {
    window,
    observer,
    root: () => window.document.querySelector('[data-giftsteps-motion]'),
    list: () => window.document.querySelector('.giftsteps__list')
  };
}

test('the steps reveal once their list enters the viewport', () => {
  const page = boot();

  assert.equal(page.root().hasAttribute('data-motion-pending'), true);
  assert.equal(page.root().hasAttribute('data-motion-ready'), true);
  assert.equal(page.root().hasAttribute('data-motion-visible'), false);
  assert.deepEqual(page.observer.observed(), [page.list()]);

  page.observer.setVisible(page.list(), true);

  assert.equal(page.root().hasAttribute('data-motion-pending'), false);
  assert.equal(page.root().hasAttribute('data-motion-visible'), true);
  assert.equal(page.observer.observed().length, 0, 'the one-shot observer was released');
});

test('a list taller than the viewport still has a reachable reveal threshold', () => {
  const page = boot();
  const viewportHeight = 568;
  const effectiveRootHeight = viewportHeight * 0.9;
  const listHeight = viewportHeight * 5;
  const maximumIntersectionRatio = effectiveRootHeight / listHeight;

  assert.ok(
    maximumIntersectionRatio < 0.2,
    'the constrained fixture should reproduce the former unreachable threshold'
  );

  page.observer.setIntersectionRatio(page.list(), maximumIntersectionRatio);

  assert.equal(page.root().hasAttribute('data-motion-pending'), false);
  assert.equal(page.root().hasAttribute('data-motion-visible'), true);
});

test('the steps stay visible when IntersectionObserver is unavailable', () => {
  const page = boot(giftStepsSection(), { observe: false });

  assert.equal(page.root().hasAttribute('data-motion-visible'), true);
  assert.equal(page.root().hasAttribute('data-motion-pending'), false);
  assert.equal(page.root().hasAttribute('data-motion-ready'), false);
});

test('the theme editor keeps the walkthrough visible without observing it', () => {
  const page = boot(giftStepsSection(), { designMode: true });

  assert.equal(page.root().hasAttribute('data-motion-visible'), true);
  assert.equal(page.root().hasAttribute('data-motion-pending'), false);
  assert.equal(page.observer.observed().length, 0);
});

test('unloading the section releases its observer and restores visible content', () => {
  const page = boot();
  const section = page.window.document.getElementById('section-steps');

  dispatchSectionEvent(page.window, 'shopify:section:unload', section);

  assert.equal(page.observer.observed().length, 0);
  assert.equal(page.root().hasAttribute('data-motion-pending'), false);
  assert.equal(page.root().hasAttribute('data-motion-ready'), false);
  assert.equal(page.root().hasAttribute('data-motion-visible'), false);
});
