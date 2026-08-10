'use strict';

/**
 * Shared `vscode` module mock for FormLayoutView host tests.
 * Single source for panel/webview/WorkspaceEdit/applyEdit semantics so the
 * unit and Playwright harness suites verify identical product behavior.
 */

const Module = require('node:module');

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}
class WorkspaceEdit {
  constructor() {
    this.replacements = [];
  }
  replace(uri, range, text) {
    this.replacements.push({ uri, range, text });
  }
}

const documentsByUri = new Map();
const shownDocuments = [];
let lastPanel = null;

function createPanel() {
  return {
    webview: {
      html: '',
      posted: [],
      postMessage(msg) {
        this.posted.push(msg);
        return Promise.resolve(true);
      },
      onDidReceiveMessage(handler) {
        this._handler = handler;
        return { dispose() {} };
      },
    },
    reveal() {},
    onDidDispose() {
      return { dispose() {} };
    },
  };
}

const vscodeMock = {
  Position,
  Range,
  WorkspaceEdit,
  ViewColumn: { One: 1, Beside: 2 },
  window: {
    createWebviewPanel() {
      lastPanel = createPanel();
      return lastPanel;
    },
    showTextDocument(document, options) {
      shownDocuments.push({ document, options });
    },
    showInformationMessage() {},
  },
  workspace: {
    onDidChangeTextDocument() {
      return { dispose() {} };
    },
    applyEdit(edit) {
      for (const rep of edit.replacements || []) {
        const doc = documentsByUri.get(rep.uri.toString());
        if (!doc) continue;
        const lines = doc
          .getText()
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n');
        const line = rep.range.start.line;
        const startCol = rep.range.start.character;
        const endCol = rep.range.end.character;
        const row = lines[line] || '';
        lines[line] = row.slice(0, startCol) + rep.text + row.slice(endCol);
        doc._text = lines.join('\n');
      }
      return Promise.resolve(true);
    },
    // Fall through to real defaults so configuration.js/package.json stay
    // the single source of truth for setting defaults.
    getConfiguration() {
      return { get: (key, defaultValue) => defaultValue };
    },
  },
};

let installed = false;
function install() {
  if (installed) return;
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.apply(this, arguments);
  };
  installed = true;
}

function makeDocument(text, fileName = '/tmp/Test.dfm') {
  const uriStr = 'file://' + fileName;
  const doc = {
    fileName,
    uri: { toString: () => uriStr, fsPath: fileName },
    _text: text,
    getText() {
      return this._text;
    },
  };
  documentsByUri.set(uriStr, doc);
  return doc;
}

function getLastPanel() {
  return lastPanel;
}

module.exports = {
  install,
  makeDocument,
  vscodeMock,
  documentsByUri,
  shownDocuments,
  getLastPanel,
  Position,
  Range,
  WorkspaceEdit,
};
