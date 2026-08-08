'use strict';

const vscode = require('vscode');
const path = require('path');
const { parseDfm, getTextProperties } = require('./parser.js');
const { applyAlignLayout } = require('./layoutEngine.js');

/**
 * Manages a single Form Layout webview panel for a given document.
 * Selection state lives here; the render provider is pluggable.
 * MVP: box layout + read-only text property inspector (no binary props).
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

  /**
   * Build a flat map id → text properties for the inspector (sent once with the tree).
   * @returns {Record<string, { name: string, value: string }[]>}
   */
  _buildPropertiesMap() {
    /** @type {Record<string, { name: string, value: string }[]>} */
    const map = {};
    if (!this.root) return map;
    this.root.walk((n) => {
      map[n.id] = getTextProperties(n);
    });
    return map;
  }

  _updateHtml() {
    const state = {
      selectedId: this.selectedId,
      highlightedIds: Array.from(this._buildHighlightedIds()),
    };
    this.panel.webview.html = this._getHtml(this.root, state, this._buildPropertiesMap());
  }

  /**
   * @param {import('./model').FormNode|null} root
   * @param {{ selectedId: string|null, highlightedIds: string[] }} state
   * @param {Record<string, { name: string, value: string }[]>} propertiesMap
   */
  _getHtml(root, state, propertiesMap) {
    const treeJson = JSON.stringify(root, (key, value) => {
      if (key === 'parent') return undefined;
      return value;
    });
    const stateJson = JSON.stringify(state);
    const propsJson = JSON.stringify(propertiesMap);
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
    ${INLINE_CSS}
  </style>
</head>
<body>
  <div id="app">
    <div id="layout-pane">
      <div id="host"></div>
    </div>
    <div id="inspector-pane">
      <div id="inspector-header">Properties</div>
      <div id="inspector-subtitle"></div>
      <div id="inspector-body">
        <div class="c4d-inspector-empty">Select a control to view its text properties.</div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const tree = ${treeJson};
    const initialState = ${stateJson};
    const propertiesMap = ${propsJson};

    function rehydrate(node, parent) {
      if (!node) return null;
      parent = parent || null;
      node.parent = parent;
      node.id = node.name || ((parent && parent.id) ? parent.id + '::' + node.className : node.className);
      node.descendants = [];
      node.children = (node.children || []).map(function(c) { return rehydrate(c, node); });
      function collect(n, list) {
        for (var i = 0; i < n.children.length; i++) {
          list.push(n.children[i]);
          collect(n.children[i], list);
        }
      }
      collect(node, node.descendants);
      node.findById = function(id) {
        if (this.id === id) return this;
        for (var i = 0; i < this.children.length; i++) {
          var f = this.children[i].findById(id);
          if (f) return f;
        }
        return null;
      };
      return node;
    }
    const root = rehydrate(tree);

    const host = document.getElementById('host');
    const inspectorBody = document.getElementById('inspector-body');
    const inspectorSubtitle = document.getElementById('inspector-subtitle');
    let selectedId = initialState.selectedId || null;
    let highlightedIds = new Set(initialState.highlightedIds || []);

    function renderLayout() {
      host.innerHTML = '';
      host.className = 'c4d-formlayout-host';
      if (!root) {
        host.innerHTML = '<div class="c4d-empty">No form structure found in this file.</div>';
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
      if (node.id === selectedId) el.classList.add('c4d-selected');
      else if (highlightedIds.has(node.id)) el.classList.add('c4d-highlight-child');

      const b = node.bounds || { left: 0, top: 0, width: 0, height: 0 };
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

      el.addEventListener('click', function(ev) {
        ev.stopPropagation();
        select(node.id);
      });
      el.addEventListener('dblclick', function(ev) {
        ev.stopPropagation();
        vscode.postMessage({ type: 'goto', nodeId: node.id });
      });

      parentEl.appendChild(el);
      for (var i = 0; i < (node.children || []).length; i++) {
        buildNode(node.children[i], el, false);
      }
    }

    function renderInspector(id) {
      inspectorBody.innerHTML = '';
      if (!id || !root) {
        inspectorSubtitle.textContent = '';
        inspectorBody.innerHTML = '<div class="c4d-inspector-empty">Select a control to view its text properties.</div>';
        return;
      }
      const node = root.findById(id);
      if (!node) {
        inspectorSubtitle.textContent = '';
        inspectorBody.innerHTML = '<div class="c4d-inspector-empty">Select a control to view its text properties.</div>';
        return;
      }
      const title = (node.name || '(unnamed)') + ' : ' + (node.className || '');
      inspectorSubtitle.textContent = title;

      const props = propertiesMap[id] || propertiesMap[node.id] || [];
      if (!props.length) {
        inspectorBody.innerHTML = '<div class="c4d-inspector-empty">No text properties on this control.</div>';
        return;
      }
      const table = document.createElement('table');
      table.className = 'c4d-prop-table';
      for (var i = 0; i < props.length; i++) {
        const row = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.className = 'c4d-prop-name';
        nameTd.textContent = props[i].name;
        nameTd.title = props[i].name;
        const valueTd = document.createElement('td');
        valueTd.className = 'c4d-prop-value';
        valueTd.textContent = props[i].value;
        valueTd.title = props[i].value;
        row.appendChild(nameTd);
        row.appendChild(valueTd);
        table.appendChild(row);
      }
      inspectorBody.appendChild(table);
    }

    function select(id) {
      selectedId = id;
      highlightedIds = new Set();
      if (root) {
        const n = root.findById(id);
        if (n) {
          highlightedIds.add(n.id);
          for (var i = 0; i < n.descendants.length; i++) {
            highlightedIds.add(n.descendants[i].id);
          }
        }
      }
      host.querySelectorAll('.c4d-box').forEach(function(el) {
        const nid = el.dataset.nodeId;
        el.classList.toggle('c4d-selected', nid === selectedId);
        el.classList.toggle('c4d-highlight-child', nid !== selectedId && highlightedIds.has(nid));
      });
      renderInspector(id);
      vscode.postMessage({ type: 'select', nodeId: id });
    }

    host.addEventListener('click', function() {
      selectedId = null;
      highlightedIds = new Set();
      host.querySelectorAll('.c4d-box').forEach(function(el) {
        el.classList.remove('c4d-selected', 'c4d-highlight-child');
      });
      renderInspector(null);
      vscode.postMessage({ type: 'select', nodeId: null });
    });

    renderLayout();
    if (selectedId) renderInspector(selectedId);
  </script>
</body>
</html>`;
  }

  _onMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'select') {
      this.selectedId = msg.nodeId || null;
    } else if (msg.type === 'goto') {
      this._gotoSource(msg.nodeId);
    }
  }

  _gotoSource(nodeId) {
    if (!this.root || !nodeId) return;
    const node = this.root.findById(nodeId);
    if (!node) return;
    const line = Math.max(0, node.startLine || 0);
    const pos = new vscode.Position(line, 0);
    vscode.window.showTextDocument(this.document, {
      viewColumn: vscode.ViewColumn.One,
      selection: new vscode.Range(pos, pos),
      preview: false,
    });
  }

  dispose() {
    if (this._changeSub) {
      this._changeSub.dispose();
      this._changeSub = null;
    }
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
  #app {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #cccccc);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: 12px;
  }
  #layout-pane {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  #host {
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  #inspector-pane {
    flex: 0 0 280px;
    width: 280px;
    max-width: 40%;
    height: 100%;
    border-left: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #inspector-header {
    flex: 0 0 auto;
    padding: 8px 12px 4px;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground, #9d9d9d);
  }
  #inspector-subtitle {
    flex: 0 0 auto;
    padding: 0 12px 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--vscode-editor-foreground, #cccccc);
  }
  #inspector-body {
    flex: 1 1 auto;
    overflow: auto;
    padding: 0 0 8px;
  }
  .c4d-inspector-empty {
    padding: 12px 16px;
    opacity: 0.65;
    font-size: 12px;
    line-height: 1.4;
  }
  .c4d-prop-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .c4d-prop-table tr:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
  }
  .c4d-prop-name {
    width: 42%;
    padding: 4px 8px 4px 12px;
    vertical-align: top;
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }
  .c4d-prop-value {
    width: 58%;
    padding: 4px 12px 4px 4px;
    vertical-align: top;
    color: var(--vscode-editor-foreground, #cccccc);
    word-break: break-word;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }
  .c4d-formlayout-host {
    position: relative; width: 100%; height: 100%; overflow: auto;
    background: var(--vscode-editor-background, #1e1e1e);
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
