'use strict';

const vscode = require('vscode');

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('delphi');
  return {
    navigation: {
      enabled: cfg.get('navigation.enabled', true),
      goToImplementation: cfg.get('navigation.goToImplementation', true),
      goToDeclaration: cfg.get('navigation.goToDeclaration', true),
      nextPreviousMethod: cfg.get('navigation.nextPreviousMethod', true),
      matchOverloads: cfg.get('navigation.matchOverloads', true),
      jumpToSection: cfg.get('navigation.jumpToSection', true),
      showStatusMessage: cfg.get('navigation.showStatusMessage', false),
    },
    keybindings: {
      style: cfg.get('keybindings.style', 'default'),
    },
    colorScheme: cfg.get('colorScheme', 'auto'),
    folding: {
      sections: cfg.get('folding.sections', true),
      beginEnd: cfg.get('folding.beginEnd', true),
    },
    formLayout: {
      labels: {
        showName: cfg.get('formLayout.labels.showName', true),
        showClassName: cfg.get('formLayout.labels.showClassName', false),
        showCaption: cfg.get('formLayout.labels.showCaption', false),
        showAlign: cfg.get('formLayout.labels.showAlign', false),
      },
    },
  };
}

module.exports = { getConfig };
