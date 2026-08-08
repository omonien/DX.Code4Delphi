'use strict';

const { IRenderProvider } = require('./IRenderProvider.js');

/**
 * DOM-based renderer: nested absolutely positioned divs.
 * Selection and child highlighting are done via CSS classes.
 */
class DomRenderProvider extends IRenderProvider {
  static get id() {
    return 'dom';
  }

  constructor(hostElement, options = {}) {
    super(hostElement, options);
    this._scale = options.scale || 1;
    this._rootEl = null;

    // Inject base styles once
    if (!hostElement.ownerDocument.getElementById('c4d-formlayout-styles')) {
      const style = hostElement.ownerDocument.createElement('style');
      style.id = 'c4d-formlayout-styles';
      style.textContent = BASE_CSS;
      hostElement.ownerDocument.head.appendChild(style);
    }
  }

  render(root, state = {}) {
    const { selectedId = null, highlightedIds = new Set() } = state;

    this.host.innerHTML = '';
    this.host.classList.add('c4d-formlayout-host');

    if (!root) {
      this.host.innerHTML = '<div class="c4d-empty">No form structure found.</div>';
      return;
    }

    // Viewport that can be scrolled / transformed later
    const viewport = this.host.ownerDocument.createElement('div');
    viewport.className = 'c4d-viewport';
    this.host.appendChild(viewport);

    const stage = this.host.ownerDocument.createElement('div');
    stage.className = 'c4d-stage';
    // Give the stage a reasonable size based on root bounds
    const rw = Math.max(root.bounds.width || 400, 200);
    const rh = Math.max(root.bounds.height || 300, 150);
    stage.style.width = `${rw * this._scale}px`;
    stage.style.height = `${rh * this._scale}px`;
    viewport.appendChild(stage);

    this._rootEl = this._buildNode(root, stage, selectedId, highlightedIds, true);
  }

  /**
   * @param {import('../model').FormNode} node
   * @param {HTMLElement} parentEl
   * @param {string|null} selectedId
   * @param {Set<string>} highlightedIds
   * @param {boolean} isRoot
   */
  _buildNode(node, parentEl, selectedId, highlightedIds, isRoot = false) {
    const doc = parentEl.ownerDocument;
    const el = doc.createElement('div');
    el.className = 'c4d-box';
    el.dataset.nodeId = node.id;

    if (node.id === selectedId) {
      el.classList.add('c4d-selected');
    } else if (highlightedIds.has(node.id)) {
      el.classList.add('c4d-highlight-child');
    }

    const b = node.bounds;
    const scale = this._scale;

    if (isRoot) {
      // Root fills the stage; we still draw a border
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.classList.add('c4d-root');
    } else {
      el.style.left = `${(b.left || 0) * scale}px`;
      el.style.top = `${(b.top || 0) * scale}px`;
      el.style.width = `${Math.max((b.width || 20) * scale, 8)}px`;
      el.style.height = `${Math.max((b.height || 16) * scale, 8)}px`;
    }

    // Label – show Align when not None
    const label = doc.createElement('div');
    label.className = 'c4d-label';
    const displayName = node.name || `(${node.className})`;
    const alignSuffix = node.align && node.align !== 'None' ? ` [${node.align}]` : '';
    label.textContent = displayName + alignSuffix;
    label.title = `${node.name || ''} : ${node.className}${alignSuffix}`.trim();
    el.appendChild(label);

    // Click handling
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onSelect(node.id);
    });
    el.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      this.onDoubleClick(node.id);
    });

    parentEl.appendChild(el);

    // Children are positioned relative to this box
    for (const child of node.children) {
      // Only render children that look visual (have some size or explicit coords)
      // Non-visual components usually have Left/Top only as designer placeholders.
      this._buildNode(child, el, selectedId, highlightedIds, false);
    }

    return el;
  }

  updateSelection(root, state) {
    // Lightweight: just toggle classes instead of full rebuild
    if (!this.host) return;
    const selectedId = state.selectedId || null;
    const highlightedIds = state.highlightedIds || new Set();

    const boxes = this.host.querySelectorAll('.c4d-box');
    boxes.forEach((el) => {
      const id = el.dataset.nodeId;
      el.classList.toggle('c4d-selected', id === selectedId);
      el.classList.toggle('c4d-highlight-child', id !== selectedId && highlightedIds.has(id));
    });
  }
}

const BASE_CSS = `
  .c4d-formlayout-host {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: auto;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #cccccc);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: 12px;
  }
  .c4d-empty {
    padding: 24px;
    opacity: 0.7;
  }
  .c4d-viewport {
    padding: 16px;
    min-width: 100%;
    min-height: 100%;
    box-sizing: border-box;
  }
  .c4d-stage {
    position: relative;
    background: var(--vscode-sideBar-background, #252526);
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .c4d-box {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    background: rgba(128, 128, 128, 0.08);
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.1s, background 0.1s, box-shadow 0.1s;
  }
  .c4d-box:hover {
    border-color: var(--vscode-focusBorder, #007acc);
    background: rgba(0, 122, 204, 0.12);
  }
  .c4d-root {
    background: transparent;
    border-style: dashed;
  }
  .c4d-selected {
    border: 2px solid var(--vscode-focusBorder, #007acc) !important;
    background: rgba(0, 122, 204, 0.18) !important;
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc);
    z-index: 10;
  }
  .c4d-highlight-child {
    border: 1px dashed var(--vscode-charts-orange, #ce9178) !important;
    background: rgba(206, 145, 120, 0.15) !important;
  }
  .c4d-label {
    position: absolute;
    top: 1px;
    left: 3px;
    right: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 10px;
    line-height: 1.2;
    pointer-events: none;
    color: var(--vscode-descriptionForeground, #9d9d9d);
  }
  .c4d-selected > .c4d-label,
  .c4d-highlight-child > .c4d-label {
    color: var(--vscode-editor-foreground, #cccccc);
    font-weight: 600;
  }
`;

module.exports = { DomRenderProvider };
