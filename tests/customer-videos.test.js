'use strict';

/* The clips rail remains on its posters until the customer chooses a video.
   The selected clip is cloned into a controllable dialog with sound, while the
   rail copy stays paused.

   What is deliberately not asserted here: the focus trap and the top layer.
   Those are the browser's, which is why the section uses <dialog>. Escape now
   passes through the section's cancel handler so the exit transition can
   finish, and that small piece of application logic is covered below. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootSection,
  dispatchSectionEvent
} = require('./helpers/section.js');
const { customerVideosSection } = require('./helpers/fixtures.js');

function boot(html = customerVideosSection()) {
  const window = bootSection('customer-videos.liquid', html);

  const cards = () => Array.from(window.document.querySelectorAll('[data-clip]'));
  const videoIn = (card) => card.querySelector('video');

  return {
    window,
    cards,
    videoIn,
    viewer: () => window.document.querySelector('[data-clips-viewer]'),
    stage: () => window.document.querySelector('[data-clips-stage]')
  };
}

test('rail clips remain paused until the customer opens one', () => {
  const page = boot();
  page.cards().forEach((card) => {
    assert.equal(page.videoIn(card).hasAttribute('autoplay'), false);
    assert.equal(page.videoIn(card).paused, true);
  });

  page.window.dispatchEvent(new page.window.Event('scroll'));
  page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));

  page.cards().forEach((card) => {
    assert.equal(page.videoIn(card).paused, true, 'page activity started a rail clip');
  });
});

test('opening the viewer plays a controllable copy with sound', () => {
  const page = boot();
  const [card] = page.cards();

  assert.equal(page.videoIn(card).paused, true);

  card.querySelector('[data-clip-open]').click();

  assert.equal(page.viewer().open, true, 'the dialog is showing');

  const playing = page.stage().querySelector('video');
  assert.ok(playing, 'the viewer holds a copy of the clip');
  assert.equal(playing.muted, false, 'the copy plays with sound');
  assert.equal(playing.controls, true, 'the copy is controllable');
  assert.equal(playing.paused, false);

  assert.equal(
    page.videoIn(card).paused,
    true,
    'the rail copy stops so the same clip is not heard twice'
  );
});

test('closing the viewer clears it and hands the clip back to the rail', () => {
  const page = boot();
  const [card] = page.cards();

  card.querySelector('[data-clip-open]').click();
  page.window.document.querySelector('[data-clips-close]').click();

  assert.equal(page.viewer().open, false);
  assert.equal(page.stage().querySelector('video'), null, 'the copy is discarded');
  assert.equal(page.videoIn(card).paused, true, 'the rail remains on its poster');
});

test('the viewer stays open until its exit transition finishes', () => {
  const page = boot();
  const [card] = page.cards();
  const viewer = page.viewer();
  const nativeGetComputedStyle = page.window.getComputedStyle.bind(page.window);

  page.window.getComputedStyle = (element) => {
    if (element === viewer) {
      return {
        transitionDuration: '0.4s, 0.4s',
        transitionDelay: '0s, 0s'
      };
    }
    return nativeGetComputedStyle(element);
  };

  card.querySelector('[data-clip-open]').click();
  page.window.document.querySelector('[data-clips-close]').click();

  assert.equal(viewer.open, true, 'the dialog remains in the top layer while fading out');
  assert.equal(viewer.hasAttribute('data-closing'), true);
  assert.ok(page.stage().querySelector('video'), 'the viewer content remains until close');
  assert.equal(page.videoIn(card).paused, true, 'the rail stays paused during the exit');

  viewer.dispatchEvent(new page.window.Event('transitionend', { bubbles: true }));

  assert.equal(viewer.open, false);
  assert.equal(viewer.hasAttribute('data-closing'), false);
  assert.equal(page.stage().querySelector('video'), null);
  assert.equal(page.videoIn(card).paused, true);
});

test('Escape uses the same animated exit path', () => {
  const page = boot();
  const [card] = page.cards();
  const viewer = page.viewer();

  page.window.getComputedStyle = () => ({
    transitionDuration: '0.4s',
    transitionDelay: '0s'
  });

  card.querySelector('[data-clip-open]').click();
  const cancel = new page.window.Event('cancel', { cancelable: true });
  viewer.dispatchEvent(cancel);

  assert.equal(cancel.defaultPrevented, true);
  assert.equal(viewer.open, true);
  assert.equal(viewer.hasAttribute('data-closing'), true);

  viewer.dispatchEvent(new page.window.Event('transitionend', { bubbles: true }));
  assert.equal(viewer.open, false);
});

test('clicking the backdrop closes the viewer, clicking the video does not', () => {
  const page = boot();
  const [card] = page.cards();

  card.querySelector('[data-clip-open]').click();

  /* A click that reaches the dialog element itself landed on the backdrop —
     anything on the panel would have the panel as its target. */
  page.stage().querySelector('video').click();
  assert.equal(page.viewer().open, true, 'a click on the video keeps it playing');

  page.viewer().click();
  assert.equal(page.viewer().open, false, 'a click on the backdrop dismisses it');
  assert.equal(page.stage().querySelector('video'), null, 'and the copy is cleared');
});

test('visibility changes never start a rail clip', () => {
  const page = boot();
  const [card] = page.cards();

  Object.defineProperty(page.window.document, 'hidden', { configurable: true, value: true });
  page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));
  assert.equal(page.videoIn(card).paused, true);

  Object.defineProperty(page.window.document, 'hidden', { configurable: true, value: false });
  page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));
  assert.equal(page.videoIn(card).paused, true);
});

test('unloading the section closes the viewer and stops playback', () => {
  const page = boot();
  const [card] = page.cards();
  const section = page.window.document.getElementById('section-clips');

  card.querySelector('[data-clip-open]').click();
  assert.equal(page.stage().querySelector('video').paused, false);

  dispatchSectionEvent(page.window, 'shopify:section:unload', section);

  assert.equal(page.videoIn(card).paused, true, 'nothing keeps playing after unload');
  assert.equal(page.viewer().open, false);
  assert.equal(page.stage().querySelector('video'), null);
});

test('a section re-rendered by the theme editor is wired against the fresh DOM', () => {
  const page = boot();
  const section = page.window.document.getElementById('section-clips');

  /* The theme editor swaps the section's markup and then announces it. The
     script is not re-evaluated, so the load handler is the only thing that can
     bind the replacement. */
  section.innerHTML = customerVideosSection({ id: 'clips', clips: 2 });
  dispatchSectionEvent(page.window, 'shopify:section:load', section);

  const [card] = page.cards();
  card.querySelector('[data-clip-open]').click();
  assert.equal(page.viewer().open, true);
  assert.equal(page.stage().querySelector('video').paused, false, 'the replacement viewer plays');
});

test('re-initialising over a live rail leaves one working viewer', () => {
  const page = boot();
  const section = page.window.document.getElementById('section-clips');

  dispatchSectionEvent(page.window, 'shopify:section:load', section);

  page.cards()[0].querySelector('[data-clip-open]').click();
  assert.equal(page.viewer().open, true);
  assert.equal(page.stage().querySelectorAll('video').length, 1);
});

test('a rail with no clips initialises and unloads without error', () => {
  const page = boot(customerVideosSection({ empty: true }));
  const section = page.window.document.getElementById('section-clips');

  assert.equal(page.cards().length, 0);

  dispatchSectionEvent(page.window, 'shopify:section:load', section);
  dispatchSectionEvent(page.window, 'shopify:section:unload', section);
});

test('every rail on the page opens its own viewer', () => {
  const page = boot(
    customerVideosSection({ id: 'one' }) + customerVideosSection({ id: 'two' })
  );

  const rails = Array.from(page.window.document.querySelectorAll('[data-clips]'));
  assert.equal(rails.length, 2);

  rails.forEach((rail) => {
    const card = rail.querySelector('[data-clip]');
    card.querySelector('[data-clip-open]').click();
    assert.equal(rail.querySelector('[data-clips-viewer]').open, true);
    assert.equal(rail.querySelector('[data-clips-stage] video').paused, false);
    assert.equal(card.querySelector('video').paused, true);
  });
});
