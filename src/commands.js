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

/** Ctrl+Shift+Down / Ctrl+Alt+Down — Delphi "interface <-> implementation". */
function goToImplementation(editor) {
  if (!editor || editor.document.languageId !== 'delphi') return;
  const doc = editor.document;
  const model = analyze(doc.getText());
  const pos = editor.selection.active;
  const cfg = getConfig().navigation;

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
    // already at the implementation — jump back to its declaration like the IDE
    const decl2 = findDeclaration(decl, model.interfaceMethods, cfg.matchOverloads);
    if (decl2) {
      jumpTo(editor, decl2);
      status(`← declaration of ${qualifiedName(decl)}`);
      return;
    }
    return;
  }

  if (!cfg.jumpToSection) return;
  const section = sectionAtPosition(model, pos.line);
  if (section === 'interface' || regionForLine(model, pos.line) === 'interface') {
    if (model.sections.implementation >= 0) {
      jumpToSectionLine(editor, model.sections.implementation);
      status('→ implementation section');
    }
  }
}

/** Ctrl+Shift+Up / Ctrl+Alt+Up — Delphi "implementation <-> interface". */
function goToDeclaration(editor) {
  if (!editor || editor.document.languageId !== 'delphi') return;
  const doc = editor.document;
  const model = analyze(doc.getText());
  const pos = editor.selection.active;
  const cfg = getConfig().navigation;

  const decl = methodAtPosition(model, pos.line, pos.character);
  if (decl) {
    if (decl.section === 'implementation') {
      const target = findDeclaration(decl, model.interfaceMethods, cfg.matchOverloads);
      if (target) {
        jumpTo(editor, target);
        status(`← declaration of ${qualifiedName(decl)}`);
        return;
      }
      status(`No interface declaration found for ${qualifiedName(decl)}`);
      return;
    }
    // already at the declaration — jump to its implementation like the IDE
    const impl = findImplementation(decl, model.implementationMethods, cfg.matchOverloads);
    if (impl) {
      jumpTo(editor, impl);
      status(`→ implementation of ${qualifiedName(decl)}`);
      return;
    }
    return;
  }

  if (!cfg.jumpToSection) return;
  const section = sectionAtPosition(model, pos.line);
  if (section === 'implementation' || regionForLine(model, pos.line) === 'implementation') {
    if (model.sections.interface >= 0) {
      jumpToSectionLine(editor, model.sections.interface);
      status('← interface section');
    }
  }
}

/** Alt+Down — Delphi "next method". */
function nextMethod(editor) {
  if (!editor || editor.document.languageId !== 'delphi') return;
  const model = analyze(editor.document.getText());
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
  const model = analyze(editor.document.getText());
  const pos = editor.selection.active;
  const target = findPreviousMethod(model, pos.line, pos.character);
  if (target) {
    jumpTo(editor, target);
    status(`previous method: ${qualifiedName(target)}`);
  }
}

module.exports = {
  goToImplementation,
  goToDeclaration,
  nextMethod,
  previousMethod,
};
