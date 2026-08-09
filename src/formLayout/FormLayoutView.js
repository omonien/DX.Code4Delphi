'use strict';

const vscode = require('vscode');
const path = require('path');
const { parseDfm, getTextProperties } = require('./parser.js');
const { applyAlignLayout } = require('./layoutEngine.js');
const { DomRenderProvider } = require('./render/DomRenderProvider.js');

/** Available render providers, keyed by their id. */
const RENDER_PROVIDERS = {
  [DomRenderProvider.id]: DomRenderProvider,
};

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
    this.providerId = options.providerId || DomRenderProvider.id;

    const Provider = RENDER_PROVIDERS[this.providerId] || DomRenderProvider;
    /** @type {import('./render/IRenderProvider').IRenderProvider} */
    this.renderProvider = new Provider();

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
    // `id` is a getter and would not survive JSON.stringify, so serialize it
    // explicitly — the webview must use the exact same ids as the host, or
    // selection and the property map would not line up.
    const treeJson = embedJson(serializeNode(root));
    const stateJson = embedJson(state);
    const propsJson = embedJson(propertiesMap);
    const nonce = getNonce();
    const providerScript = this.renderProvider.buildClientScript();
    const providerCss = this.renderProvider.buildCss();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Form Layout</title>
  <style nonce="${nonce}">
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    ${CHROME_CSS}
    ${providerCss}
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
      // node.id comes from the host (path-based, unique) - never recompute it here.
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

${providerScript}

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
      applySelection();
      renderInspector(id);
      vscode.postMessage({ type: 'select', nodeId: id });
    }

    host.addEventListener('click', function() {
      selectedId = null;
      highlightedIds = new Set();
      applySelection();
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

/**
 * Plain, cycle-free snapshot of the node tree for the webview.
 * Drops `parent` (circular) and materializes the `id` getter.
 *
 * @param {import('./model').FormNode|null} node
 * @returns {object|null}
 */
function serializeNode(node) {
  if (!node) return null;
  return {
    id: node.id,
    name: node.name,
    className: node.className,
    kind: node.kind,
    align: node.align,
    bounds: node.bounds,
    storedBounds: node.storedBounds,
    startLine: node.startLine,
    endLine: node.endLine,
    children: (node.children || []).map(serializeNode),
  };
}

/**
 * JSON for embedding inside an inline <script> block.
 *
 * DFM property values are arbitrary user text, so a Caption like
 * `'</script><script>…'` would otherwise close the script element early and
 * execute as markup — the CSP nonce does not help, because the injected code
 * would sit inside the same already-nonced block. Escaping `<` defeats that,
 * and U+2028/U+2029 are escaped because they are literal line terminators in
 * JavaScript string literals but legal inside JSON strings.
 *
 * @param {any} value
 * @param {(key: string, value: any) => any} [replacer]
 * @returns {string}
 */
function embedJson(value, replacer) {
  return JSON.stringify(value, replacer)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/`/g, '\\u0060')
    .replace(/\$/g, '\\u0024');
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Chrome shared by every render provider: the two-pane shell and the
 * property inspector. The drawing surface itself is styled by the
 * provider's own CSS (see DomRenderProvider#buildCss).
 */
const CHROME_CSS = `
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
`;

module.exports = { FormLayoutView };
