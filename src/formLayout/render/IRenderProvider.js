'use strict';

/**
 * Abstract render provider.
 *
 * A provider is responsible for turning a FormModel + selection state into
 * the HTML/JS that lives inside the webview, and for handling messages that
 * come back from the webview (clicks, etc.).
 *
 * Concrete implementations: DomRenderProvider, later Canvas / SVG.
 */
class IRenderProvider {
  /**
   * Unique short name used for diagnostics / settings.
   * @returns {string}
   */
  get name() {
    throw new Error('not implemented');
  }

  /**
   * Build the full HTML document that will be set as webview.html.
   *
   * @param {import('../model').FormModel} model
   * @param {Object} options
   * @param {number|null} options.selectedId
   * @param {string} options.cspSource   // webview.cspSource
   * @param {string} options.nonce
   * @returns {string} complete HTML
   */
  buildHtml(model, options) {
    throw new Error('not implemented');
  }

  /**
   * Optional: return extra script that the host can inject.
   * Most providers put everything inside buildHtml.
   */
  getClientScript() {
    return '';
  }
}

module.exports = { IRenderProvider };
