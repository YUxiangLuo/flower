'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'sections', 'collection.liquid'),
  'utf8'
);

function assignedWidth(name) {
  const match = source.match(
    new RegExp(`assign ${name} = collection\\.image \\| image_url: width: (\\d+)`)
  );
  assert.ok(match, `${name} is not assigned from the collection image`);
  return Number(match[1]);
}

test('collection hero candidates cover the mobile 1x, 2x, and 3x width bands', () => {
  assert.ok(assignedWidth('hero_1x') >= 750);
  assert.ok(assignedWidth('hero_2x') >= 1500);
  assert.ok(assignedWidth('hero_3x') >= 2250);
});

test('collection hero preload and CSS bands use the same candidates', () => {
  ['hero_1x', 'hero_2x', 'hero_3x'].forEach((name) => {
    assert.ok(source.includes(`href="{{ ${name} }}"`));
    assert.ok(source.includes(`url('{{ ${name} | escape }}')`));
  });
});
