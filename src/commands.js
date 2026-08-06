'use strict';

const vscode = require('vscode');
const {
  analyze,
  findImplementation,
  findDeclaration,
  methodAtPosition,
  sectionAtPosition,
  regionForLine,
  findNextMethod,
  findPreviousMethod,
} = require('./parser.js');
const { getConfig } = require('./configuration.js');

/** @type {WeakMap<object, { version: number|undefined, model: object }>} */
const analyzeCache = new WeakMap();

/**
 * Analyze a document, reusing the last model while `document.version` is unchanged.
 * VS Code bumps `version` on every edit, so we avoid `getText()` on cache hits.
 * When `version` is missing (unit tests), always re-analyze.
 */
function analyzeDocument(document) {
  const version = document.version;
  const cached = analyzeCache.get(document);
  if (
    cached &&
    version !== undefined &&
    version !== null &&
    cached.version === version
  ) {
    return cached.model;
  }
  const model = analyze(document.getText());
  analyzeCache.set(document, { version, model });
  return model;
}

function status(message) {
  if (getConfig().navigation.showStatusMessage) {
    vscode.window.setStatusBarMessage(`Delphi: ${message}`, 2500);
  }
}

function qualifiedName(decl) {
  return decl.className ? `${decl.className}.${decl.name}` : decl.name;
}

function jumpTo(editor, target) {
  const pos = new vscode.Position(target.line, target.col);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InMiddle);
  return true;
}

function jumpToSectionLine(editor, line) {
  const pos = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InMiddle);
  return true;
}

/**
 * Toggle between a method's interface declaration and implementation, or
 * (when the cursor is not on a method) jump between the section headers.
 *
 * @param {import('vscode').TextEditor} editor
 * @param {'implementation'|'declaration'} sectionFallback which section header
 *        to jump to when the cursor is not on a method
 */
function goToMethodPair(editor, sectionFallback) {
  if (!editor || editor.document.languageId !== 'delphi') return;
  const cfg = getConfig().navigation;
  if (!cfg.enabled) return;
  if (sectionFallback === 'implementation' && !cfg.goToImplementation) return;
  if (sectionFallback === 'declaration' && !cfg.goToDeclaration) return;

  const model = analyzeDocument(editor.document);
  const pos = editor.selection.active;
  const decl = methodAtPosition(model, pos.line, pos.character);

  if (decl) {
    if (decl.section === 'interface') {
      const impl = findImplementation(decl, model.implementationMethods, cfg.matchOverloads);
      if (impl) {
        jumpTo(editor, impl);
        status(`→ implementation of ${qualifiedName(decl)}`);
        return;
      }
      status(`No implementation found for ${qualifiedName(decl)}`);
      return;
    }
    const target = findDeclaration(decl, model.interfaceMethods, cfg.matchOverloads);
    if (target) {
      jumpTo(editor, target);
      status(`← declaration of ${qualifiedName(decl)}`);
      return;
    }
    status(`No interface declaration found for ${qualifiedName(decl)}`);
    return;
  }

  if (!cfg.jumpToSection) return;
  const section = sectionAtPosition(model, pos.line);
  const region = regionForLine(model, pos.line);

  if (sectionFallback === 'implementation') {
    if (section === 'interface' || region === 'interface') {
      if (model.sections.implementation >= 0) {
        jumpToSectionLine(editor, model.sections.implementation);
        status('→ implementation section');
      }
    }
    return;
  }

  if (section === 'implementation' || region === 'implementation') {
    if (model.sections.interface >= 0) {
      jumpToSectionLine(editor, model.sections.interface);
      status('← interface section');
    }
  }
}

/** Ctrl+Shift+Down / Ctrl+Alt+Down — Delphi "interface <-> implementation". */
function goToImplementation(editor) {
  goToMethodPair(editor, 'implementation');
}

/** Ctrl+Shift+Up / Ctrl+Alt+Up — Delphi "implementation <-> interface". */
function goToDeclaration(editor) {
  goToMethodPair(editor, 'declaration');
}

/** Alt+Down — Delphi "next method". */
function nextMethod(editor) {
  if (!editor || editor.document.languageId !== 'delphi') return;
  const cfg = getConfig().navigation;
  if (!cfg.enabled || !cfg.nextPreviousMethod) return;
  const model = analyzeDocument(editor.document);
  const pos = editor.selection.active;
  const target = findNextMethod(model, pos.line, pos.character);
  if (target) {
    jumpTo(editor, target);
    status(`next method: ${qualifiedName(target)}`);
  }
}

/** Alt+Up — Delphi "previous method". */
function previousMethod(editor) {
  if (!editor || editor.document.languageId !== 'delphi') return;
  const cfg = getConfig().navigation;
  if (!cfg.enabled || !cfg.nextPreviousMethod) return;
  const model = analyzeDocument(editor.document);
  const pos = editor.selection.active;
  const target = findPreviousMethod(model, pos.line, pos.character);
  if (target) {
    jumpTo(editor, target);
    status(`previous method: ${qualifiedName(target)}`);
  }
}

/** Command palette: pick a Delphi syntax color scheme (Quick Pick). */
function selectColorScheme() {
  const items = [
    { label: 'Auto (Dark / Light)', description: 'Follow my VS Code theme: Delphi Dark or Delphi Light automatically', value: 'auto' },
    { label: 'None', description: 'Use the colors of my current VS Code theme', value: 'none' },
    { label: 'Code4Delphi Fancy', description: 'Vivid, hand-tuned Delphi syntax colors', value: 'fancy' },
    { label: 'Code4Delphi Turbo Pascal', description: 'Classic Turbo Pascal IDE syntax colors', value: 'turboPascal' },
    { label: 'Code4Delphi Delphi Dark', description: 'Delphi 13 default dark syntax colors', value: 'delphiDark' },
    { label: 'Code4Delphi Delphi Light', description: 'Delphi 13 default light syntax colors', value: 'delphiLight' },
  ];
  return vscode.window.showQuickPick(items, {
    placeHolder: 'Select the Delphi syntax color scheme (applies to Delphi files only)',
    canPickMany: false,
  }).then((pick) => {
    if (pick) {
      return vscode.workspace
        .getConfiguration('delphi')
        .update('colorScheme', pick.value, vscode.ConfigurationTarget.Global);
    }
  });
}

/** Command palette: pick a keybinding style (Quick Pick). */
function selectKeybindingStyle() {
  const items = [
    { label: 'Default', description: 'Ctrl+Shift+Up/Down, Ctrl+Alt+Up/Down, Alt+Up/Down', value: 'default' },
    { label: 'Emacs', description: 'Alt+. / Alt+, and Ctrl+Alt+N/P', value: 'emacs' },
    { label: 'WordStar', description: 'Ctrl+Q Ctrl+Up/Down and Ctrl+Q Ctrl+N/P', value: 'wordstar' },
  ];
  return vscode.window.showQuickPick(items, {
    placeHolder: 'Select the Delphi keybinding style',
    canPickMany: false,
  }).then((pick) => {
    if (pick) {
      return vscode.workspace
        .getConfiguration('delphi')
        .update('keybindings.style', pick.value, vscode.ConfigurationTarget.Global);
    }
  });
}

module.exports = {
  goToImplementation,
  goToDeclaration,
  nextMethod,
  previousMethod,
  selectColorScheme,
  selectKeybindingStyle,
  analyzeDocument, // exported for tests
};
