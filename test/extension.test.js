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

const vscodeMock = {
  Position,
  Selection,
  Range,
  TextEditorRevealType: { InMiddle: 1 },
  commands: {
    registerTextEditorCommand: (id, fn) => {
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
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, def) => {
        const defaults = {
          'navigation.enabled': true,
          'navigation.goToImplementation': true,
          'navigation.goToDeclaration': true,
          'navigation.nextPreviousMethod': true,
          'navigation.matchOverloads': true,
          'navigation.jumpToSection': true,
          'navigation.showStatusMessage': false,
          'folding.sections': true,
          'folding.beginEnd': true,
        };
        return key in defaults ? defaults[key] : def;
      },
    }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

const ext = require('../src/extension.js');

test('activation registers all four navigation commands', () => {
  ext.activate({ subscriptions: [] });
  const ids = registeredCommands.map((c) => c.id).sort();
  assert.deepEqual(ids, [
    'delphi.goToDeclaration',
    'delphi.goToImplementation',
    'delphi.nextMethod',
    'delphi.previousMethod',
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
