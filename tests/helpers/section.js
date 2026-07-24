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
const { JSDOM, VirtualConsole } = require('jsdom');

const themeRoot = path.join(__dirname, '..', '..');

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
   spies that the section picks up on its first pass. */
function bootSection(name, html, { beforeScript } = {}) {
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
  window.navigations = navigations;
  // jsdom has no layout engine; the gallery scrolls the active thumbnail into view.
  window.Element.prototype.scrollIntoView = function scrollIntoView() {};

  if (beforeScript) beforeScript(window);
  window.eval(sectionScript(name));
  return window;
}

/* The theme editor dispatches these on the section wrapper; they reach the
   document handlers by bubbling, which is what makes event.target the section. */
function dispatchSectionEvent(window, type, target) {
  target.dispatchEvent(new window.Event(type, { bubbles: true }));
}

function tick(window, ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

module.exports = { bootSection, dispatchSectionEvent, tick };
