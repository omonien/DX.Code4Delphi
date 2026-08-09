'use strict';

/**
 * Build FormLayoutView webview HTML suitable for headless browser tests.
 * Mocks acquireVsCodeApi and records postMessage traffic on window.__msgs.
 */

const Module = require('node:module');
const path = require('node:path');

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
let lastPanel = null;

function createPanel() {
  return {
    webview: {
      html: '',
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
    showTextDocument() {},
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
    getConfiguration() {
      return {
        get(key, defaultValue) {
          if (key === 'formLayout.labels.showName') return true;
          if (key === 'formLayout.labels.showClassName') return false;
          if (key === 'formLayout.labels.showCaption') return false;
          if (key === 'formLayout.labels.showAlign') return false;
          return defaultValue;
        },
      };
    },
  },
};

const originalLoad = Module._load;
if (!Module.__c4dWebviewMocked) {
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.apply(this, arguments);
  };
  Module.__c4dWebviewMocked = true;
}

const { FormLayoutView } = require('../../src/formLayout/FormLayoutView.js');

function makeDocument(text, fileName = '/tmp/Playwright.dfm') {
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

/**
 * @param {string} dfmText
 * @param {{ selectedId?: string|null, fileName?: string }} [opts]
 * @returns {{ html: string, view: import('../../src/formLayout/FormLayoutView').FormLayoutView }}
 */
function buildWebviewPage(dfmText, opts = {}) {
  const fileName = opts.fileName || path.join('/tmp', 'Playwright.dfm');
  const view = new FormLayoutView({ subscriptions: [] }, makeDocument(dfmText, fileName));
  if (opts.selectedId) {
    view.selectedId = opts.selectedId;
    view._updateHtml();
  }
  let html = view.panel.webview.html;
  // Browser has no acquireVsCodeApi — inject a mock and capture messages
  html = html.replace(
    'const vscode = acquireVsCodeApi();',
    `window.__msgs = [];
    const vscode = {
      postMessage: function(m) { window.__msgs.push(m); }
    };`
  );
  return { html, view };
}

module.exports = {
  buildWebviewPage,
  vscodeMock,
  documentsByUri,
};
