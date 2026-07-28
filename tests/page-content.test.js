'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { bootSection, dispatchSectionEvent, tick } = require('./helpers/section.js');

test('Auto mode isolates full documents and every script-bearing fragment', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'sections', 'page.liquid'),
    'utf8'
  );
  const liquidBlock = source.match(/\{%\s*liquid\b([\s\S]*?)%\}/)[1];
  const autoBranch = liquidBlock.match(/when 'auto'([\s\S]*?)endcase/)[1];

  assert.match(liquidBlock, /assign normalized_content = page\.content \| downcase/);
  assert.match(autoBranch, /if normalized_content contains '<body'/);
  assert.match(autoBranch, /elsif normalized_content contains '<script'[\s\S]*assign isolate_content = true/);
  assert.doesNotMatch(autoBranch, /contains '<style'/);
});

function escapeTemplateContent(content) {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function embeddedPage(
  content = `
    <style>.header { margin-bottom: 30px; }</style>
    <div id="interactive-tool">Tool</div>
    <script>window.toolLoaded = true;</script>
  `
) {
  return `
    <section id="page-section">
      <div data-page-embedded>
        <iframe hidden aria-busy="true" data-page-embedded-frame></iframe>
        <template data-page-embedded-template>${escapeTemplateContent(content)}</template>
      </div>
    </section>
  `;
}

test('embedded page content is moved into srcdoc instead of the theme document', () => {
  const window = bootSection('page.liquid', embeddedPage());
  const frame = window.document.querySelector('[data-page-embedded-frame]');

  assert.equal(
    window.document.querySelector('#interactive-tool'),
    null,
    'the tool escaped its inert template and can affect the theme document'
  );
  assert.match(frame.srcdoc, /<div id="interactive-tool">Tool<\/div>/);
  assert.doesNotMatch(frame.srcdoc, /&lt;div id="interactive-tool"/);
  assert.match(frame.srcdoc, /\.header \{ margin-bottom: 30px; \}/);
  assert.match(frame.srcdoc, /<base target="_top">/);
  assert.equal(frame.hidden, false);
});

test('full-document attributes survive the transfer into srcdoc', () => {
  const fullDocument = `
    <!doctype html>
    <html class="tool-root" lang="it">
      <head>
        <style>body.tool-body { color: red; }</style>
      </head>
      <body class="tool-body" data-theme="dark" style="background: black">
        <div id="interactive-tool">Tool</div>
      </body>
    </html>
  `;
  const window = bootSection('page.liquid', embeddedPage(fullDocument));
  const frame = window.document.querySelector('[data-page-embedded-frame]');

  assert.match(frame.srcdoc, /<html class="tool-root" lang="it">/);
  assert.match(
    frame.srcdoc,
    /<body class="tool-body" data-theme="dark" style="background: black">/
  );
});

test('the no-JavaScript fallback does not leave an empty frame visible', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'sections', 'page.liquid'),
    'utf8'
  );

  assert.match(source, /<iframe[\s\S]*?\shidden[\s>]/);
  assert.match(
    source,
    /\.page__embedded-frame\[hidden\]\s*\{[\s\S]*?display:\s*none/
  );
});

test('theme-editor reinitialization does not reload an existing embedded tool', () => {
  const window = bootSection('page.liquid', embeddedPage());
  const section = window.document.querySelector('#page-section');
  const frame = section.querySelector('[data-page-embedded-frame]');

  frame.srcdoc = 'already running';
  dispatchSectionEvent(window, 'shopify:section:load', section);

  assert.equal(frame.srcdoc, 'already running');
});

test('the embedded frame follows its document height and disconnects on unload', async () => {
  const observers = [];
  const window = bootSection('page.liquid', embeddedPage(), {
    beforeScript(pageWindow) {
      pageWindow.ResizeObserver = class ResizeObserver {
        constructor(callback) {
          this.callback = callback;
          this.targets = [];
          this.disconnected = false;
          observers.push(this);
        }

        observe(target) {
          this.targets.push(target);
        }

        disconnect() {
          this.disconnected = true;
          this.targets.length = 0;
        }
      };
    }
  });

  const section = window.document.querySelector('#page-section');
  const frame = section.querySelector('[data-page-embedded-frame]');
  Object.defineProperty(frame.contentDocument.body, 'scrollHeight', {
    configurable: true,
    value: 480
  });
  Object.defineProperty(frame.contentDocument.documentElement, 'scrollHeight', {
    configurable: true,
    value: 520
  });

  frame.dispatchEvent(new window.Event('load'));
  await tick(window, 40);

  assert.equal(frame.style.height, '520px');
  assert.equal(frame.hasAttribute('aria-busy'), false);
  assert.equal(observers.length, 1);
  assert.equal(observers[0].targets.length, 1);

  dispatchSectionEvent(window, 'shopify:section:unload', section);

  assert.equal(observers[0].disconnected, true);
});

test('the embedded frame can shrink after its content collapses', async () => {
  const observers = [];
  let contentHeight = 900;
  const window = bootSection('page.liquid', embeddedPage(), {
    beforeScript(pageWindow) {
      pageWindow.ResizeObserver = class ResizeObserver {
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }

        observe() {}
        disconnect() {}
      };
    }
  });

  const frame = window.document.querySelector('[data-page-embedded-frame]');
  const reportedHeight = () => {
    const viewportHeight = Number.parseInt(frame.style.height, 10) || 0;
    return Math.max(contentHeight, viewportHeight);
  };
  Object.defineProperty(frame.contentDocument.body, 'scrollHeight', {
    configurable: true,
    get: reportedHeight
  });
  Object.defineProperty(frame.contentDocument.documentElement, 'scrollHeight', {
    configurable: true,
    get: reportedHeight
  });

  frame.dispatchEvent(new window.Event('load'));
  await tick(window, 40);
  assert.equal(frame.style.height, '900px');

  contentHeight = 320;
  frame.contentDocument.body.setAttribute('data-layout', 'collapsed');
  await tick(window, 180);

  assert.equal(frame.style.height, '320px');
});

test('viewport-relative embedded content does not make the frame grow on every measurement', async () => {
  const observers = [];
  const window = bootSection('page.liquid', embeddedPage(), {
    beforeScript(pageWindow) {
      pageWindow.ResizeObserver = class ResizeObserver {
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }

        observe() {}
        disconnect() {}
      };
    }
  });

  const frame = window.document.querySelector('[data-page-embedded-frame]');
  const reportedHeight = () => (Number.parseInt(frame.style.height, 10) || 0) + 40;
  Object.defineProperty(frame.contentDocument.body, 'scrollHeight', {
    configurable: true,
    get: reportedHeight
  });
  Object.defineProperty(frame.contentDocument.documentElement, 'scrollHeight', {
    configurable: true,
    get: reportedHeight
  });

  frame.dispatchEvent(new window.Event('load'));
  await tick(window, 40);
  const initialHeight = frame.style.height;

  for (let index = 0; index < 3; index += 1) {
    frame.contentDocument.body.setAttribute('data-layout-pass', String(index));
    await tick(window, 180);
  }

  assert.equal(frame.style.height, initialHeight);
});

test('frequent non-layout mutations are coalesced before measuring again', async () => {
  const window = bootSection('page.liquid', embeddedPage());
  const frame = window.document.querySelector('[data-page-embedded-frame]');
  Object.defineProperty(frame.contentDocument.body, 'scrollHeight', {
    configurable: true,
    value: 320
  });
  Object.defineProperty(frame.contentDocument.documentElement, 'scrollHeight', {
    configurable: true,
    value: 320
  });

  frame.dispatchEvent(new window.Event('load'));
  await tick(window, 40);

  let zeroHeightPasses = 0;
  const styleObserver = new window.MutationObserver(() => {
    if (frame.style.height === '0px') zeroHeightPasses += 1;
  });
  styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] });

  for (let index = 0; index < 6; index += 1) {
    frame.contentDocument.body.setAttribute('data-animation-frame', String(index));
    await tick(window, 15);
  }
  await tick(window, 180);

  styleObserver.disconnect();
  assert.equal(zeroHeightPasses, 1);
  assert.equal(frame.style.height, '320px');
});
