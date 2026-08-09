'use strict';

/**
 * Abstract render provider.
 *
 * A provider contributes the two parts of the webview that actually differ
 * between rendering strategies: the CSS for the drawing surface and the
 * client-side script that turns the serialized node tree into visuals.
 *
 * The provider does NOT run in the extension host — its `buildCss()` and
 * `buildClientScript()` return source text that is embedded into the webview
 * document, where it executes with access to `document` and `acquireVsCodeApi`.
 * That is why these are string builders rather than DOM-manipulating methods.
 *
 * The surrounding chrome (inspector pane, CSP, message plumbing) belongs to
 * FormLayoutView and is shared by every provider.
 *
 * Concrete implementations: DomRenderProvider, later Canvas / SVG.
 */
class IRenderProvider {
  /**
   * Unique short name used for diagnostics / settings.
   * @returns {string}
   */
  static get id() {
    throw new Error('not implemented');
  }

  /**
   * CSS for the drawing surface, embedded into the webview's <style> block.
   * @returns {string}
   */
  buildCss() {
    throw new Error('not implemented');
  }

  /**
   * Client-side script source, embedded into the webview's <script> block.
   *
   * The script may rely on these globals being defined before it runs:
   * `root` (rehydrated node tree), `host` (container element), `selectedId`,
   * `highlightedIds`, and `vscode` (the webview API). It must define
   * `renderLayout()` and `applySelection()`.
   *
   * @returns {string}
   */
  buildClientScript() {
    throw new Error('not implemented');
  }
}

module.exports = { IRenderProvider };
