'use strict';

const { IRenderProvider } = require('./IRenderProvider.js');

/**
 * DOM-based renderer: nested absolutely positioned divs.
 * Selection and child highlighting are done via CSS classes.
 *
 * Both methods return source text that runs inside the webview, not in the
 * extension host — see IRenderProvider for the contract.
 */
class DomRenderProvider extends IRenderProvider {
  static get id() {
    return 'dom';
  }

  buildCss() {
    return BOX_CSS;
  }

  buildClientScript() {
    return CLIENT_SCRIPT;
  }
}

/**
 * Draws the box model and toggles selection classes.
 * Relies on the globals documented in IRenderProvider#buildClientScript.
 */
const CLIENT_SCRIPT = `
    function renderLayout() {
      host.innerHTML = '';
      host.className = 'c4d-formlayout-host';
      if (!root) {
        host.textContent = '';
        var empty = document.createElement('div');
        empty.className = 'c4d-empty';
        empty.textContent = 'No form structure found in this file.';
        host.appendChild(empty);
        return;
      }
      var viewport = document.createElement('div');
      viewport.className = 'c4d-viewport';
      host.appendChild(viewport);

      var titleBar = document.createElement('div');
      titleBar.id = 'form-title-bar';
      titleBar.textContent = getLabelText(root, true);
      titleBar.addEventListener('click', function() {
        if (root) select(root.id);
      });
      viewport.appendChild(titleBar);

      var stage = document.createElement('div');
      stage.className = 'c4d-stage';
      var rw = Math.max((root.bounds && root.bounds.width) || 400, 200);
      var rh = Math.max((root.bounds && root.bounds.height) || 300, 150);
      titleBar.style.width = rw + 'px';
      stage.style.width = rw + 'px';
      stage.style.height = rh + 'px';
      viewport.appendChild(stage);
      buildNode(root, stage, true);
    }

    function buildNode(node, parentEl, isRoot) {
      var el = document.createElement('div');
      el.className = 'c4d-box';
      el.dataset.nodeId = node.id;
      if (node.id === selectedId) el.classList.add('c4d-selected');
      else if (highlightedIds.has(node.id)) el.classList.add('c4d-highlight-child');

      var b = node.bounds || { left: 0, top: 0, width: 0, height: 0 };
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

      // Only show labels on non-root nodes — the form title bar handles the root
      if (!isRoot) {
        var label = document.createElement('div');
        label.className = 'c4d-label';
        label.textContent = getLabelText(node, false);
        el.appendChild(label);
      }

      el.addEventListener('click', function(ev) {
        ev.stopPropagation();
        select(node.id);
      });
      el.addEventListener('dblclick', function(ev) {
        ev.stopPropagation();
        vscode.postMessage({ type: 'goto', nodeId: node.id });
      });

      parentEl.appendChild(el);
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) {
        buildNode(kids[i], el, false);
      }
    }

    function applySelection() {
      host.querySelectorAll('.c4d-box').forEach(function(el) {
        var nid = el.dataset.nodeId;
        el.classList.toggle('c4d-selected', nid === selectedId);
        el.classList.toggle('c4d-highlight-child', nid !== selectedId && highlightedIds.has(nid));
      });
    }
`;

const BOX_CSS = `
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

module.exports = { DomRenderProvider };
