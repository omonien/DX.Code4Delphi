'use strict';

const vscode = require('vscode');
const { getConfig } = require('./configuration.js');
const { DelphiFoldingProvider } = require('./folding.js');
const {
  goToImplementation,
  goToDeclaration,
  nextMethod,
  previousMethod,
} = require('./commands.js');

const THEME_BY_SCHEME = {
  fancy: 'Code4Delphi Fancy',
  turboPascal: 'Code4Delphi Turbo Pascal',
  delphiDark: 'Code4Delphi Delphi Dark',
  delphiLight: 'Code4Delphi Delphi Light',
};

/**
 * Activate the color theme matching `delphi.colorScheme`.
 * `none` leaves the user's current theme untouched.
 */
function applyColorScheme() {
  const scheme = getConfig().colorScheme;
  const theme = THEME_BY_SCHEME[scheme];
  if (!theme) {
    return;
  }
  vscode.workspace
    .getConfiguration('workbench')
    .update('colorTheme', theme, vscode.ConfigurationTarget.Global)
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
