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
const { registerFormLayout } = require('./formLayout/index.js');

const SCHEME_FILE = {
  fancy: 'code4delphi-fancy-color-theme.json',
  turboPascal: 'code4delphi-turbo-pascal-color-theme.json',
  delphiDark: 'code4delphi-delphi-dark-color-theme.json',
  delphiLight: 'code4delphi-delphi-light-color-theme.json',
};

/**
 * Resolve the effective scheme. `auto` follows the user's current VS Code
 * theme kind: dark themes → Delphi Dark, light themes → Delphi Light.
 */
function resolveScheme(scheme) {
  if (scheme !== 'auto') {
    return scheme;
  }
  const kind = vscode.window.activeColorTheme
    ? vscode.window.activeColorTheme.kind
    : vscode.ColorThemeKind.Dark;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? 'delphiLight'
    : 'delphiDark';
}

function isDelphiRule(rule) {
  const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
  return scopes.some((s) => typeof s === 'string' && s.endsWith('.delphi'));
}

function loadSchemeRules(scheme) {
  const file = SCHEME_FILE[scheme];
  if (!file) return [];
  const json = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'themes', file), 'utf8')
  );
  return Array.isArray(json.tokenColors) ? json.tokenColors : [];
}

/**
 * Apply the selected syntax color scheme for Delphi files only.
 *
 * Only rules whose scopes end with `.delphi` are managed/rewritten; existing
 * user `textMateRules` for other languages are preserved. Writes only when the
 * resulting rule list would actually change, so activation / theme toggles do
 * not thrash `settings.json`.
 */
function applyColorScheme() {
  const scheme = resolveScheme(getConfig().colorScheme);
  const schemeRules = loadSchemeRules(scheme);

  const editorCfg = vscode.workspace.getConfiguration('editor');
  const current = editorCfg.get('tokenColorCustomizations') || {};
  const existingRules = Array.isArray(current.textMateRules) ? current.textMateRules : [];
  const nextRules = [...existingRules.filter((r) => !isDelphiRule(r)), ...schemeRules];

  if (JSON.stringify(existingRules) === JSON.stringify(nextRules)) {
    return Promise.resolve();
  }

  const next = {
    ...current,
    textMateRules: nextRules,
  };

  return editorCfg
    .update('tokenColorCustomizations', next, vscode.ConfigurationTarget.Global)
    .then(undefined, () => { /* ignore errors (e.g. read-only settings) */ });
}

function activate(context) {
  // Always register commands; feature flags are checked at invocation time so
  // setting changes take effect without reloading the window.
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('delphi.goToImplementation', goToImplementation),
    vscode.commands.registerTextEditorCommand('delphi.goToDeclaration', goToDeclaration),
    vscode.commands.registerTextEditorCommand('delphi.nextMethod', nextMethod),
    vscode.commands.registerTextEditorCommand('delphi.previousMethod', previousMethod),
    vscode.commands.registerCommand('delphi.selectColorScheme', selectColorScheme),
    vscode.commands.registerCommand('delphi.selectKeybindingStyle', selectKeybindingStyle)
  );

  // DFM / FMX box-model layout visualizer (pluggable render providers)
  registerFormLayout(context);

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'delphi' },
      new DelphiFoldingProvider()
    )
  );

  applyColorScheme();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('delphi.colorScheme')) {
        applyColorScheme();
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (getConfig().colorScheme === 'auto') {
        applyColorScheme();
      }
    })
  );
}

function deactivate() {
  // nothing to clean up
}

module.exports = { activate, deactivate, applyColorScheme, resolveScheme };
