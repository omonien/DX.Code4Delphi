'use strict';

const vscode = require('vscode');
const path = require('path');
const { parseDfm } = require('./parser.js');
const { applyAlignLayout } = require('./layoutEngine.js');
const { DomRenderProvider } = require('./render/DomRenderProvider.js');

/**
 * Manages a single Form Layout webview panel for a given document.
 * Selection state lives here; the render provider is pluggable.
 */
class FormLayoutView {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {vscode.TextDocument} document
   * @param {object} [options]
   * @param {string} [options.providerId='dom']
   */
  constructor(context, document, options = {}) {
    this.context = context;
    this.document = document;
    this.providerId = options.providerId || 'dom';

    /** @type {import('./model').FormNode|null} */
    this.root = null;
    /** @type {string|null} */
    this.selectedId = null;

    this.panel = vscode.window.createWebviewPanel(
      'code4delphi.formLayout',
      `Layout: ${this._title()}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    this.panel.onDidDispose(() => this.dispose(), null, context.subscriptions);

    // Re-parse when the source document changes
    this._changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === this.document.uri.toString()) {
        this._refreshFromDocument();
      }
    });

    this.panel.webview.onDidReceiveMessage(
      (msg) => this._onMessage(msg),
      null,
      context.subscriptions
    );

    this._refreshFromDocument();
  }

  _title() {
    const name = this.document.fileName.split(/[/\\]/).pop() || 'Form';
    return name;
  }

  _refreshFromDocument() {
    try {
      this.root = parseDfm(this.document.getText());
      if (this.root) {
        // Prefer framework hint from file extension; fall back to auto-detect
        const ext = path.extname(this.document.fileName).toLowerCase();
        const framework = ext === '.fmx' ? 'fmx' : (ext === '.dfm' ? 'vcl' : 'auto');
        applyAlignLayout(this.root, { framework });
      }
    } catch (err) {
      this.root = null;
      console.error('[Code4Delphi] DFM parse / layout error', err);
    }
    this.selectedId = null;
    this._updateHtml();
  }

  _buildHighlightedIds() {
    const set = new Set();
    if (!this.root || !this.selectedId) return set;
    const node = this.root.findById(this.selectedId);
    if (!node) return set;
    set.add(node.id);
    for (const d of node.descendants) {
      set.add(d.id);
    }
    return set;
  }

  _updateHtml() {
    const state = {
      selectedId: this.selectedId,
      highlightedIds: Array.from(this._buildHighlightedIds()),
    };

    this.panel.webview.html = this._getHtml(this.root, state);
  }

  _getHtml(root, state) {
    const treeJson = JSON.stringify(root, (key, value) => {
      if (key === 'parent') return undefined;
      return value;
    });
    const stateJson = JSON.stringify(state);
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Form Layout</title>
  <style nonce="${nonce}">
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #host { width: 100%; height: 100%; }
    ${INLINE_CSS}
  </style>
</head>
<body>
  <div id="host"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = ${treeJson};
    let state = ${stateJson};

    function select(id) {
      state.selectedId = id;
      const highlighted = new Set();
      if (id && root) {
        const node = findById(root, id);
        if (node) {
          highlighted.add(node.id);
          collectDescendants(node, highlighted);
        }
      }
      state.highlightedIds = Array.from(highlighted);
      render();
      vscode.postMessage({ type: 'select', nodeId: id });
    }

    function findById(node, id) {
      if (!node) return null;
      if (node.id === id) return node;
      for (const c of (node.children || [])) {
        const f = findById(c, id);
        if (f) return f;
      }
      return null;
    }

    function collectDescendants(node, set) {
      for (const c of (node.children || [])) {
        set.add(c.id);
        collectDescendants(c, set);
      }
    }

    function render() {
      const host = document.getElementById('host');
      host.innerHTML = '';
      if (!root) {
        host.innerHTML = '<div class="c4d-empty">No form structure found.</div>';
        return;
      }
      const viewport = document.createElement('div');
      viewport.className = 'c4d-viewport';
      host.appendChild(viewport);
      const stage = document.createElement('div');
      stage.className = 'c4d-stage';
      const rw = Math.max((root.bounds && root.bounds.width) || 400, 200);
      const rh = Math.max((root.bounds && root.bounds.height) || 300, 150);
      stage.style.width = rw + 'px';
      stage.style.height = rh + 'px';
      viewport.appendChild(stage);
      buildNode(root, stage, true);
    }

    function buildNode(node, parentEl, isRoot) {
      const el = document.createElement('div');
      el.className = 'c4d-box';
      el.dataset.nodeId = node.id;
      if (node.id === state.selectedId) el.classList.add('c4d-selected');
      else if (state.highlightedIds && state.highlightedIds.indexOf(node.id) >= 0) el.classList.add('c4d-highlight-child');

      const b = node.bounds || {};
      if (isRoot) {
        el.style.left = '0'; el.style.top = '0';
        el.style.width = '100%'; el.style.height = '100%';
        el.classList.add('c4d-root');
      } else {
        el.style.left = (b.left || 0) + 'px';
        el.style.top = (b.top || 0) + 'px';
        el.style.width = Math.max(b.width || 20, 8) + 'px';
        el.style.height = Math.max(b.height || 16, 8) + 'px';
      }

      const label = document.createElement('div');
      label.className = 'c4d-label';
      const alignSuffix = (node.align && node.align !== 'None') ? (' [' + node.align + ']') : '';
      label.textContent = (node.name || ('(' + node.className + ')')) + alignSuffix;
      label.title = (node.name || '') + ' : ' + node.className + alignSuffix;
      el.appendChild(label);

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        select(node.id);
      });
      el.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        vscode.postMessage({ type: 'goto', nodeId: node.id });
      });

      parentEl.appendChild(el);
      for (const child of (node.children || [])) {
        buildNode(child, el, false);
      }
    }

    render();
  </script>
</body>
</html>`;
  }

  _onMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'select') {
      this.selectedId = msg.nodeId || null;
      // selection already reflected in webview; optional host-side tracking
    } else if (msg.type === 'goto') {
      const node = this.root && this.root.findById(msg.nodeId);
      if (node && typeof node.startLine === 'number') {
        const pos = new vscode.Position(node.startLine, 0);
        vscode.window.showTextDocument(this.document, {
          selection: new vscode.Range(pos, pos),
          preview: false,
        });
      }
    }
  }

  dispose() {
    if (this._changeSub) this._changeSub.dispose();
    if (this.panel) this.panel.dispose();
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

const INLINE_CSS = `
  .c4d-formlayout-host, #host {
    position: relative; width: 100%; height: 100%; overflow: auto;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #cccccc);
    font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 12px;
  }
  .c4d-empty { padding: 24px; opacity: 0.7; }
  .c4d-viewport { padding: 16px; min-width: 100%; min-height: 100%; box-sizing: border-box; }
  .c4d-stage {
    position: relative; background: var(--vscode-sideBar-background, #252526);
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .c4d-box {
    position: absolute; box-sizing: border-box;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    background: rgba(128,128,128,0.08); overflow: hidden; cursor: pointer;
    transition: border-color 0.1s, background 0.1s, box-shadow 0.1s;
  }
  .c4d-box:hover {
    border-color: var(--vscode-focusBorder, #007acc);
    background: rgba(0,122,204,0.12);
  }
  .c4d-root { background: transparent; border-style: dashed; }
  .c4d-selected {
    border: 2px solid var(--vscode-focusBorder, #007acc) !important;
    background: rgba(0,122,204,0.18) !important;
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc); z-index: 10;
  }
  .c4d-highlight-child {
    border: 1px dashed var(--vscode-charts-orange, #ce9178) !important;
    background: rgba(206,145,120,0.15) !important;
  }
  .c4d-label {
    position: absolute; top: 1px; left: 3px; right: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: 10px; line-height: 1.2; pointer-events: none;
    color: var(--vscode-descriptionForeground, #9d9d9d);
  }
  .c4d-selected > .c4d-label, .c4d-highlight-child > .c4d-label {
    color: var(--vscode-editor-foreground, #cccccc); font-weight: 600;
  }
`;

module.exports = { FormLayoutView };
