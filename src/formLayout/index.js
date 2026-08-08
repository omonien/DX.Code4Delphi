'use strict';

const vscode = require('vscode');
const path = require('path');
const { FormLayoutView } = require('./FormLayoutView.js');

/** @type {Map<string, FormLayoutView>} */
const openViews = new Map();

/**
 * Register the Form Layout command and related contributions.
 * @param {vscode.ExtensionContext} context
 */
function registerFormLayout(context) {
  const cmd = vscode.commands.registerCommand('delphi.showFormLayout', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Code4Delphi: Open a .dfm or .fmx file first.');
      return;
    }

    const doc = editor.document;
    const ext = path.extname(doc.fileName).toLowerCase();
    if (ext !== '.dfm' && ext !== '.fmx') {
      // Allow opening from a .pas if a sibling form exists
      const sibling = await findSiblingForm(doc);
      if (sibling) {
        const formDoc = await vscode.workspace.openTextDocument(sibling);
        openOrReveal(context, formDoc);
        return;
      }
      vscode.window.showInformationMessage(
        'Code4Delphi: Form Layout works with .dfm / .fmx files (or a .pas that has a matching form).'
      );
      return;
    }

    openOrReveal(context, doc);
  });

  context.subscriptions.push(cmd);
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TextDocument} document
 */
function openOrReveal(context, document) {
  const key = document.uri.toString();
  const existing = openViews.get(key);
  if (existing && existing.panel) {
    existing.panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  const view = new FormLayoutView(context, document);
  openViews.set(key, view);

  view.panel.onDidDispose(() => {
    openViews.delete(key);
  });
}

/**
 * Look for a sibling .dfm or .fmx next to a .pas unit.
 * @param {vscode.TextDocument} pasDoc
 * @returns {Promise<vscode.Uri|null>}
 */
async function findSiblingForm(pasDoc) {
  const dir = path.dirname(pasDoc.uri.fsPath);
  const base = path.basename(pasDoc.fileName, path.extname(pasDoc.fileName));
  const candidates = [
    path.join(dir, base + '.dfm'),
    path.join(dir, base + '.fmx'),
    path.join(dir, base + '.DFM'),
    path.join(dir, base + '.FMX'),
  ];

  for (const p of candidates) {
    try {
      const uri = vscode.Uri.file(p);
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      // not found
    }
  }
  return null;
}

module.exports = { registerFormLayout };
