'use strict';

/* Behavioural cover for the hero carousel. Every rule asserted here stands for
   a bug the section has already had: autoplay stuck on load under a stationary
   cursor, slides left reachable by assistive tech while hidden, and timers
   outliving the section they belong to.

   The carousel is the theme's only autoplaying component, so it is also the
   only one where a leaked interval keeps mutating the DOM after the section is
   gone. Those rules can't be grepped for — they only show up when the thing
   runs. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootSection, dispatchSectionEvent, stubMatchMedia, tick } = require('./helpers/section.js');
const { heroSection } = require('./helpers/fixtures.js');

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function bootHero(html, { reducedMotion = false } = {}) {
  let setMedia = null;
  const window = bootSection('hero.liquid', html, {
    beforeScript(win) {
      setMedia = stubMatchMedia(win, { [REDUCED_MOTION]: reducedMotion });
    }
  });
  return {
    window,
    setReducedMotion: (matches) => setMedia(REDUCED_MOTION, matches)
  };
}

const heroEl = (window, id = 'hero') => window.document.querySelector(`[data-hid="${id}"]`);

const slidesOf = (window, id = 'hero') =>
  Array.prototype.slice.call(heroEl(window, id).querySelectorAll('[data-hero-slide]'));

const activeIndex = (window, id = 'hero') =>
  slidesOf(window, id).findIndex((slide) => slide.hasAttribute('data-active'));

const currentDot = (window, id = 'hero') =>
  Array.prototype.slice
    .call(heroEl(window, id).querySelectorAll('[data-hero-dot]'))
    .findIndex((dot) => dot.getAttribute('aria-current') === 'true');

const click = (window, selector, id = 'hero') =>
  heroEl(window, id)
    .querySelector(selector)
    .dispatchEvent(new window.Event('click', { bubbles: true }));

const fire = (window, target, type) =>
  target.dispatchEvent(new window.Event(type, { bubbles: true }));

test('autoplay advances to the next slide on its interval', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));

  assert.equal(activeIndex(window), 0);

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'autoplay never advanced the carousel');
});

test('autoplay stays off when the section opts out', async () => {
  const { window } = bootHero(heroSection({ autoplay: false, interval: 60 }));

  await tick(window, 120);

  assert.equal(activeIndex(window), 0, 'a hero with autoplay disabled advanced anyway');
});

test('the active slide is the only one exposed to assistive tech', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));

  await tick(window, 100);

  const slides = slidesOf(window);
  slides.forEach((slide, i) => {
    const active = i === activeIndex(window);
    assert.equal(
      slide.hasAttribute('aria-hidden'),
      !active,
      `slide ${i} has the wrong aria-hidden state`
    );
    assert.equal(slide.hasAttribute('inert'), !active, `slide ${i} has the wrong inert state`);
  });

  assert.equal(currentDot(window), activeIndex(window), 'the dots fell out of sync with the slides');
});

/* Autoplay used to pause on hover and on focus. On a hero that fills the
   viewport that meant the pointer merely crossing it parked the carousel, and
   because the paused flag latched, every later restart — clicking a dot,
   returning to the tab — was a no-op. Nothing the customer does may stop the
   carousel now, so each of those gestures gets an assertion of its own. */

test('the pointer resting on the hero does not stop autoplay', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));

  fire(window, heroEl(window), 'mouseenter');
  fire(window, heroEl(window), 'mousemove');

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'a pointer over the hero parked the carousel');
});

test('the pointer moving on and off the hero does not stop autoplay', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));

  fire(window, heroEl(window), 'mousemove');
  fire(window, heroEl(window), 'mouseleave');
  fire(window, heroEl(window), 'mousemove');

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'autoplay did not survive the pointer crossing the hero');
});

test('focus inside the hero does not stop autoplay', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));

  const dot = heroEl(window).querySelector('[data-hero-dot]');
  dot.focus();
  fire(window, dot, 'focusin');

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'focusing a control parked the carousel');
});

test('autoplay keeps running after the customer navigates by hand', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));
  const hero = heroEl(window);

  /* The gesture a real customer makes: pointer onto the hero, focus lands on
     the dot, then the click. Any one of those used to be enough to stop it for
     good. */
  fire(window, hero, 'mousemove');
  const dot = hero.querySelectorAll('[data-hero-dot]')[2];
  dot.focus();
  fire(window, dot, 'focusin');
  dot.dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(activeIndex(window), 2, 'the dot did not select its slide');

  await tick(window, 100);

  assert.equal(activeIndex(window), 0, 'autoplay never resumed after a manual jump');
});

test('a hidden tab stops autoplay and returning resumes it', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));
  const { document } = window;

  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  fire(window, document, 'visibilitychange');

  await tick(window, 120);
  assert.equal(activeIndex(window), 0, 'autoplay kept advancing in a background tab');

  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  fire(window, document, 'visibilitychange');

  await tick(window, 100);
  assert.equal(activeIndex(window), 1, 'autoplay never resumed when the tab came back');
});

test('reduced motion suppresses autoplay until the preference changes', async () => {
  const hero = bootHero(heroSection({ interval: 60 }), { reducedMotion: true });
  const window = hero.window;

  await tick(window, 120);
  assert.equal(activeIndex(window), 0, 'autoplay ran against a reduced-motion preference');

  hero.setReducedMotion(false);

  await tick(window, 100);
  assert.equal(activeIndex(window), 1, 'autoplay never started after the preference was lifted');
});

test('the arrows step through the slides and wrap around', () => {
  const { window } = bootHero(heroSection({ slides: 3, autoplay: false }));

  click(window, '[data-hero-next]');
  assert.equal(activeIndex(window), 1);

  click(window, '[data-hero-prev]');
  assert.equal(activeIndex(window), 0);

  click(window, '[data-hero-prev]');
  assert.equal(activeIndex(window), 2, 'stepping back from the first slide should wrap to the last');

  click(window, '[data-hero-next]');
  assert.equal(activeIndex(window), 0, 'stepping past the last slide should wrap to the first');
});

test('a dot jumps to its slide and moves aria-current with it', () => {
  const { window } = bootHero(heroSection({ slides: 3, autoplay: false }));

  const dots = heroEl(window).querySelectorAll('[data-hero-dot]');
  dots[2].dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(activeIndex(window), 2);
  assert.equal(currentDot(window), 2);
});

test('advancing by hand restarts the interval instead of leaving a partial one', async () => {
  const { window } = bootHero(heroSection({ interval: 200 }));

  /* Click 120ms in. Left alone, the original interval fires at 200ms; a
     restarted one fires at 320ms. Checking at 260ms puts an equal margin on
     either side of the answer. */
  await tick(window, 120);
  click(window, '[data-hero-next]');
  assert.equal(activeIndex(window), 1);

  await tick(window, 140);

  assert.equal(
    activeIndex(window),
    1,
    'the interval left running from before the click advanced the carousel early'
  );
});

const leavingIndex = (window, id = 'hero') =>
  slidesOf(window, id).findIndex((slide) => slide.hasAttribute('data-leaving'));

test('the carousel starts from the slide that is actually on screen', async () => {
  /* Re-initialising against a carousel that had already rotated used to reset
     the index to 0 regardless. The next advance then held slide 0 opaque — a
     slide nobody could see — while the one that was showing faded out with
     nothing behind it, flashing the page background through the hero. */
  const { window } = bootHero(heroSection({ interval: 60, active: 2 }));

  assert.equal(activeIndex(window), 2, 'fixture should open on the third slide');

  await tick(window, 100);

  assert.equal(activeIndex(window), 0, 'advancing from slide 2 should wrap to slide 0');
  assert.equal(leavingIndex(window), 2, 'the wrong slide was held opaque through the crossfade');
});

test('a rotation hands keyboard focus to the incoming dot, not to nowhere', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));

  /* A keyboard user resting on the first slide's call to action. Marking that
     slide inert — which is what makes it invisible to assistive tech — blurs
     whatever it holds, so focus has to be placed somewhere deliberate first or
     it lands on <body> and the next Tab restarts from the top of the page.
     jsdom does not implement inert's blur, so what is asserted here is the
     deliberate move, which is the part the theme controls. */
  window.document.querySelector('[data-slide-cta="0"]').focus();

  await tick(window, 100);

  assert.equal(activeIndex(window), 1);
  assert.equal(
    window.document.activeElement,
    window.document.querySelector('[data-dot="1"]'),
    'focus was left inside a slide that had just been hidden from assistive tech'
  );
});

test('a rotation leaves focus alone when it is outside the carousel', async () => {
  const { window } = bootHero(`<button id="elsewhere">other</button>${heroSection({ interval: 60 })}`);

  const outside = window.document.getElementById('elsewhere');
  outside.focus();

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'the carousel should still have advanced');
  assert.equal(window.document.activeElement, outside, 'the carousel stole focus from the page');
});

test('unloading the section stops autoplay for good', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));
  const section = window.document.getElementById('section-hero');

  dispatchSectionEvent(window, 'shopify:section:unload', section);

  const settled = activeIndex(window);
  await tick(window, 200);

  assert.equal(settled, activeIndex(window), 'a timer outlived the section that started it');
  assert.equal(heroEl(window).heroCleanup, null, 'the cleanup handle was left dangling');
});

test('a section re-rendered by the theme editor is wired against the fresh DOM', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));
  const section = window.document.getElementById('section-hero');

  section.innerHTML = heroSection({ interval: 60 })
    .replace(/^[\s\S]*?<div class="hero"/, '<div class="hero"')
    .replace(/<\/div>\s*$/, '');
  dispatchSectionEvent(window, 'shopify:section:load', section);

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'the re-rendered carousel never started autoplaying');
  assert.equal(
    window.document.querySelectorAll('[data-hero]').length,
    1,
    'the fixture should leave exactly one hero on the page'
  );
});

test('re-initialising a hero does not leave two intervals running', async () => {
  const { window } = bootHero(heroSection({ interval: 60 }));
  const section = window.document.getElementById('section-hero');

  /* Same DOM, initialised twice. The first carousel's interval has to be torn
     down, or two timers race and the carousel skips slides. */
  dispatchSectionEvent(window, 'shopify:section:load', section);

  await tick(window, 100);

  assert.equal(activeIndex(window), 1, 'a doubled interval advanced the carousel more than once');
});

test('every hero on the page runs its own carousel', async () => {
  const { window } = bootHero(
    `${heroSection({ id: 'one', interval: 60 })}${heroSection({ id: 'two', interval: 60 })}`
  );

  click(window, '[data-hero-next]', 'two');
  assert.equal(activeIndex(window, 'two'), 1);
  assert.equal(activeIndex(window, 'one'), 0, 'the two heroes are sharing a slide index');

  await tick(window, 100);

  assert.equal(activeIndex(window, 'one'), 1, 'the first hero never started autoplaying');
});

test('a single-slide hero initialises and unloads without a carousel', async () => {
  const { window } = bootHero(heroSection({ slides: 1, interval: 60 }));
  const section = window.document.getElementById('section-hero');

  await tick(window, 100);
  assert.equal(activeIndex(window), 0);

  dispatchSectionEvent(window, 'shopify:section:unload', section);

  assert.equal(activeIndex(window), 0, 'unloading a hero with nothing to rotate changed the slide');
});

/* Deferred artwork. Every slide sits in the same grid cell, so the ones behind
   the active one are inside the viewport and `loading="lazy"` does not defer
   them — the browser decides from layout geometry, and `visibility: hidden`
   still lays out. The section therefore ships their URLs in data-src and
   data-srcset, and these rules cover the promotion that has to make up for it:
   nothing extra during load, the next slide ready before the crossfade needs
   it, and sources ahead of images so a phone does not fetch the desktop crop
   first. */

const mediaOf = (window, i, id = 'hero') => {
  const slide = slidesOf(window, id)[i];
  return { source: slide.querySelector('source'), image: slide.querySelector('img') };
};

const isDeferred = ({ source, image }) =>
  !source.hasAttribute('srcset') &&
  source.hasAttribute('data-srcset') &&
  !image.hasAttribute('src') &&
  !image.hasAttribute('srcset') &&
  image.hasAttribute('data-src');

const isPromoted = ({ source, image }) =>
  source.hasAttribute('srcset') &&
  !source.hasAttribute('data-srcset') &&
  image.hasAttribute('src') &&
  image.hasAttribute('srcset') &&
  !image.hasAttribute('data-src');

test('slides behind the first request no artwork while the page is still loading', () => {
  const { window } = bootHero(heroSection({ autoplay: false }));

  assert.equal(
    mediaOf(window, 0).image.getAttribute('src'),
    '/desktop-0-1200.jpg',
    'the slide on screen must carry its own URL, not wait for script'
  );
  assert.ok(isDeferred(mediaOf(window, 1)), 'the second slide fetched during load');
  assert.ok(isDeferred(mediaOf(window, 2)), 'the third slide fetched during load');
});

test('the slide after the one on screen is promoted once the page has loaded', async () => {
  const { window } = bootHero(heroSection({ autoplay: false }));

  await tick(window, 0);

  assert.ok(isPromoted(mediaOf(window, 1)), 'the next slide was never promoted');
  assert.ok(isDeferred(mediaOf(window, 2)), 'promotion ran further ahead than the next slide');
});

test('a promoted slide is given its sources before its image', async () => {
  const { window } = bootHero(heroSection({ autoplay: false }));
  const { source, image } = mediaOf(window, 1);

  /* An <img> handed its src first picks from its own srcset immediately and
     re-evaluates only once the <source> has one — on a phone that is the
     desktop crop, fetched and then thrown away. */
  const order = [];
  const observer = new window.MutationObserver((records) => {
    records.forEach((record) => {
      if (record.target === source && record.attributeName === 'srcset') order.push('source');
      if (record.target === image && record.attributeName === 'src') order.push('image');
    });
  });
  observer.observe(slidesOf(window)[1], {
    attributes: true,
    subtree: true,
    attributeFilter: ['src', 'srcset']
  });

  await tick(window, 0);
  observer.disconnect();

  assert.deepEqual(order, ['source', 'image'], 'the image was given its src before the source');
});

test('jumping to a slide promotes it and the one after it', async () => {
  const { window } = bootHero(heroSection({ slides: 5, autoplay: false }));

  await tick(window, 0);
  assert.ok(isDeferred(mediaOf(window, 3)), 'the fixture should start with slide four deferred');

  heroEl(window)
    .querySelectorAll('[data-hero-dot]')[3]
    .dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(activeIndex(window), 3);
  assert.ok(isPromoted(mediaOf(window, 3)), 'the slide the customer asked for has no artwork');
  assert.ok(isPromoted(mediaOf(window, 4)), 'the jump left the rotation with nothing warmed ahead');
});

test('autoplay stays one slide ahead of itself', async () => {
  const { window } = bootHero(heroSection({ slides: 4, interval: 60 }));

  await tick(window, 100);

  assert.equal(activeIndex(window), 1);
  assert.ok(isPromoted(mediaOf(window, 2)), 'the slide about to arrive was not promoted');
  assert.ok(isDeferred(mediaOf(window, 3)), 'autoplay promoted further ahead than it needs to');
});

test('a carousel re-initialised on a later slide promotes what is on screen', () => {
  const { window } = bootHero(heroSection({ autoplay: false, active: 2 }));

  assert.ok(
    isPromoted(mediaOf(window, 2)),
    'a carousel that had already rotated was left showing an empty slide'
  );
});
