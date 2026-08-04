'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const THEMES = [
  'code4delphi-fancy-color-theme.json',
  'code4delphi-turbo-pascal-color-theme.json',
  'code4delphi-delphi-dark-color-theme.json',
  'code4delphi-delphi-light-color-theme.json',
];

function readTheme(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'themes', name), 'utf8'));
}

const CORE_SCOPES = [
  'keyword.control.delphi',
  'storage.type.function.delphi',
  'storage.modifier.delphi',
  'support.type.primitive.delphi',
  'support.function.builtin.delphi',
  'entity.name.function.delphi',
  'entity.name.type.delphi',
  'entity.other.attribute-name.delphi',
  'string.quoted.single.delphi',
  'constant.numeric.integer.delphi',
  'constant.language.delphi',
  'comment.block.delphi',
  'meta.preprocessor.delphi',
  'keyword.operator.assignment.delphi',
];

function flatScopes(theme) {
  const set = new Set();
  for (const rule of theme.tokenColors) {
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    for (const s of scopes) {
      if (typeof s === 'string') set.add(s);
    }
  }
  return set;
}

test('all four themes are valid and complete', () => {
  for (const name of THEMES) {
    const theme = readTheme(name);
    assert.ok(theme.name, `${name}: name`);
    assert.ok(theme.name.startsWith('Code4Delphi '), `${name}: name prefix`);
    assert.ok(['dark', 'light'].includes(theme.type), `${name}: type`);
    assert.match(theme.include, /^\.\/delphi-base-(dark|light)\.json$/, `${name}: include local base theme`);
    assert.ok(Array.isArray(theme.tokenColors) && theme.tokenColors.length > 10, `${name}: tokenColors`);

    const scopes = flatScopes(theme);
    for (const scope of CORE_SCOPES) {
      assert.ok(scopes.has(scope), `${name}: missing scope ${scope}`);
    }
    // every rule must carry a foreground
    for (const rule of theme.tokenColors) {
      assert.ok(rule.settings && rule.settings.foreground, `${name}: rule without foreground: ${JSON.stringify(rule.scope)}`);
    }
  }
});

test('themes cover every leaf scope produced by the grammar', () => {
  const grammar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'syntaxes', 'delphi.tmLanguage.json'), 'utf8'));
  const scopes = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string' && node.name.endsWith('.delphi')) scopes.add(node.name);
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(grammar);

  // meta.attribute.delphi is a begin/end name; all leaf names must be covered by Fancy
  const fancy = flatScopes(readTheme(THEMES[0]));
  const missing = [...scopes].filter((s) => !fancy.has(s) && s !== 'meta.attribute.delphi');
  assert.deepEqual(missing, [], 'grammar leaf scopes missing in Fancy theme');
});

test('both base themes are valid and complete', () => {
  for (const name of ['delphi-base-dark.json', 'delphi-base-light.json']) {
    const base = readTheme(name);
    assert.equal(base.type, name.includes('dark') ? 'dark' : 'light');
    assert.ok(Array.isArray(base.tokenColors) && base.tokenColors.length >= 10, `${name}: tokenColors`);
    for (const rule of base.tokenColors) {
      assert.ok(rule.settings && rule.settings.foreground, `${name}: rule without foreground`);
    }
  }
  // every contributed theme's include must exist
  for (const name of THEMES) {
    const theme = readTheme(name);
    const basePath = path.join(__dirname, '..', 'themes', path.basename(theme.include));
    assert.ok(fs.existsSync(basePath), `${name}: base file exists: ${theme.include}`);
  }
});

test('package.json contributes all four themes and three keybinding styles', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const themeLabels = pkg.contributes.themes.map((t) => t.label);
  assert.deepEqual(themeLabels, [
    'Code4Delphi Fancy',
    'Code4Delphi Turbo Pascal',
    'Code4Delphi Delphi Dark',
    'Code4Delphi Delphi Light',
  ]);
  for (const t of pkg.contributes.themes) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', t.path)), `theme file exists: ${t.path}`);
  }

  const styleSetting = pkg.contributes.configuration.properties['delphi.keybindings.style'];
  assert.deepEqual(styleSetting.enum, ['default', 'emacs', 'wordstar']);
  const schemeSetting = pkg.contributes.configuration.properties['delphi.colorScheme'];
  assert.deepEqual(schemeSetting.enum, ['none', 'fancy', 'turboPascal', 'delphiDark', 'delphiLight']);

  const bindings = pkg.contributes.keybindings;
  const byStyle = { default: [], emacs: [], wordstar: [] };
  for (const b of bindings) {
    const m = b.when.match(/config\.delphi\.keybindings\.style == '(\w+)'/);
    assert.ok(m, `binding ${b.command} ${b.key} must carry a style when-clause`);
    byStyle[m[1]].push(`${b.command}:${b.key}`);
  }
  assert.equal(byStyle.default.length, 6, 'default: 4 commands + 2 Ctrl+Alt aliases');
  assert.equal(byStyle.emacs.length, 4, 'emacs: 4 commands');
  assert.equal(byStyle.wordstar.length, 4, 'wordstar: 4 commands');
});
