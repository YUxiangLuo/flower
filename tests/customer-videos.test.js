'use strict';

/* The clips rail plays what is on screen and stops what is not. None of that is
   visible in the markup — the section renders every <video> without `autoplay`
   on purpose, so a rail that quietly stopped observing, or one that left every
   clip playing off screen, looks identical in the source and behaves nothing
   alike on a phone.

   What is deliberately not asserted here: the focus trap and the top layer.
   Those are the browser's, which is why the section uses <dialog>. Escape now
   passes through the section's cancel handler so the exit transition can
   finish, and that small piece of application logic is covered below. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootSection,
  dispatchSectionEvent,
  stubIntersectionObserver,
  stubMatchMedia
} = require('./helpers/section.js');
const { customerVideosSection } = require('./helpers/fixtures.js');

const REDUCED = '(prefers-reduced-motion: reduce)';

function boot(html = customerVideosSection(), { reduced = false } = {}) {
  let observer;
  let setMedia;

  const window = bootSection('customer-videos.liquid', html, {
    beforeScript(win) {
      observer = stubIntersectionObserver(win);
      setMedia = stubMatchMedia(win, { [REDUCED]: reduced });
    }
  });

  const cards = () => Array.from(window.document.querySelectorAll('[data-clip]'));
  const videoIn = (card) => card.querySelector('video');

  return {
    window,
    observer,
    setReduced: (value) => setMedia(REDUCED, value),
    cards,
    videoIn,
    viewer: () => window.document.querySelector('[data-clips-viewer]'),
    stage: () => window.document.querySelector('[data-clips-stage]')
  };
}

test('a clip that scrolls into view plays, and pauses when it leaves', () => {
  const page = boot();
  const [first, second] = page.cards();

  assert.equal(page.videoIn(first).paused, true, 'nothing plays before anything is on screen');

  page.observer.setVisible(first, true);
  assert.equal(page.videoIn(first).paused, false);
  assert.equal(page.videoIn(second).paused, true, 'an off-screen clip stays paused');

  page.observer.setVisible(first, false);
  assert.equal(page.videoIn(first).paused, true);
});

/* The rail plays one clip, not every clip that qualifies. It is a row of
   phone-shaped cards, so a desktop viewport holds four or five at once, and
   starting all of them meant four 1080p streams pulling and decoding in
   parallel for as long as the customer stayed on the section. Which one wins is
   the behaviour worth pinning: the source cannot show it, and getting it wrong
   is either silence or the old pile-up. */

test('only the most visible clip plays when several share the screen', () => {
  const page = boot(customerVideosSection({ clips: 3 }));
  const [first, second, third] = page.cards();

  page.observer.setIntersectionRatio(first, 0.6);
  page.observer.setIntersectionRatio(second, 0.9);
  page.observer.setIntersectionRatio(third, 0.55);

  assert.equal(page.videoIn(second).paused, false, 'the clip showing most of itself should play');
  assert.equal(page.videoIn(first).paused, true, 'a less visible clip played alongside it');
  assert.equal(page.videoIn(third).paused, true, 'a less visible clip played alongside it');
});

test('playback follows the rail as one clip gives way to another', () => {
  const page = boot(customerVideosSection({ clips: 3 }));
  const [first, second] = page.cards();

  page.observer.setIntersectionRatio(first, 0.9);
  assert.equal(page.videoIn(first).paused, false);

  /* The customer scrolls the rail on: the second card is now the fuller one. */
  page.observer.setIntersectionRatio(first, 0.3);
  page.observer.setIntersectionRatio(second, 0.8);

  assert.equal(page.videoIn(second).paused, false, 'the clip taking over never started');
  assert.equal(page.videoIn(first).paused, true, 'the clip being scrolled away kept playing');
});

test('a tie goes to the clip the customer reached first', () => {
  const page = boot(customerVideosSection({ clips: 3 }));
  const [first, second] = page.cards();

  page.observer.setIntersectionRatio(first, 0.8);
  page.observer.setIntersectionRatio(second, 0.8);

  assert.equal(page.videoIn(first).paused, false, 'an equal tie should hold the earlier clip');
  assert.equal(page.videoIn(second).paused, true, 'both halves of a tie played');
});

test('a clip barely on screen is not worth starting', () => {
  const page = boot(customerVideosSection({ clips: 3 }));
  const [first] = page.cards();

  page.observer.setIntersectionRatio(first, 0.3);

  assert.equal(page.videoIn(first).paused, true, 'a clip under the threshold started anyway');
});

test('reduced motion suppresses autoplay until the preference changes', () => {
  const page = boot(customerVideosSection(), { reduced: true });
  const [card] = page.cards();

  page.observer.setVisible(card, true);
  assert.equal(page.videoIn(card).paused, true, 'reduced motion means no autoplay');

  page.setReduced(false);
  assert.equal(page.videoIn(card).paused, false, 'clearing the preference resumes what is on screen');

  page.setReduced(true);
  assert.equal(page.videoIn(card).paused, true, 'setting it again stops the clip');
});

test('opening the viewer plays a copy with sound and stands the rail down', () => {
  const page = boot();
  const [card] = page.cards();

  page.observer.setVisible(card, true);
  assert.equal(page.videoIn(card).paused, false);

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

  page.observer.setVisible(card, true);
  card.querySelector('[data-clip-open]').click();
  page.window.document.querySelector('[data-clips-close]').click();

  assert.equal(page.viewer().open, false);
  assert.equal(page.stage().querySelector('video'), null, 'the copy is discarded');
  assert.equal(page.videoIn(card).paused, false, 'the on-screen clip resumes');
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

  page.observer.setVisible(card, true);
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
  assert.equal(page.videoIn(card).paused, false);
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

  page.observer.setVisible(card, true);
  card.querySelector('[data-clip-open]').click();

  /* A click that reaches the dialog element itself landed on the backdrop —
     anything on the panel would have the panel as its target. */
  page.stage().querySelector('video').click();
  assert.equal(page.viewer().open, true, 'a click on the video keeps it playing');

  page.viewer().click();
  assert.equal(page.viewer().open, false, 'a click on the backdrop dismisses it');
  assert.equal(page.stage().querySelector('video'), null, 'and the copy is cleared');
});

test('a hidden tab pauses the rail and returning resumes it', () => {
  const page = boot();
  const [card] = page.cards();
  page.observer.setVisible(card, true);

  Object.defineProperty(page.window.document, 'hidden', { configurable: true, value: true });
  page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));
  assert.equal(page.videoIn(card).paused, true);

  Object.defineProperty(page.window.document, 'hidden', { configurable: true, value: false });
  page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));
  assert.equal(page.videoIn(card).paused, false);
});

test('unloading the section stops playback and releases the observer', () => {
  const page = boot();
  const [card] = page.cards();
  const section = page.window.document.getElementById('section-clips');

  page.observer.setVisible(card, true);
  assert.equal(page.observer.observed().length, 2, 'both clips are being watched');

  dispatchSectionEvent(page.window, 'shopify:section:unload', section);

  assert.equal(page.videoIn(card).paused, true, 'nothing keeps playing after unload');
  assert.equal(page.observer.observed().length, 0, 'the observer is disconnected, not leaked');
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
  page.observer.setVisible(card, true);
  assert.equal(page.videoIn(card).paused, false, 'the replacement rail plays');
});

test('re-initialising over a live rail does not leave two observers watching', () => {
  const page = boot();
  const section = page.window.document.getElementById('section-clips');

  dispatchSectionEvent(page.window, 'shopify:section:load', section);

  assert.equal(
    page.observer.observed().length,
    2,
    'the previous observer was disconnected before the new one took over'
  );
});

test('a rail with no clips initialises and unloads without error', () => {
  const page = boot(customerVideosSection({ empty: true }));
  const section = page.window.document.getElementById('section-clips');

  assert.equal(page.cards().length, 0);
  assert.equal(page.observer.observed().length, 0);

  dispatchSectionEvent(page.window, 'shopify:section:load', section);
  dispatchSectionEvent(page.window, 'shopify:section:unload', section);
});

test('every rail on the page runs its own clips', () => {
  const page = boot(
    customerVideosSection({ id: 'one' }) + customerVideosSection({ id: 'two' })
  );

  const rails = Array.from(page.window.document.querySelectorAll('[data-clips]'));
  assert.equal(rails.length, 2);

  rails.forEach((rail) => {
    const card = rail.querySelector('[data-clip]');
    page.observer.setVisible(card, true);
    assert.equal(card.querySelector('video').paused, false);
  });
});
