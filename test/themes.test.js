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

test('all four schemes are valid and complete', () => {
  for (const name of THEMES) {
    const theme = readTheme(name);
    assert.ok(theme.name, `${name}: name`);
    assert.ok(theme.name.startsWith('Code4Delphi '), `${name}: name prefix`);
    assert.ok(Array.isArray(theme.tokenColors) && theme.tokenColors.length >= 10, `${name}: tokenColors`);

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

test('schemes cover every leaf scope produced by the grammar', () => {
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

test('package.json defines the schemes, commands and three keybinding styles', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  // no full color themes are contributed — schemes are per-language token colors only
  assert.equal(pkg.contributes.themes, undefined, 'no contributes.themes (global themes)');
  assert.equal(pkg.contributes.configuration.title, 'Code4Delphi');

  const styleSetting = pkg.contributes.configuration.properties['delphi.keybindings.style'];
  assert.deepEqual(styleSetting.enum, ['default', 'emacs', 'wordstar']);
  const schemeSetting = pkg.contributes.configuration.properties['delphi.colorScheme'];
  assert.deepEqual(schemeSetting.enum, ['auto', 'none', 'fancy', 'turboPascal', 'delphiDark', 'delphiLight']);
  assert.equal(schemeSetting.default, 'auto');

  // every scheme enum value (except none) has a theme file with rules
  for (const value of ['fancy', 'turboPascal', 'delphiDark', 'delphiLight']) {
    const f = { fancy: 'code4delphi-fancy-color-theme.json', turboPascal: 'code4delphi-turbo-pascal-color-theme.json', delphiDark: 'code4delphi-delphi-dark-color-theme.json', delphiLight: 'code4delphi-delphi-light-color-theme.json' }[value];
    const scheme = readTheme(f);
    assert.ok(scheme.tokenColors.length >= 10, `${value}: rules`);
  }

  // quick-pick commands exist with Code4Delphi category
  const cmdIds = pkg.contributes.commands.map((c) => c.command);
  assert.ok(cmdIds.includes('delphi.selectColorScheme'));
  assert.ok(cmdIds.includes('delphi.selectKeybindingStyle'));
  assert.ok(pkg.contributes.commands.every((c) => c.category === 'Code4Delphi'));

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
