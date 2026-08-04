'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('node:module');

// ---- minimal vscode mock -------------------------------------------------
class Position {
  constructor(line, character) { this.line = line; this.character = character; }
}
class Selection {
  constructor(anchor, active) { this.anchor = anchor; this.active = active; }
}
class Range {
  constructor(start, end) { this.start = start; this.end = end; }
}

const settings = {
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

const vscodeMock = {
  Position,
  Selection,
  Range,
  TextEditorRevealType: { InMiddle: 1 },
  ConfigurationTarget: { Global: 1 },
  window: {
    setStatusBarMessage: () => ({ dispose() {} }),
    showQuickPick: () => Promise.resolve(null),
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, def) => (key in settings ? settings[key] : def),
    }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

const commands = require('../src/commands.js');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function makeEditor(line, character) {
  const editor = {
    document: {
      languageId: 'delphi',
      getText: () => fixture('MyUnit.pas'),
    },
    _selection: { active: new Position(line, character) },
    revealCalls: [],
    set selection(sel) {
      this._selection = sel;
    },
    get selection() {
      return this._selection;
    },
    revealRange(range, _revealType) {
      this.revealCalls.push(range);
    },
  };
  return editor;
}

test('goToImplementation jumps from interface declaration to implementation', () => {
  const editor = makeEditor(19, 15); // interface `procedure DoWork(A: Integer; const B: string); virtual; abstract;` (0-based)
  commands.goToImplementation(editor);
  const sel = editor.selection.active;
  assert.ok(sel.line > 19, `should move down to implementation (line ${sel.line})`);
  const lineText = editor.document.getText().split('\n')[sel.line];
  assert.match(lineText, /^procedure TMyClass\.DoWork\(A: Integer; const B: string\);/);
});

test('goToImplementation resolves the correct overload', () => {
  // interface `procedure DoWork(A: Double); overload;`
  const editor = makeEditor(25, 18);
  commands.goToImplementation(editor);
  const lineText = editor.document.getText().split('\n')[editor.selection.active.line];
  assert.match(lineText, /procedure TMyClass\.DoWork\(A: Double\);/);
});

test('goToDeclaration jumps from implementation back to interface declaration', () => {
  const impl = fixture('MyUnit.pas').split('\n').findIndex((l) => l.includes('function TMyClass.GetValue: Integer;'));
  const editor = makeEditor(impl, 12);
  commands.goToDeclaration(editor);
  const lineText = editor.document.getText().split('\n')[editor.selection.active.line];
  assert.match(lineText, /function GetValue: Integer;/);
  assert.ok(editor.selection.active.line < impl);
});

test('goToImplementation on an implementation method jumps back to its declaration', () => {
  const impl = fixture('MyUnit.pas').split('\n').findIndex((l) => l.includes('procedure TMyRecord.Reset;'));
  const editor = makeEditor(impl, 12);
  commands.goToImplementation(editor);
  const lineText = editor.document.getText().split('\n')[editor.selection.active.line];
  assert.match(lineText, /procedure Reset; inline;/);
  assert.ok(editor.selection.active.line < impl);
});

test('goToImplementation from the interface section jumps to implementation header', () => {
  const editor = makeEditor(13, 3); // `FValue: Integer; // a field` inside the class body
  commands.goToImplementation(editor);
  const lineText = editor.document.getText().split('\n')[editor.selection.active.line];
  assert.match(lineText.trim(), /^implementation$/);
});

test('goToDeclaration from the implementation section jumps to interface header', () => {
  const editor = makeEditor(80, 3); // inside a method body in the implementation section
  commands.goToDeclaration(editor);
  const lineText = editor.document.getText().split('\n')[editor.selection.active.line];
  assert.match(lineText.trim(), /^interface$/);
});

test('nextMethod and previousMethod move between methods', () => {
  const editor = makeEditor(0, 0);
  commands.nextMethod(editor);
  const first = editor.selection.active;
  assert.ok(first.line > 0);
  commands.nextMethod(editor);
  const second = editor.selection.active;
  assert.ok(second.line > first.line);
  commands.previousMethod(editor);
  assert.equal(editor.selection.active.line, first.line);
});

test('generic implementation navigation works (TMyGeneric<T>)', () => {
  const iface = fixture('MyUnit.pas').split('\n').findIndex((l) => l.includes('procedure AddItem(const Item: T);'));
  const editor = makeEditor(iface, 18);
  commands.goToImplementation(editor);
  const lineText = editor.document.getText().split('\n')[editor.selection.active.line];
  assert.match(lineText, /procedure TMyGeneric<T>\.AddItem/);
});

test('non-delphi documents are ignored', () => {
  const editor = makeEditor(0, 0);
  editor.document.languageId = 'plaintext';
  commands.goToImplementation(editor);
  assert.equal(editor.revealCalls.length, 0);
});

test('selectKeybindingStyle quick pick updates the style setting', async () => {
  let picked = null;
  let updated = null;
  const originalQuickPick = vscodeMock.window.showQuickPick;
  const originalGetConfig = vscodeMock.workspace.getConfiguration;
  vscodeMock.window.showQuickPick = async (items) => items.find((i) => i.value === 'emacs');
  vscodeMock.workspace.getConfiguration = (section) => {
    if (section === 'delphi') {
      return {
        get: () => undefined,
        update: (key, value) => { updated = { key, value }; return Promise.resolve(); },
      };
    }
    return originalGetConfig(section);
  };
  await commands.selectKeybindingStyle();
  assert.deepEqual(updated, { key: 'keybindings.style', value: 'emacs' });
  vscodeMock.window.showQuickPick = originalQuickPick;
  vscodeMock.workspace.getConfiguration = originalGetConfig;
});

test('selectColorScheme quick pick updates the colorScheme setting', async () => {
  let updated = null;
  const originalQuickPick = vscodeMock.window.showQuickPick;
  const originalGetConfig = vscodeMock.workspace.getConfiguration;
  vscodeMock.window.showQuickPick = async (items) => items.find((i) => i.value === 'turboPascal');
  vscodeMock.workspace.getConfiguration = (section) => {
    if (section === 'delphi') {
      return {
        get: () => undefined,
        update: (key, value) => { updated = { key, value }; return Promise.resolve(); },
      };
    }
    return originalGetConfig(section);
  };
  await commands.selectColorScheme();
  assert.deepEqual(updated, { key: 'colorScheme', value: 'turboPascal' });
  vscodeMock.window.showQuickPick = originalQuickPick;
  vscodeMock.workspace.getConfiguration = originalGetConfig;
});
