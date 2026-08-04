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

  return;
}

function deactivate() {
  // nothing to clean up
}

module.exports = { activate, deactivate };
