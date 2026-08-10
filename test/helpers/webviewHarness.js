'use strict';

/**
 * Build FormLayoutView webview HTML suitable for headless browser tests.
 * Mocks acquireVsCodeApi and records postMessage traffic on window.__msgs.
 * The vscode module mock is shared with the unit tests (vscodeMock.js).
 */

const path = require('node:path');
const mock = require('./vscodeMock.js');

mock.install();

const { FormLayoutView } = require('../../src/formLayout/FormLayoutView.js');

/**
 * @param {string} dfmText
 * @param {{ selectedId?: string|null, fileName?: string }} [opts]
 * @returns {{ html: string, view: import('../../src/formLayout/FormLayoutView').FormLayoutView }}
 */
function buildWebviewPage(dfmText, opts = {}) {
  const fileName = opts.fileName || path.join('/tmp', 'Playwright.dfm');
  const view = new FormLayoutView({ subscriptions: [] }, mock.makeDocument(dfmText, fileName));
  if (opts.selectedId) {
    view.selectedId = opts.selectedId;
    view._bootstrapped = false; // force full HTML so the state is embedded
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
  vscodeMock: mock.vscodeMock,
  documentsByUri: mock.documentsByUri,
};
