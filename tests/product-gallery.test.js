'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { bootSection, tick } = require('./helpers/section.js');
const { productSection } = require('./helpers/fixtures.js');

function installImageHarness(window) {
  const states = new WeakMap();
  const prototype = window.HTMLImageElement.prototype;
  const nativeSrc = Object.getOwnPropertyDescriptor(prototype, 'src');
  const fullRequests = [];

  Array.from(window.document.images).forEach((image) => {
    const isThumb = Boolean(image.closest('[data-thumb]'));
    states.set(image, {
      complete: isThumb,
      naturalWidth: isThumb ? 200 : 0,
      currentSrc: image.hasAttribute('data-lightbox-image') ? null : '',
      decodePromise: null
    });
  });

  Object.defineProperties(prototype, {
    complete: {
      configurable: true,
      get() {
        const state = states.get(this);
        return state ? state.complete : false;
      }
    },
    naturalWidth: {
      configurable: true,
      get() {
        const state = states.get(this);
        return state ? state.naturalWidth : 0;
      }
    },
    currentSrc: {
      configurable: true,
      get() {
        const state = states.get(this);
        if (state && state.currentSrc !== null) return state.currentSrc;
        return nativeSrc.get.call(this);
      }
    },
    src: {
      configurable: true,
      get() {
        return nativeSrc.get.call(this);
      },
      set(value) {
        nativeSrc.set.call(this, value);
        const state = states.get(this);
        if (state && state.currentSrc === null) {
          state.complete = false;
          state.naturalWidth = 0;
        }
      }
    }
  });

  Object.defineProperty(prototype, 'decode', {
    configurable: true,
    value() {
      const state = states.get(this);
      return state && state.decodePromise ? state.decodePromise : Promise.resolve();
    }
  });

  window.Image = class ControlledImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.decoding = '';
      this.fetchPriority = '';
      this._src = '';
      this.cancelled = false;
    }

    get src() {
      return this._src;
    }

    set src(value) {
      this._src = new URL(value, window.document.baseURI).href;
      fullRequests.push(this);
    }

    removeAttribute(name) {
      if (name !== 'src') return;
      this._src = '';
      this.cancelled = true;
    }

    decode() {
      return Promise.resolve();
    }

    resolve() {
      if (this.onload) this.onload();
    }
  };

  function stateFor(image) {
    const state = states.get(image);
    assert.ok(state, 'the image was not registered with the controlled loader');
    return state;
  }

  return {
    fullRequests,
    pending(image) {
      const state = stateFor(image);
      state.complete = false;
      state.naturalWidth = 0;
    },
    cache(image) {
      const state = stateFor(image);
      state.complete = true;
      state.naturalWidth = 800;
    },
    holdDecode(image) {
      const state = stateFor(image);
      let release;
      state.decodePromise = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        state.decodePromise = null;
        release();
      };
    },
    setCurrentSrc(image, value) {
      stateFor(image).currentSrc = new URL(value, window.document.baseURI).href;
    },
    load(image) {
      const state = stateFor(image);
      state.complete = true;
      state.naturalWidth = 800;
      image.dispatchEvent(new window.Event('load'));
    },
    error(image) {
      const state = stateFor(image);
      state.complete = true;
      state.naturalWidth = 0;
      image.dispatchEvent(new window.Event('error'));
    }
  };
}

function bootGallery(options = {}) {
  let images;
  const window = bootSection('product.liquid', productSection(options), {
    beforeScript(win) {
      images = installImageHarness(win);
    }
  });
  const root = window.document.querySelector('[data-product]');
  return {
    window,
    root,
    images,
    stageImages: Array.from(root.querySelectorAll('[data-stage-item] img')),
    lightbox: root.querySelector('[data-lightbox]'),
    lightboxImage: root.querySelector('[data-lightbox-image]')
  };
}

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pointer(window, element, type, options = {}) {
  const event = new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 0,
    clientY: 0,
    ...options
  });
  element.dispatchEvent(event);
  return event;
}

function pointerClick(window, element, options = {}) {
  return pointer(window, element, 'click', {
    detail: 1,
    ...options
  });
}

function swipe(window, element, options = {}) {
  const {
    startX = 200,
    startY = 100,
    endX = 100,
    endY = 100,
    pointerType = 'touch'
  } = options;

  pointer(window, element, 'pointerdown', {
    clientX: startX,
    clientY: startY,
    pointerType
  });
  const moveEvent = pointer(window, element, 'pointermove', {
    clientX: endX,
    clientY: endY,
    pointerType
  });
  pointer(window, element, 'pointerup', {
    clientX: endX,
    clientY: endY,
    pointerType
  });

  return moveEvent;
}

function activeMediaId(root) {
  return root.querySelector('[data-stage-item].is-active').getAttribute('data-media-id');
}

test('the stage arrows step through every media item, wrap, and keep thumbnails in sync', () => {
  const { window, root, lightbox } = bootGallery({ videoFallback: true });
  const thumbs = Array.from(root.querySelectorAll('[data-thumb]'));
  const previous = root.querySelector('[data-gallery-prev]');
  const next = root.querySelector('[data-gallery-next]');

  assert.equal(activeMediaId(root), '1');

  click(window, next);
  assert.equal(activeMediaId(root), '2');
  assert.equal(thumbs[1].getAttribute('aria-current'), 'true');

  click(window, next);
  assert.equal(activeMediaId(root), '3', 'the stage control skipped non-image media');

  click(window, next);
  assert.equal(activeMediaId(root), '1', 'next did not wrap to the first media item');

  click(window, previous);
  assert.equal(activeMediaId(root), '3', 'previous did not wrap to the last media item');
  assert.equal(thumbs[2].getAttribute('aria-current'), 'true');
  assert.equal(lightbox.open, false, 'stage navigation unexpectedly opened the lightbox');
});

test('stage arrows scroll only the thumbnail rail, never the document', () => {
  const { window, root } = bootGallery();
  const rail = root.querySelector('[data-thumbs]');
  const thumbs = Array.from(root.querySelectorAll('[data-thumb]'));
  let documentScrolls = 0;

  window.Element.prototype.scrollIntoView = () => {
    documentScrolls += 1;
  };
  rail.scrollLeft = 0;
  rail.getBoundingClientRect = () => ({ left: 0, right: 100 });
  thumbs[1].getBoundingClientRect = () => ({ left: 120, right: 170 });

  click(window, root.querySelector('[data-gallery-next]'));

  assert.equal(rail.scrollLeft, 70, 'the active thumbnail stayed outside the rail viewport');
  assert.equal(documentScrolls, 0, 'stage navigation invoked document-scrolling behavior');
});

test('touch swipes traverse image media, skip video, and wrap', () => {
  const { window, root, lightbox } = bootGallery({ videoFallback: true });
  const gallery = root.querySelector('[data-gallery]');
  const firstZoom = root.querySelector('[data-zoom-open="0"]');
  const secondZoom = root.querySelector('[data-zoom-open="1"]');
  const firstImage = firstZoom.querySelector('img');
  const secondImage = secondZoom.querySelector('img');

  assert.equal(gallery.hasAttribute('data-gallery-swipe-enabled'), true);
  assert.equal(activeMediaId(root), '1');

  swipe(window, firstImage);
  assert.equal(activeMediaId(root), '2');

  swipe(window, secondImage);
  assert.equal(activeMediaId(root), '1');

  swipe(window, firstImage, { startX: 100, endX: 200 });
  assert.equal(activeMediaId(root), '2');
  assert.equal(root.querySelectorAll('[data-thumb]')[1].getAttribute('aria-current'), 'true');
  assert.equal(lightbox.open, false);
});

test('a completed image drag suppresses its zoom click while a tap still opens the lightbox', () => {
  const { window, root, lightbox } = bootGallery();
  const firstZoom = root.querySelector('[data-zoom-open="0"]');
  const secondZoom = root.querySelector('[data-zoom-open="1"]');
  const firstImage = firstZoom.querySelector('img');

  swipe(window, firstImage);
  pointerClick(window, firstImage);
  assert.equal(lightbox.open, false);

  click(window, secondZoom);
  assert.equal(lightbox.open, true);
});

test('a new touch clears stale click suppression left by a short drag', () => {
  const { window, root, lightbox } = bootGallery();
  const firstZoom = root.querySelector('[data-zoom-open="0"]');
  const firstImage = firstZoom.querySelector('img');

  swipe(window, firstImage, { endX: 170 });

  pointer(window, firstImage, 'pointerdown', { clientX: 200, clientY: 100 });
  pointer(window, firstImage, 'pointerup', { clientX: 200, clientY: 100 });
  pointerClick(window, firstImage);

  assert.equal(lightbox.open, true);
});

test('new mouse and keyboard activations are not mistaken for a prior touch drag', () => {
  {
    const { window, root, lightbox } = bootGallery();
    const firstZoom = root.querySelector('[data-zoom-open="0"]');
    const firstImage = firstZoom.querySelector('img');

    swipe(window, firstImage, { endX: 170 });
    pointer(window, firstImage, 'pointerdown', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 200,
      clientY: 100
    });
    pointer(window, firstImage, 'pointerup', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 200,
      clientY: 100
    });
    pointerClick(window, firstImage, {
      pointerId: 2,
      pointerType: 'mouse'
    });

    assert.equal(lightbox.open, true);
  }

  {
    const { window, root, lightbox } = bootGallery();
    const firstZoom = root.querySelector('[data-zoom-open="0"]');

    swipe(window, firstZoom.querySelector('img'), { endX: 170 });
    click(window, firstZoom);

    assert.equal(lightbox.open, true);
  }
});

test('short horizontal drags and vertical gestures do not change the active image', () => {
  const { window, root, lightbox } = bootGallery();
  const firstZoom = root.querySelector('[data-zoom-open="0"]');
  const firstImage = firstZoom.querySelector('img');

  const shortMove = swipe(window, firstImage, { endX: 170 });
  assert.equal(shortMove.defaultPrevented, true);
  assert.equal(activeMediaId(root), '1');

  pointerClick(window, firstImage);
  assert.equal(lightbox.open, false);

  const verticalMove = swipe(window, firstImage, {
    endX: 190,
    endY: 180
  });
  assert.equal(verticalMove.defaultPrevented, false);
  assert.equal(activeMediaId(root), '1');

  const diagonalMove = swipe(window, firstImage, {
    endX: 150,
    endY: 145
  });
  assert.equal(diagonalMove.defaultPrevented, false);
  assert.equal(activeMediaId(root), '1');

  click(window, firstZoom);
  assert.equal(lightbox.open, true);
});

test('closing after lightbox navigation focuses the active stage image', () => {
  const { window, root, lightbox } = bootGallery();
  const firstZoom = root.querySelector('[data-zoom-open="0"]');
  const secondZoom = root.querySelector('[data-zoom-open="1"]');

  firstZoom.focus();
  click(window, firstZoom);
  click(window, root.querySelector('[data-lightbox-next]'));
  click(window, root.querySelector('[data-lightbox-close]'));

  assert.equal(lightbox.open, false);
  assert.equal(activeMediaId(root), '2');
  assert.equal(window.document.activeElement, secondZoom);
});

test('mouse drags and touch gestures on non-image media are ignored', () => {
  const { window, root } = bootGallery({ videoFallback: true });
  const firstZoom = root.querySelector('[data-zoom-open="0"]');

  swipe(window, firstZoom.querySelector('img'), { pointerType: 'mouse' });
  assert.equal(activeMediaId(root), '1');

  click(window, root.querySelectorAll('[data-thumb]')[2]);
  assert.equal(activeMediaId(root), '3');

  swipe(window, root.querySelector('[data-stage-item][data-media-id="3"] video'));
  assert.equal(activeMediaId(root), '3');
});

test('a cancelled image swipe does not switch media or suppress the following tap', () => {
  const { window, root, lightbox } = bootGallery();
  const firstZoom = root.querySelector('[data-zoom-open="0"]');
  const firstImage = firstZoom.querySelector('img');

  pointer(window, firstImage, 'pointerdown', { clientX: 200, clientY: 100 });
  pointer(window, firstImage, 'pointermove', { clientX: 100, clientY: 100 });
  pointer(window, firstImage, 'pointercancel', { clientX: 100, clientY: 100 });

  assert.equal(activeMediaId(root), '1');
  click(window, firstZoom);
  assert.equal(lightbox.open, true);
});

test('the lightbox shares the active gallery preview before requesting the full image', async () => {
  const gallery = bootGallery();
  const { window, root, images, stageImages, lightbox, lightboxImage } = gallery;

  click(window, root.querySelector('[data-zoom-open="1"]'));
  images.setCurrentSrc(stageImages[1], 'two-preview.jpg');
  await tick(window, 80);

  assert.equal(lightbox.open, true);
  assert.equal(
    lightboxImage.src,
    'https://flower.test/two-thumb.jpg',
    'the lightbox abandoned its placeholder before the stage exposed currentSrc'
  );
  assert.equal(
    images.fullRequests.length,
    0,
    'the 2048px request started before the shared preview became visible'
  );
  assert.equal(lightbox.getAttribute('aria-busy'), 'true');
  assert.equal(root.querySelector('[data-lightbox-loader]').hidden, false);
  assert.equal(root.querySelector('[data-lightbox-counter]').textContent, 'Image 2 of 2');
  assert.equal(root.querySelector('[data-gallery-status]').hidden, false);
  assert.equal(stageImages[0].loading, 'lazy');
  assert.equal(stageImages[1].loading, 'eager');

  images.load(stageImages[1]);
  await tick(window);
  assert.equal(lightboxImage.src, 'https://flower.test/two-preview.jpg');
  assert.equal(images.fullRequests.length, 0);

  images.load(lightboxImage);
  await tick(window);

  assert.equal(root.querySelector('[data-gallery-status]').hidden, true);
  assert.equal(root.querySelector('[data-lightbox-loader]').hidden, true);
  assert.equal(lightbox.hasAttribute('aria-busy'), false);
  assert.equal(images.fullRequests.length, 1);
  assert.equal(images.fullRequests[0].src, 'https://flower.test/two-full.jpg');

  images.fullRequests[0].resolve();
  await tick(window);
  assert.equal(lightboxImage.src, 'https://flower.test/two-full.jpg');
});

test('rapid lightbox navigation cannot swap in a stale full-resolution image', async () => {
  const gallery = bootGallery();
  const { window, root, images, stageImages, lightboxImage } = gallery;

  images.setCurrentSrc(stageImages[0], 'one-preview.jpg');
  click(window, root.querySelector('[data-zoom-open="0"]'));
  await tick(window, 30);
  images.load(lightboxImage);
  await tick(window);
  const firstFull = images.fullRequests[0];
  assert.ok(firstFull, 'precondition: the first full image started loading');

  images.setCurrentSrc(stageImages[1], 'two-preview.jpg');
  click(window, root.querySelector('[data-lightbox-next]'));
  await tick(window, 30);
  assert.equal(lightboxImage.src, 'https://flower.test/two-preview.jpg');

  images.load(lightboxImage);
  await tick(window);
  const secondFull = images.fullRequests[1];
  assert.ok(secondFull, 'the second full image never started loading');
  assert.equal(firstFull.cancelled, true);

  firstFull.resolve();
  await tick(window);
  assert.equal(
    lightboxImage.src,
    'https://flower.test/two-preview.jpg',
    'the completed first request replaced the image selected later'
  );

  secondFull.resolve();
  await tick(window);
  assert.equal(lightboxImage.src, 'https://flower.test/two-full.jpg');
});

test('a failed lightbox preview exposes a retry and recovers cleanly', async () => {
  const gallery = bootGallery();
  const { window, root, images, stageImages, lightbox, lightboxImage } = gallery;

  images.setCurrentSrc(stageImages[1], 'two-preview.jpg');
  click(window, root.querySelector('[data-zoom-open="1"]'));
  await tick(window, 30);
  images.error(lightboxImage);
  await tick(window);

  assert.equal(root.querySelector('[data-lightbox-loader]').hidden, true);
  assert.equal(root.querySelector('[data-lightbox-error]').hidden, false);
  assert.equal(root.querySelector('[data-lightbox-error]').textContent, 'Image error');
  assert.equal(root.querySelector('[data-lightbox-retry]').hidden, false);
  assert.equal(lightbox.hasAttribute('aria-busy'), false);

  click(window, root.querySelector('[data-lightbox-retry]'));
  assert.equal(root.querySelector('[data-lightbox-loader]').hidden, false);
  await tick(window, 50);
  images.load(lightboxImage);
  await tick(window);

  assert.equal(root.querySelector('[data-lightbox-error]').hidden, true);
  assert.equal(root.querySelector('[data-lightbox-retry]').hidden, true);
  assert.equal(root.querySelector('[data-lightbox-loader]').hidden, true);
  assert.equal(images.fullRequests.length, 1);
});

test('the PDP gallery communicates loading, failure, retry, and completion', async () => {
  const gallery = bootGallery();
  const { window, root, images, stageImages } = gallery;
  const status = root.querySelector('[data-gallery-status]');
  const statusText = root.querySelector('[data-gallery-status-text]');
  const retry = root.querySelector('[data-gallery-retry]');

  assert.equal(status.hidden, false);
  assert.equal(statusText.textContent, 'Loading image 1 of 2…');
  assert.equal(stageImages[0].closest('[data-stage-item]').getAttribute('aria-busy'), 'true');

  images.load(stageImages[0]);
  await tick(window);
  assert.equal(status.hidden, true);
  assert.equal(root.querySelector('[data-gallery-live]').textContent, 'Image 1 of 2 loaded.');

  click(window, root.querySelectorAll('[data-thumb]')[1]);
  assert.equal(status.hidden, false);
  assert.equal(statusText.textContent, 'Loading image 2 of 2…');

  images.error(stageImages[1]);
  await tick(window);
  assert.equal(status.hidden, false);
  assert.equal(statusText.textContent, 'Image error');
  assert.equal(retry.hidden, false);

  click(window, retry);
  images.pending(stageImages[1]);
  assert.equal(statusText.textContent, 'Loading image 2 of 2…');
  assert.equal(retry.hidden, true);
  await tick(window, 30);
  images.load(stageImages[1]);
  await tick(window);
  assert.equal(status.hidden, true);
  assert.equal(root.querySelector('[data-gallery-live]').textContent, 'Image 2 of 2 loaded.');
});

test('a cached image replaces the previous error state while decode is pending', async () => {
  const gallery = bootGallery();
  const { window, root, images, stageImages } = gallery;
  const status = root.querySelector('[data-gallery-status]');
  const statusText = root.querySelector('[data-gallery-status-text]');
  const retry = root.querySelector('[data-gallery-retry]');

  images.error(stageImages[0]);
  await tick(window);
  assert.equal(statusText.textContent, 'Image error');

  images.cache(stageImages[1]);
  const releaseDecode = images.holdDecode(stageImages[1]);
  click(window, root.querySelectorAll('[data-thumb]')[1]);

  assert.equal(status.hidden, false);
  assert.equal(statusText.textContent, 'Loading image 2 of 2…');
  assert.equal(retry.hidden, true);
  assert.equal(
    stageImages[1].closest('[data-stage-item]').getAttribute('aria-busy'),
    'true'
  );

  releaseDecode();
  await tick(window);
  assert.equal(status.hidden, true);
});

test('an uploaded video fallback image can recover through the gallery retry', async () => {
  const gallery = bootGallery({ videoFallback: true });
  const { window, root, images, stageImages } = gallery;
  const status = root.querySelector('[data-gallery-status]');
  const statusText = root.querySelector('[data-gallery-status-text]');
  const retry = root.querySelector('[data-gallery-retry]');
  const videoImage = stageImages[2];
  const originalSrc = videoImage.getAttribute('src');
  const originalSrcset = videoImage.getAttribute('srcset');

  click(window, root.querySelectorAll('[data-thumb]')[2]);
  images.error(videoImage);
  await tick(window);

  assert.equal(statusText.textContent, 'Image error');
  assert.equal(retry.hidden, false);

  click(window, retry);
  images.pending(videoImage);
  assert.equal(statusText.textContent, 'Loading image 3 of 3…');
  assert.equal(retry.hidden, true);
  await tick(window, 30);

  assert.equal(videoImage.getAttribute('src'), originalSrc);
  assert.equal(videoImage.getAttribute('srcset'), originalSrcset);
  images.load(videoImage);
  await tick(window);
  assert.equal(status.hidden, true);
  assert.equal(root.querySelector('[data-gallery-live]').textContent, 'Image 3 of 3 loaded.');
});

test('retry restores responsive sources even when another media item is selected immediately', async () => {
  const gallery = bootGallery();
  const { window, root, images, stageImages } = gallery;
  const failedImage = stageImages[0];
  const original = {
    src: failedImage.getAttribute('src'),
    srcset: failedImage.getAttribute('srcset'),
    sizes: failedImage.getAttribute('sizes')
  };

  images.error(failedImage);
  await tick(window);
  click(window, root.querySelector('[data-gallery-retry]'));
  images.pending(failedImage);

  assert.equal(failedImage.hasAttribute('src'), false, 'precondition: retry resets src');
  assert.equal(failedImage.hasAttribute('srcset'), false, 'precondition: retry resets srcset');
  click(window, root.querySelectorAll('[data-thumb]')[1]);
  await tick(window, 30);

  assert.equal(failedImage.getAttribute('src'), original.src);
  assert.equal(failedImage.getAttribute('srcset'), original.srcset);
  assert.equal(failedImage.getAttribute('sizes'), original.sizes);
  assert.equal(failedImage.loading, 'lazy');

  click(window, root.querySelectorAll('[data-thumb]')[0]);
  assert.equal(root.querySelector('[data-gallery-status]').hidden, false);
  images.load(failedImage);
  await tick(window);
  assert.equal(root.querySelector('[data-gallery-status]').hidden, true);
});

/* Deferred external embeds. An <iframe> loads its src whether or not anything
   is showing it — display:none does not stop it, and Chrome exempts hidden
   frames from lazy loading besides — so the section renders one without a src
   and the gallery connects it when its item is shown. Nothing about that is
   visible in the markup: a broken connect step looks like a page that loads
   faster and plays nothing. */

const embedIn = (root) => root.querySelector('[data-stage-item] iframe');
const thumbAt = (root, i) => root.querySelector(`[data-thumb="${i}"]`);

test('the first external video keeps its src without gallery JavaScript', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'snippets', 'product-media-gallery.liquid'),
    'utf8'
  );
  assert.match(
    source,
    /elsif media\.media_type == 'external_video'[\s\S]*if forloop\.first[\s\S]*\{\{\s*media_embed\s*\}\}[\s\S]*else[\s\S]*replace:\s*' src=',\s*' data-src='/,
    'the active external video is deferred even when JavaScript never initialises the gallery'
  );
});

test('an external embed is not connected while its item is off stage', () => {
  const { root } = bootGallery({ embed: true });
  const embed = embedIn(root);

  assert.ok(embed, 'the fixture should carry an external embed');
  assert.equal(embed.hasAttribute('src'), false, 'the embed loaded before it was shown');
  assert.equal(
    embed.getAttribute('data-src'),
    'https://www.youtube.com/embed/keepsake',
    'the URL the gallery needs to connect later is gone'
  );
});

test('showing an external embed connects it', () => {
  const { window, root } = bootGallery({ embed: true });
  const embed = embedIn(root);

  click(window, thumbAt(root, 2));

  assert.equal(embed.getAttribute('src'), 'https://www.youtube.com/embed/keepsake');
  assert.equal(embed.hasAttribute('data-src'), false, 'the deferred URL was left behind');
});

test('an embed already on stage is connected without being asked for', () => {
  const { root } = bootGallery({ embedFirst: true });
  const embed = embedIn(root);

  /* A merchant can put the video first. Nothing clicks a thumbnail in that
     case, so the initial render is the only chance to connect it — miss it and
     the product opens on a blank stage. */
  assert.equal(embed.getAttribute('src'), 'https://www.youtube.com/embed/keepsake');
});

test('returning to an embed does not reload it', () => {
  const { window, root } = bootGallery({ embed: true });
  const embed = embedIn(root);

  click(window, thumbAt(root, 2));
  /* Standing in for playback state the customer built up: a reconnect would
     wipe it, and re-assigning the same src is enough to make a frame reload. */
  embed.setAttribute('src', 'https://www.youtube.com/embed/keepsake?t=42');

  click(window, thumbAt(root, 0));
  click(window, thumbAt(root, 2));

  assert.equal(
    embed.getAttribute('src'),
    'https://www.youtube.com/embed/keepsake?t=42',
    'the gallery reconnected an embed that was already running'
  );
});
