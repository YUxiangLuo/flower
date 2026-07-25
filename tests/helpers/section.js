'use strict';

/* Boots a section's JavaScript inside jsdom so the tests exercise real
   behaviour instead of matching source text.

   Section JS lives in a {% javascript %} tag. Liquid is not rendered inside
   that tag, so its contents are plain JavaScript we can run as-is. Shopify
   concatenates every section's tag into one file that loads once per page —
   it is *not* re-executed when a section re-renders — which is why these
   helpers evaluate it a single time and then drive shopify:section:load and
   shopify:section:unload by hand, exactly as the theme editor does. */

const fs = require('node:fs');
const path = require('node:path');
const { after } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const themeRoot = path.join(__dirname, '..', '..');

/* A jsdom window's timers run on Node's event loop and keep the process alive.
   Most sections settle on their own, but the hero carousel holds an autoplay
   interval for as long as it is on screen — exactly what it is supposed to do,
   and enough to hang the run after the last assertion. Close every window the
   file opened once its tests are done. */
const openWindows = [];

after(() => {
  while (openWindows.length > 0) {
    openWindows.pop().close();
  }
});

/* jsdom gives HTMLDialogElement a working `open` reflection but none of the
   methods, so a section that calls showModal() would throw here while working
   in every browser. Supply the smallest faithful versions: open state and a
   close event.

   Deliberately not simulated — the top layer, the focus trap, the backdrop, and
   Escape-to-close. Those are the browser's and are why the theme uses <dialog>
   in the first place; tests must not assert on them, because a passing
   assertion here would say nothing about a real page. */
function stubDialogMethods(window) {
  const proto = window.HTMLDialogElement.prototype;
  if (typeof proto.showModal === 'function') return;

  proto.show = function show() {
    this.setAttribute('open', '');
  };

  proto.showModal = function showModal() {
    this.setAttribute('open', '');
  };

  proto.close = function close(returnValue) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new window.Event('close'));
  };
}

function sectionScript(name) {
  const source = fs.readFileSync(path.join(themeRoot, 'sections', name), 'utf8');
  const match = source.match(/\{%\s*javascript\s*%\}([\s\S]*?)\{%\s*endjavascript\s*%\}/);
  if (!match) {
    throw new Error(`sections/${name} has no {% javascript %} block`);
  }
  return match[1];
}

/* Renders `html` into a page, applies any stubs, then runs the section script.
   `beforeScript` runs before evaluation so tests can install fetch stubs or
   spies that the section picks up on its first pass.

   `name` may be an array. Shopify concatenates every section's {% javascript %}
   into one file, so sections really do share a page and can talk to each other
   through document events — booting several here is the faithful way to test
   that conversation, not a convenience. They are evaluated in the order given,
   the way the concatenated file would run them. */
function bootSection(name, html, { beforeScript } = {}) {
  const names = Array.isArray(name) ? name : [name];
  /* location.assign cannot be stubbed in jsdom, so record the "not implemented"
     error it raises instead. Sections fall back to a full page load when an
     update cannot be rendered in place, and a stray navigation is itself a bug
     worth asserting on. */
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/Not implemented: navigation/i.test(error.message)) {
      navigations.push(error.message);
      return;
    }
    throw error;
  });

  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://flower.test/',
    virtualConsole
  });

  const { window } = dom;
  openWindows.push(window);
  window.navigations = navigations;
  // jsdom has no layout engine; the gallery scrolls the active thumbnail into view.
  window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  stubDialogMethods(window);

  if (beforeScript) beforeScript(window);
  names.forEach((section) => window.eval(sectionScript(section)));
  return window;
}

/* jsdom's matchMedia always answers `matches: false` and its lists cannot be
   driven, so any section that branches on a media query would only ever be
   tested down one path. Install lists the test controls instead.

   `initial` maps a query string to its starting answer; the returned setter
   changes one and notifies the listeners the section registered, the way a
   browser does when the user flips a system preference. */
function stubMatchMedia(window, initial = {}) {
  const answers = Object.assign({}, initial);
  const listeners = new Map();
  const lists = new Map();

  window.matchMedia = (media) => {
    if (!lists.has(media)) {
      listeners.set(media, new Set());
      lists.set(media, {
        media,
        get matches() {
          return Boolean(answers[media]);
        },
        addEventListener(type, handler) {
          if (type === 'change') listeners.get(media).add(handler);
        },
        removeEventListener(type, handler) {
          listeners.get(media).delete(handler);
        }
      });
    }
    return lists.get(media);
  };

  return function setMedia(media, matches) {
    answers[media] = matches;
    (listeners.get(media) || new Set()).forEach((handler) => handler({ matches }));
  };
}

/* The theme editor dispatches these on the section wrapper; they reach the
   document handlers by bubbling, which is what makes event.target the section. */
function dispatchSectionEvent(window, type, target) {
  target.dispatchEvent(new window.Event(type, { bubbles: true }));
}

function tick(window, ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

module.exports = { bootSection, dispatchSectionEvent, stubMatchMedia, tick };
