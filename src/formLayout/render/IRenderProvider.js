'use strict';

/**
 * Contract for a form-layout renderer.
 *
 * Implementations receive a FormNode tree and a host element (or canvas context)
 * and are responsible for drawing the boxes and wiring selection events.
 *
 * The FormLayoutView owns selection state and calls into the provider.
 */
class IRenderProvider {
  /**
   * @param {HTMLElement} hostElement  - container inside the webview
   * @param {object} options
   * @param {(nodeId: string) => void} options.onSelect
   * @param {(nodeId: string) => void} [options.onDoubleClick]
   */
  constructor(hostElement, options = {}) {
    if (new.target === IRenderProvider) {
      throw new Error('IRenderProvider is abstract');
    }
    this.host = hostElement;
    this.onSelect = options.onSelect || (() => {});
    this.onDoubleClick = options.onDoubleClick || (() => {});
  }

  /**
   * Full (re)render of the tree.
   * @param {import('../model').FormNode} root
   * @param {object} state
   * @param {string|null} state.selectedId
   * @param {Set<string>} state.highlightedIds  // selected + descendants
   */
  render(root, state) {
    throw new Error('render() must be implemented');
  }

  /**
   * Optional: only update selection styling without full rebuild.
   * Default falls back to full render.
   */
  updateSelection(root, state) {
    this.render(root, state);
  }

  /**
   * Clean up event listeners / DOM.
   */
  dispose() {
    if (this.host) {
      this.host.innerHTML = '';
    }
  }

  /** Human-readable name for settings / debugging */
  static get id() {
    return 'base';
  }
}

module.exports = { IRenderProvider };
