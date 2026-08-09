'use strict';

const vscode = require('vscode');
const path = require('path');
const { parseDfm, getTextProperties } = require('./parser.js');
const { applyAlignLayout } = require('./layoutEngine.js');
const { DomRenderProvider } = require('./render/DomRenderProvider.js');
const { getConfig } = require('../configuration.js');

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
    /** @type {{showName:boolean,showClassName:boolean,showCaption:boolean,showAlign:boolean}} */
    this._labelOpts = { ...getConfig().formLayout.labels };

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

    this._suppressRefresh = false;

    this._changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === this.document.uri.toString() && !this._suppressRefresh) {
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
      labelOpts: this._labelOpts,
    };
    this.panel.webview.html = this._getHtml(this.root, state, this._buildPropertiesMap());
  }

  /**
   * @param {import('./model').FormNode|null} root
   * @param {{ selectedId: string|null, highlightedIds: string[] }} state
   * @param {Record<string, { name: string, value: string }[]>} propertiesMap
   */
  _getHtml(root, state, propertiesMap) {
    const treeJson = embedJson(serializeNode(root));
    const stateJson = embedJson(state);
    const propsJson = embedJson(propertiesMap);
    const nonce = getNonce();
    const providerScript = this.renderProvider.buildClientScript();
    const providerCss = this.renderProvider.buildCss();
    const labelConfig = embedJson(getConfig().formLayout.labels);

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
    <div id="tree-pane">
      <div id="tree-header"><button id="tree-toggle" class="c4d-toggle" title="Toggle tree panel">&#x25C2;</button><span class="c4d-header-text">Controls</span></div>
      <input id="tree-filter" type="text" placeholder="Filter components...">      <div id="tree-body"></div>
    </div>
    <div id="layout-pane">
      <div id="host"></div>
      <div id="zoom-bar">
        <button id="zoom-out" title="Zoom out">&minus;</button>
        <input id="zoom-input" type="text" value="100" maxlength="4">
        <span class="c4d-zoom-unit">%</span>
        <button id="zoom-in" title="Zoom in">+</button>
        <span class="c4d-separator"></span>
        <label class="c4d-label-opt" title="Show component name"><input type="checkbox" id="opt-name" checked> Name</label>
        <label class="c4d-label-opt" title="Show class name"><input type="checkbox" id="opt-class"> Class</label>
        <label class="c4d-label-opt" title="Show Caption / Text"><input type="checkbox" id="opt-caption"> Text</label>
        <label class="c4d-label-opt" title="Show Align"><input type="checkbox" id="opt-align"> Align</label>
      </div>
    </div>
    <div id="inspector-pane">
      <div id="inspector-header"><span class="c4d-header-text">Properties</span><button id="inspector-toggle" class="c4d-toggle" title="Toggle inspector">&#x25B8;</button></div>
      <div id="inspector-subtitle"></div>
      <div id="inspector-body">
        <div class="c4d-inspector-empty">Select a control to view its text properties.</div>
      </div>
      <div id="inspector-footer">Values are plain text — no syntax or type validation. Edits at your own risk. Use git.</div>
    </div>
  </div>
  <script nonce="${nonce}">
    try {
    const vscode = acquireVsCodeApi();
    const tree = ${treeJson};
    const initialState = ${stateJson};
    const propertiesMap = ${propsJson};
    const labelConfig = ${labelConfig};

    function rehydrate(node, parent) {
      if (!node) return null;
      parent = parent || null;
      node.parent = parent;
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
    const treeBody = document.getElementById('tree-body');
    const zoomInput = document.getElementById('zoom-input');
    const toggleTree = document.getElementById('tree-toggle');
    const toggleInspector = document.getElementById('inspector-toggle');
    let selectedId = initialState.selectedId || null;
    let highlightedIds = new Set(initialState.highlightedIds || []);
    let zoomLevel = 1;

    function updateZoomInput() {
      zoomInput.value = Math.round(zoomLevel * 100);
    }

    function applyZoom() {
      var vp = host.querySelector('.c4d-viewport');
      if (vp) vp.style.zoom = zoomLevel;
    }

    function setZoomFromInput() {
      var v = parseInt(zoomInput.value, 10);
      if (isNaN(v) || v <= 0) { updateZoomInput(); return; }
      zoomLevel = Math.min(400, Math.max(25, v)) / 100;
      updateZoomInput();
      applyZoom();
    }

    zoomInput.addEventListener('change', setZoomFromInput);
    zoomInput.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); setZoomFromInput(); }
    });

    document.getElementById('zoom-out').addEventListener('click', function() {
      zoomLevel = Math.max(0.25, zoomLevel - 0.25);
      updateZoomInput();
      applyZoom();
    });
    document.getElementById('zoom-in').addEventListener('click', function() {
      zoomLevel = Math.min(4, zoomLevel + 0.25);
      updateZoomInput();
      applyZoom();
    });

    document.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape' && selectedId && root) {
        ev.preventDefault();
        var node = root.findById(selectedId);
        if (node && node.parent) {
          select(node.parent.id);
        }
      }
    });

    // Label display flags from state (persisted) or extension config (default)
    var showName = (initialState.labelOpts || labelConfig).showName;
    var showClass = (initialState.labelOpts || labelConfig).showClassName;
    var showCaption = (initialState.labelOpts || labelConfig).showCaption;
    var showAlign = (initialState.labelOpts || labelConfig).showAlign;

    document.getElementById('opt-name').checked = showName;
    document.getElementById('opt-class').checked = showClass;
    document.getElementById('opt-caption').checked = showCaption;
    document.getElementById('opt-align').checked = showAlign;

    function getLabelText(node) {
      var parts = [];
      if (showName && node.name) parts.push(node.name);
      if (showClass) parts.push(node.className);
      if (showCaption) {
        var cap = nodeCaption(node);
        if (cap) parts.push(cap);
      }
      if (showAlign && node.align && node.align !== 'None') parts.push('[' + node.align + ']');
      return parts.join(' \u00b7 ');
    }

    function nodeCaption(node) {
      if (!node || !node.id) return null;
      var props = propertiesMap[node.id] || [];
      for (var i = 0; i < props.length; i++) {
        var n = props[i].name.toLowerCase();
        if (n === 'caption' || n === 'text') {
          return props[i].value;
        }
      }
      return null;
    }

    function refreshLabels() {
      host.querySelectorAll('.c4d-box').forEach(function(box) {
        var nid = box.dataset.nodeId;
        if (!nid || !root) return;
        var node = root.findById(nid);
        if (!node) return;
        var label = box.querySelector('.c4d-label');
        if (label) label.textContent = getLabelText(node);
      });
    }

    function onLabelOptChange() {
      showName = document.getElementById('opt-name').checked;
      showClass = document.getElementById('opt-class').checked;
      showCaption = document.getElementById('opt-caption').checked;
      showAlign = document.getElementById('opt-align').checked;
      refreshLabels();
      var tb = document.getElementById('form-title-bar');
      if (tb && root) {
        var parts = [];
        if (showName && root.name) parts.push(root.name);
        if (showClass) parts.push(root.className);
        if (showCaption) {
          var cap = nodeCaption(root);
          if (cap) parts.push(cap);
        }
        if (showAlign && root.align && root.align !== 'None') parts.push('[' + root.align + ']');
        tb.textContent = parts.join(' \u00b7 ') || root.name || root.className;
      }
      vscode.postMessage({ type: 'labelOpts', showName: showName, showClassName: showClass, showCaption: showCaption, showAlign: showAlign });
    }

    document.getElementById('opt-name').addEventListener('change', onLabelOptChange);
    document.getElementById('opt-class').addEventListener('change', onLabelOptChange);
    document.getElementById('opt-caption').addEventListener('change', onLabelOptChange);
    document.getElementById('opt-align').addEventListener('change', onLabelOptChange);

${providerScript}

    function renderInspector(id) {
      inspectorBody.innerHTML = '';
      if (!id || !root) {
        inspectorSubtitle.textContent = '';
        inspectorBody.innerHTML = '<div class="c4d-inspector-empty">Select a control to view its text properties.</div>';
        return;
      }
      var node = root.findById(id);
      if (!node) {
        inspectorSubtitle.textContent = '';
        inspectorBody.innerHTML = '<div class="c4d-inspector-empty">Select a control to view its text properties.</div>';
        return;
      }
      var title = (node.name || '(unnamed)') + ' : ' + (node.className || '');
      inspectorSubtitle.textContent = title;

      var props = propertiesMap[id] || propertiesMap[node.id] || [];
      if (!props.length) {
        inspectorBody.innerHTML = '<div class="c4d-inspector-empty">No text properties on this control.</div>';
        return;
      }
      var table = document.createElement('table');
      table.className = 'c4d-prop-table';
      for (var i = 0; i < props.length; i++) {
        var row = document.createElement('tr');
        var nameTd = document.createElement('td');
        nameTd.className = 'c4d-prop-name';
        nameTd.textContent = props[i].name;
        nameTd.title = props[i].name;
        var valueTd = document.createElement('td');
        valueTd.className = 'c4d-prop-value';
        var displayValue = props[i].value;
        valueTd.textContent = displayValue;
        valueTd.title = displayValue + ' (click to edit)';
        valueTd.addEventListener('click', (function(propName, nodeId) {
          return function() { startEditProp(this, propName, nodeId); };
        })(props[i].name, id));
        row.appendChild(nameTd);
        row.appendChild(valueTd);
        table.appendChild(row);
      }
      inspectorBody.appendChild(table);
    }

    function startEditProp(td, propName, nodeId) {
      if (td.querySelector('input')) return;
      var oldValue = td.textContent;
      td.textContent = '';

      var wrapper = document.createElement('div');
      wrapper.className = 'c4d-prop-edit-wrap';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'c4d-prop-edit';
      input.value = oldValue;
      wrapper.appendChild(input);

      var expandBtn = document.createElement('button');
      expandBtn.className = 'c4d-prop-expand';
      expandBtn.title = 'Open extended editor';
      expandBtn.textContent = '\u2026';
      wrapper.appendChild(expandBtn);
      td.appendChild(wrapper);

      input.focus();
      input.select();

      var editing = true;

      expandBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        editing = false;
        openExtendedEditor(function(newValue) {
          input.value = newValue;
          editing = true;
          input.focus();
        }, input.value, propName);
      });

      function commit() {
        if (!editing) return;
        editing = false;
        var newValue = input.value;
        td.textContent = newValue;
        td.title = newValue + ' (click to edit)';
        if (newValue !== oldValue) {
          vscode.postMessage({ type: 'setProp', nodeId: nodeId, propName: propName, value: newValue });
        }
      }

      function cancel() {
        if (!editing) return;
        editing = false;
        td.textContent = oldValue;
        td.title = oldValue + ' (click to edit)';
      }

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      });
    }

    function openExtendedEditor(callback, currentValue, propName) {
      var overlay = document.createElement('div');
      overlay.className = 'c4d-overlay';
      var box = document.createElement('div');
      box.className = 'c4d-overlay-box';
      var title = document.createElement('div');
      title.className = 'c4d-overlay-title';
      title.textContent = 'Edit ' + (propName || 'value');
      box.appendChild(title);
      var textarea = document.createElement('textarea');
      textarea.className = 'c4d-overlay-textarea';
      textarea.value = currentValue || '';
      textarea.rows = 10;
      box.appendChild(textarea);
      var buttons = document.createElement('div');
      buttons.className = 'c4d-overlay-buttons';
      var okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      buttons.appendChild(okBtn);
      buttons.appendChild(cancelBtn);
      box.appendChild(buttons);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function close(accept) {
        var val = textarea.value;
        document.body.removeChild(overlay);
        if (accept) callback(val);
      }

      okBtn.addEventListener('click', function() { close(true); });
      cancelBtn.addEventListener('click', function() { close(false); });
      overlay.addEventListener('click', function(ev) { if (ev.target === overlay) close(true); });
      textarea.addEventListener('keydown', function(ev) {
        if (ev.key === 'Escape') { close(false); }
      });
      textarea.focus();
    }

    function buildTree() {
      treeBody.innerHTML = '';
      if (!root) return;
      var ul = document.createElement('ul');
      ul.className = 'c4d-tree-list';
      buildTreeNode(root, ul);
      treeBody.appendChild(ul);
    }

    function buildTreeNode(node, parentUl) {
      var li = document.createElement('li');
      li.dataset.treeId = node.id;
      li.setAttribute('data-search', ((node.name || '') + ' ' + (node.className || '')).toLowerCase());
      li.className = 'c4d-tree-item';

      var row = document.createElement('div');
      row.className = 'c4d-tree-row';

      var icon = document.createElement('span');
      icon.className = 'c4d-tree-icon';
      icon.textContent = nodeClassIcon(node.className);
      icon.title = node.className;
      row.appendChild(icon);

      var label = document.createElement('span');
      label.className = 'c4d-tree-label';
      label.textContent = node.name || node.className;
      row.appendChild(label);

      row.addEventListener('click', function(ev) {
        ev.stopPropagation();
        select(node.id);
      });
      row.addEventListener('dblclick', function(ev) {
        ev.stopPropagation();
        vscode.postMessage({ type: 'goto', nodeId: node.id });
      });

      li.appendChild(row);

      if (node.children && node.children.length > 0) {
        var childUl = document.createElement('ul');
        childUl.className = 'c4d-tree-list';
        for (var i = 0; i < node.children.length; i++) {
          buildTreeNode(node.children[i], childUl);
        }
        li.appendChild(childUl);
      }

      parentUl.appendChild(li);
    }

    function applyTreeSelection() {
      treeBody.querySelectorAll('.c4d-tree-row').forEach(function(el) {
        var tid = el.parentElement.dataset.treeId;
        el.classList.toggle('c4d-tree-selected', tid === selectedId);
        el.classList.toggle('c4d-tree-highlighted', tid !== selectedId && highlightedIds.has(tid));
      });
    }

    function nodeClassIcon(cn) {
      if (!cn) return '?';
      // Strip leading T for Delphi classes, return first significant character
      var s = cn.charAt(0) === 'T' ? cn.charAt(1) || cn.charAt(0) : cn.charAt(0);
      return s.toUpperCase();
    }

    function select(id) {
      selectedId = id;
      highlightedIds = new Set();
      if (root) {
        var n = root.findById(id);
        if (n) {
          highlightedIds.add(n.id);
          for (var i = 0; i < n.descendants.length; i++) {
            highlightedIds.add(n.descendants[i].id);
          }
        }
      }
      applySelection();
      applyTreeSelection();
      renderInspector(id);
      vscode.postMessage({ type: 'select', nodeId: id });
    }

    host.addEventListener('click', function(ev) {
      if (ev.target !== host && ev.target.id !== 'host') return;
      selectedId = null;
      highlightedIds = new Set();
      applySelection();
      applyTreeSelection();
      renderInspector(null);
      vscode.postMessage({ type: 'select', nodeId: null });
    });

    toggleTree.addEventListener('click', function() {
      var pane = document.getElementById('tree-pane');
      var body = document.getElementById('tree-body');
      var text = pane.querySelector('.c4d-header-text');
      var filter = document.getElementById('tree-filter');
      var collapsed = pane.classList.toggle('c4d-collapsed');
      body.style.display = collapsed ? 'none' : '';
      text.style.display = collapsed ? 'none' : '';
      if (filter) filter.style.display = collapsed ? 'none' : '';
      toggleTree.innerHTML = collapsed ? '&#x25B8;' : '&#x25C2;';
    });

    toggleInspector.addEventListener('click', function() {
      var pane = document.getElementById('inspector-pane');
      var body = document.getElementById('inspector-body');
      var subtitle = document.getElementById('inspector-subtitle');
      var footer = document.getElementById('inspector-footer');
      var text = pane.querySelector('.c4d-header-text');
      var collapsed = pane.classList.toggle('c4d-collapsed');
      body.style.display = collapsed ? 'none' : '';
      if (subtitle) subtitle.style.display = collapsed ? 'none' : '';
      if (footer) footer.style.display = collapsed ? 'none' : '';
      text.style.display = collapsed ? 'none' : '';
      toggleInspector.innerHTML = collapsed ? '&#x25C2;' : '&#x25B8;';
    });

    buildTree();
    renderLayout();
    applyZoom();
    if (selectedId) {
      renderInspector(selectedId);
      applySelection();
      applyTreeSelection();
    }

    var treeFilter = document.getElementById('tree-filter');
    treeFilter.addEventListener('input', function() {
      var q = (treeFilter.value || '').toLowerCase();
      var rows = treeBody.querySelectorAll('.c4d-tree-item');
      rows.forEach(function(item) {
        var haystack = item.getAttribute('data-search') || '';
        item.classList.toggle('c4d-tree-item-hidden', q !== '' && haystack.indexOf(q) === -1);
      });
    });

    document.addEventListener('keydown', function(ev) {
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
      if (!root) return;
      var visible = [];
      treeBody.querySelectorAll('.c4d-tree-row').forEach(function(row) {
        if (!row.parentElement.classList.contains('c4d-tree-item-hidden')) visible.push(row);
      });
      if (!visible.length) return;
      var cur = -1;
      for (var i = 0; i < visible.length; i++) {
        if (visible[i].classList.contains('c4d-tree-selected')) { cur = i; break; }
      }
      var next;
      if (ev.key === 'ArrowDown') {
        next = cur < visible.length - 1 ? visible[cur + 1] : visible[0];
      } else {
        next = cur > 0 ? visible[cur - 1] : visible[visible.length - 1];
      }
      if (next) {
        var tid = next.parentElement.dataset.treeId;
        if (tid) { ev.preventDefault(); select(tid); }
      }
    });
    } catch (e) {
      document.getElementById('host').innerHTML = '<div style="padding:24px;color:#f14c4c;font-family:monospace;white-space:pre-wrap;">Script error: ' + (e && e.message ? e.message : String(e)) + '</div>';
    }
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
    } else if (msg.type === 'setProp') {
      this._setProperty(msg.nodeId, msg.propName, msg.value);
    } else if (msg.type === 'labelOpts') {
      this._labelOpts = {
        showName: msg.showName,
        showClassName: msg.showClassName,
        showCaption: msg.showCaption,
        showAlign: msg.showAlign,
      };
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

  /**
   * Write a property value back into the DFM source text.
   * Finds the property line within the node's line range and replaces the value.
   * @param {string} nodeId
   * @param {string} propName
   * @param {string} newValue
   */
  _setProperty(nodeId, propName, newValue) {
    if (!this.root || !nodeId) return;
    const node = this.root.findById(nodeId);
    if (!node) return;

    const text = this.document.getText();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const start = node.startLine || 0;
    const end = node.endLine || lines.length;

    // Find the property line within the node's range
    const propKey = propName.toLowerCase();
    const propRe = new RegExp('^(\\s*' + escapeRegex(propName) + '\\s*=\\s*)(.+)$', 'i');
    for (let i = start; i <= end && i < lines.length; i++) {
      const m = lines[i].match(propRe);
      if (m) {
        const prefix = m[1];
        const oldVal = m[2].trim();

        // Preserve quoting: if the old value was a Pascal string literal,
        // encode the new value using Delphi #xyz syntax for non-ASCII chars
        let quotedValue = newValue;
        if ((oldVal.startsWith("'") && oldVal.endsWith("'")) ||
            (oldVal.startsWith('"') && oldVal.endsWith('"'))) {
          quotedValue = encodeDfmString(newValue);
        }

        const edit = new vscode.WorkspaceEdit();
        const uri = this.document.uri;
        const range = new vscode.Range(
          new vscode.Position(i, prefix.length),
          new vscode.Position(i, lines[i].length)
        );
        edit.replace(uri, range, quotedValue);
        this._suppressRefresh = true;
        vscode.workspace.applyEdit(edit).then((applied) => {
          this._suppressRefresh = false;
          if (applied) this._refreshFromDocument();
        });
        return;
      }
    }
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
    ppi: node.ppi,
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

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Encode a plain string for a DFM property value.
 * Printable ASCII stays in single quotes; characters outside that range
 * are encoded as Delphi #xyz decimal character codes.
 *
 * @param {string} s
 * @returns {string}
 */
function encodeDfmString(s) {
  if (typeof s !== 'string') return String(s);
  var parts = [];
  var literal = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charCodeAt(i);
    if (ch >= 32 && ch <= 126 && ch !== 39) {  // 39 = '
      literal += s.charAt(i);
    } else {
      if (literal) { parts.push("'" + literal + "'"); literal = ''; }
      parts.push('#' + ch);
    }
  }
  if (literal) { parts.push("'" + literal + "'"); }
  return parts.join('') || "''";
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
  #tree-pane {
    flex: 0 0 220px;
    width: 220px;
    height: 100%;
    border-right: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: flex-basis 0.15s ease, width 0.15s ease;
  }
  #tree-pane.c4d-collapsed {
    flex: 0 0 auto;
    width: auto;
    min-width: 0;
  }
  #tree-header, #inspector-header {
    flex: 0 0 auto;
    padding: 8px 12px 4px;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground, #9d9d9d);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  #tree-body {
    flex: 1 1 auto;
    overflow: auto;
    padding: 0 0 8px;
  }
  #tree-filter {
    flex: 0 0 auto;
    margin: 4px 8px;
    padding: 3px 6px;
    font-size: 11px;
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    outline: none;
  }
  #tree-filter:focus {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  #tree-filter::placeholder {
    color: var(--vscode-input-placeholderForeground, #767676);
  }
  .c4d-tree-item-hidden {
    display: none;
  }
  .c4d-toggle {
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground, #9d9d9d);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    padding: 0 3px;
    margin: 0;
    flex-shrink: 0;
  }
  .c4d-toggle:hover {
    color: var(--vscode-editor-foreground, #cccccc);
  }
  .c4d-header-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c4d-tree-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .c4d-tree-list .c4d-tree-list {
    padding-left: 16px;
  }
  .c4d-tree-item {
    margin: 0;
    padding: 0;
  }
  .c4d-tree-row {
    display: flex;
    align-items: center;
    padding: 3px 12px 3px 8px;
    cursor: pointer;
    border-left: 3px solid transparent;
    user-select: none;
  }
  .c4d-tree-row:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
  }
  .c4d-tree-selected {
    background: var(--vscode-list-activeSelectionBackground, #094771) !important;
    border-left-color: var(--vscode-focusBorder, #007acc) !important;
  }
  .c4d-tree-highlighted {
    background: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,0.15));
  }
  .c4d-tree-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .c4d-tree-selected .c4d-tree-icon {
    background: var(--vscode-focusBorder, #007acc);
  }
  .c4d-tree-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    line-height: 20px;
  }
  #layout-pane {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  #form-title-bar {
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    background: var(--vscode-titleBar-activeBackground, #3c3c3c);
    color: var(--vscode-titleBar-activeForeground, #cccccc);
    user-select: none;
    box-sizing: border-box;
    margin-bottom: 4px;
    border-radius: 2px;
  }
  #form-title-bar:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.12));
  }
  #host {
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  #zoom-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
  }
  #zoom-bar button {
    background: transparent;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    color: var(--vscode-foreground, #cccccc);
    border-radius: 3px;
    width: 24px;
    height: 22px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  #zoom-bar button:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    border-color: var(--vscode-focusBorder, #007acc);
  }
  #zoom-input {
    width: 40px;
    height: 20px;
    text-align: center;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-variant-numeric: tabular-nums;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    padding: 0 2px;
    outline: none;
  }
  #zoom-input:focus {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  .c4d-zoom-unit {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #9d9d9d);
  }
  .c4d-separator {
    width: 1px;
    height: 16px;
    background: var(--vscode-panel-border, #3c3c3c);
    margin: 0 6px;
  }
  .c4d-label-opt {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #9d9d9d);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .c4d-label-opt input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
    accent-color: var(--vscode-focusBorder, #007acc);
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
    transition: flex-basis 0.15s ease, width 0.15s ease;
  }
  #inspector-pane.c4d-collapsed {
    flex: 0 0 auto;
    width: auto;
    min-width: 0;
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
  #inspector-footer {
    flex: 0 0 auto;
    padding: 6px 12px;
    font-size: 10px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground, #9d9d9d);
    border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
    opacity: 0.7;
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
    padding: 2px 8px 2px 4px;
    vertical-align: top;
    color: var(--vscode-editor-foreground, #cccccc);
    word-break: break-word;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    cursor: pointer;
  }
  .c4d-prop-value:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
  }
  .c4d-prop-edit-wrap {
    display: flex;
    align-items: stretch;
  }
  .c4d-prop-edit {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-focusBorder, #007acc);
    border-right: none;
    border-radius: 3px 0 0 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    padding: 1px 4px;
    outline: none;
  }
  .c4d-prop-expand {
    flex: 0 0 auto;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-focusBorder, #007acc);
    border-left: none;
    border-radius: 0 3px 3px 0;
    color: var(--vscode-descriptionForeground, #9d9d9d);
    cursor: pointer;
    font-size: 14px;
    padding: 1px 6px;
    line-height: 1;
    white-space: nowrap;
  }
  .c4d-prop-expand:hover {
    color: var(--vscode-editor-foreground, #cccccc);
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.08));
  }
  .c4d-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .c4d-overlay-box {
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: 6px;
    padding: 16px;
    min-width: 400px;
    max-width: 80vw;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .c4d-overlay-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground, #cccccc);
  }
  .c4d-overlay-textarea {
    width: 100%;
    min-height: 120px;
    box-sizing: border-box;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    padding: 6px 8px;
    resize: vertical;
    outline: none;
  }
  .c4d-overlay-textarea:focus {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  .c4d-overlay-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .c4d-overlay-buttons button {
    padding: 4px 16px;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .c4d-overlay-buttons button:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
`;

module.exports = { FormLayoutView, encodeDfmString };
