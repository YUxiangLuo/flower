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

function translationsOf(defaultFilename, isSchema) {
  return fs
    .readdirSync(localeRoot)
    .filter((filename) => filename.endsWith('.json'))
    .filter((filename) => filename.endsWith('.schema.json') === isSchema)
    .filter((filename) => filename !== defaultFilename);
}

test('every translated storefront locale matches the default locale contract', () => {
  const defaultLocale = flatten(parseLocale('en.default.json'));
  const translatedLocales = translationsOf('en.default.json', false);

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

/* Schema locales drive the theme editor rather than the storefront, so they are
   a separate contract from the one above: a different default file, and a set of
   languages that need not match the storefront's. A missing key here does not
   fall back to English — the editor renders the raw `t:` handle as the setting
   label — so the key sets have to line up exactly. */
test('every translated schema locale matches the default schema contract', () => {
  const defaultSchema = flatten(parseLocale('en.default.schema.json'));
  const translatedSchemas = translationsOf('en.default.schema.json', true);

  assert.ok(
    translatedSchemas.includes('zh-CN.schema.json'),
    'the Simplified Chinese admin has no schema locale'
  );

  translatedSchemas.forEach((filename) => {
    const schema = flatten(parseLocale(filename));

    assert.deepEqual(
      Object.keys(schema).sort(),
      Object.keys(defaultSchema).sort(),
      `${filename} does not expose the same setting labels as en.default.schema.json`
    );
  });
});
