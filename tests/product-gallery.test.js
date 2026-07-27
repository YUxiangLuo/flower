'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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
      currentSrc: image.hasAttribute('data-lightbox-image') ? null : ''
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
