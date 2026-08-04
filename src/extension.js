'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./configuration.js');
const { DelphiFoldingProvider } = require('./folding.js');
const {
  goToImplementation,
  goToDeclaration,
  nextMethod,
  previousMethod,
  selectColorScheme,
  selectKeybindingStyle,
} = require('./commands.js');

const SCHEME_FILE = {
  fancy: 'code4delphi-fancy-color-theme.json',
  turboPascal: 'code4delphi-turbo-pascal-color-theme.json',
  delphiDark: 'code4delphi-delphi-dark-color-theme.json',
  delphiLight: 'code4delphi-delphi-light-color-theme.json',
};

/**
 * Apply the selected syntax color scheme for Delphi files only.
 *
 * The scheme's token rules are written to `editor.tokenColorCustomizations`
 * (a registered, supported setting). Because every rule only targets
 * `*.delphi` scopes — which no other language produces — the colors affect
 * Delphi files exclusively. The global VS Code theme and all other languages
 * stay untouched. Existing user rules with non-Delphi scopes are preserved.
 */
function applyColorScheme() {
  const scheme = getConfig().colorScheme;
  const file = SCHEME_FILE[scheme];
  let schemeRules = [];
  if (file) {
    const json = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'themes', file), 'utf8')
    );
    schemeRules = json.tokenColors;
  }

  const editorCfg = vscode.workspace.getConfiguration('editor');
  const current = editorCfg.get('tokenColorCustomizations') || {};
  const existingRules = Array.isArray(current.textMateRules) ? current.textMateRules : [];

  const isDelphiRule = (rule) => {
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    return scopes.some((s) => typeof s === 'string' && s.endsWith('.delphi'));
  };

  const next = {
    ...current,
    textMateRules: [...existingRules.filter((r) => !isDelphiRule(r)), ...schemeRules],
  };

  return editorCfg
    .update('tokenColorCustomizations', next, vscode.ConfigurationTarget.Global)
    .then(undefined, () => { /* ignore errors (e.g. read-only settings) */ });
}

function activate(context) {
  const nav = getConfig().navigation;

  const register = (command, fn) => {
    context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, fn));
  };

  if (nav.goToImplementation) {
    register('delphi.goToImplementation', goToImplementation);
  }
  if (nav.goToDeclaration) {
    register('delphi.goToDeclaration', goToDeclaration);
  }
  if (nav.nextPreviousMethod) {
    register('delphi.nextMethod', nextMethod);
    register('delphi.previousMethod', previousMethod);
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('delphi.selectColorScheme', selectColorScheme),
    vscode.commands.registerCommand('delphi.selectKeybindingStyle', selectKeybindingStyle)
  );

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'delphi' },
      new DelphiFoldingProvider()
    )
  );

  // Color scheme selection
  applyColorScheme();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('delphi.colorScheme')) {
        applyColorScheme();
      }
    })
  );
}

function deactivate() {
  // nothing to clean up
}

module.exports = { activate, deactivate };
