'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

class Position {
  constructor(line, character) { this.line = line; this.character = character; }
}
class Selection {
  constructor(anchor, active) { this.anchor = anchor; this.active = active; }
}
class Range {
  constructor(start, end) { this.start = start; this.end = end; }
}

const registeredCommands = [];
const registeredProviders = [];
const delphiConfigUpdates = [];

const vscodeMock = {
  Position,
  Selection,
  Range,
  TextEditorRevealType: { InMiddle: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  commands: {
    registerTextEditorCommand: (id, fn) => {
      registeredCommands.push({ id, fn });
      return { dispose() {} };
    },
    registerCommand: (id, fn) => {
      registeredCommands.push({ id, fn });
      return { dispose() {} };
    },
  },
  languages: {
    registerFoldingRangeProvider: (selector, provider) => {
      registeredProviders.push({ selector, provider });
      return { dispose() {} };
    },
  },
  window: {
    setStatusBarMessage: () => ({ dispose() {} }),
    showQuickPick: () => Promise.resolve(null),
    activeColorTheme: { kind: 2 }, // Dark
    onDidChangeActiveColorTheme: () => ({ dispose() {} }),
  },
  workspace: {
    getConfiguration: (section) => {
      if (section === 'editor') {
        return {
          get: (key, def) => {
            if (key === 'tokenColorCustomizations') return { textMateRules: [] };
            return def;
          },
          update: (key, value, target) => {
            delphiConfigUpdates.push({ key, value, target });
            return Promise.resolve();
          },
        };
      }
      return {
        get: (key, def) => {
          const defaults = {
            'navigation.enabled': true,
            'navigation.goToImplementation': true,
            'navigation.goToDeclaration': true,
            'navigation.nextPreviousMethod': true,
            'navigation.matchOverloads': true,
            'navigation.jumpToSection': true,
            'navigation.showStatusMessage': false,
            'keybindings.style': 'default',
            'colorScheme': 'auto',
            'folding.sections': true,
            'folding.beginEnd': true,
          };
          return key in defaults ? defaults[key] : def;
        },
      };
    },
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

const ext = require('../src/extension.js');

test('activation registers all Code4Delphi commands', () => {
  ext.activate({ subscriptions: [] });
  const ids = registeredCommands.map((c) => c.id).filter((id) => id.startsWith('delphi.')).sort();
  assert.deepEqual(ids, [
    'delphi.goToDeclaration',
    'delphi.goToImplementation',
    'delphi.nextMethod',
    'delphi.previousMethod',
    'delphi.selectColorScheme',
    'delphi.selectKeybindingStyle',
    'delphi.showFormLayout',
  ]);
});

test('activation registers the folding provider for delphi', () => {
  assert.equal(registeredProviders.length, 1);
  assert.equal(registeredProviders[0].selector.language, 'delphi');
  assert.equal(typeof registeredProviders[0].provider.provideFoldingRanges, 'function');
});

test('registered command handlers are callable', () => {
  const handler = registeredCommands.find((c) => c.id === 'delphi.goToImplementation').fn;
  assert.equal(typeof handler, 'function');
});

test('activation applies the syntax color scheme via Delphi-scoped token colors', () => {
  const update = delphiConfigUpdates.find((u) => u.key === 'tokenColorCustomizations');
  assert.ok(update, 'editor.tokenColorCustomizations must be updated');
  assert.ok(Array.isArray(update.value.textMateRules), 'textMateRules array');
  assert.ok(update.value.textMateRules.length >= 10, 'rules present');
  // every written rule must be delphi-scoped so only Delphi files are affected
  for (const rule of update.value.textMateRules) {
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    assert.ok(scopes.every((s) => s.endsWith('.delphi')), `delphi-scoped rule expected: ${JSON.stringify(scopes)}`);
  }
  assert.equal(update.target, vscodeMock.ConfigurationTarget.Global);
});

test('auto scheme follows the active theme kind (dark -> Delphi Dark)', () => {
  const rules = delphiConfigUpdates.find((u) => u.key === 'tokenColorCustomizations').value.textMateRules;
  const keyword = rules.find((r) => Array.isArray(r.scope) && r.scope.includes('keyword.control.delphi'));
  assert.ok(keyword, 'keyword rule present');
  assert.equal(keyword.settings.foreground, '#fae0bf', 'Delphi Dark keyword color');
  assert.equal(keyword.settings.fontStyle, 'bold', 'keywords bold in Delphi Dark');
  const property = rules.find((r) => {
    const scopes = Array.isArray(r.scope) ? r.scope : [r.scope];
    return scopes.includes('entity.name.variable.property.delphi');
  });
  assert.ok(property, 'property rule present');
  assert.ok(!property.settings.fontStyle || property.settings.fontStyle === 'normal', 'property names must not be bold');
});

test('applyColorScheme does not rewrite settings when rules are unchanged', async () => {
  // Seed the mock "current" settings with the rules already applied by activate
  const applied = delphiConfigUpdates.find((u) => u.key === 'tokenColorCustomizations').value;
  const originalGetConfiguration = vscodeMock.workspace.getConfiguration;
  vscodeMock.workspace.getConfiguration = (section) => {
    if (section === 'editor') {
      return {
        get: (key, def) => {
          if (key === 'tokenColorCustomizations') return applied;
          return def;
        },
        update: (key, value, target) => {
          delphiConfigUpdates.push({ key, value, target });
          return Promise.resolve();
        },
      };
    }
    return originalGetConfiguration(section);
  };
  try {
    const before = delphiConfigUpdates.length;
    await ext.applyColorScheme();
    assert.equal(delphiConfigUpdates.length, before, 'no settings write when already applied');
  } finally {
    vscodeMock.workspace.getConfiguration = originalGetConfiguration;
  }
});
