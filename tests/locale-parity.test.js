'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const localeRoot = path.join(__dirname, '..', 'locales');

function parseLocale(filename) {
  const source = fs
    .readFileSync(path.join(localeRoot, filename), 'utf8')
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  return JSON.parse(source);
}

function flatten(value, prefix = '', result = {}) {
  Object.entries(value).forEach(([key, item]) => {
    const itemPath = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      flatten(item, itemPath, result);
      return;
    }
    result[itemPath] = String(item);
  });
  return result;
}

function placeholders(value) {
  return [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)]
    .map((match) => match[1])
    .sort();
}

test('every translated storefront locale matches the default locale contract', () => {
  const defaultLocale = flatten(parseLocale('en.default.json'));
  const translatedLocales = fs
    .readdirSync(localeRoot)
    .filter((filename) => filename.endsWith('.json'))
    .filter((filename) => filename !== 'en.default.json')
    .filter((filename) => !filename.endsWith('.schema.json'));

  assert.ok(translatedLocales.includes('it.json'), 'the Italian market has no theme locale');

  translatedLocales.forEach((filename) => {
    const locale = flatten(parseLocale(filename));

    assert.deepEqual(
      Object.keys(locale).sort(),
      Object.keys(defaultLocale).sort(),
      `${filename} does not expose the same translation keys as en.default.json`
    );

    Object.keys(defaultLocale).forEach((key) => {
      assert.deepEqual(
        placeholders(locale[key]),
        placeholders(defaultLocale[key]),
        `${filename}:${key} does not preserve the default locale placeholders`
      );
    });
  });
});
