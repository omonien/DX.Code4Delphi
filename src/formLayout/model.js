'use strict';

/**
 * @typedef {Object} Bounds
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 */

/**
 * A single component / object from a DFM/FMX file.
 * Positions are relative to the parent (as stored in the form file).
 */
class FormNode {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {string} opts.className
   * @param {string} [opts.kind='object']  // object | inherited | inline
   * @param {Bounds} [opts.bounds]
   * @param {number} [opts.startLine]      // 0-based line in source
   * @param {number} [opts.endLine]
   * @param {FormNode[]} [opts.children]
   * @param {Record<string, any>} [opts.properties]  // raw leftover props if needed
   */
  constructor({
    name = '',
    className = '',
    kind = 'object',
    bounds = { left: 0, top: 0, width: 0, height: 0 },
    startLine = 0,
    endLine = 0,
    children = [],
    properties = {},
    align = 'None',
  } = {}) {
    this.name = name;
    this.className = className;
    this.kind = kind;
    this.bounds = { ...bounds };
    /** Original bounds as stored in the DFM/FMX (before Align simulation) */
    this.storedBounds = { ...bounds };
    this.startLine = startLine;
    this.endLine = endLine;
    this.children = children;
    this.properties = properties;
    /**
     * Normalized Align value.
     * VCL alTop → 'Top', FMX MostTop → 'MostTop', etc.
     * Default 'None'.
     */
    this.align = align || 'None';
    /** Design-time PixelsPerInch for DPI-aware scaling (default 96). */
    this.ppi = 96;
    /** @type {FormNode|null} */
    this.parent = null;
  }

  /**
   * Unique id for selection / DOM mapping.
   *
   * Always path-based: a bare Name is not unique, because frames and inherited
   * forms routinely repeat the same control name under different parents
   * (two `Button1` below two panels). A name-only id would make selection,
   * highlighting and "go to source" resolve to the first match instead of the
   * control the user clicked.
   */
  get id() {
    const own = this.name || `(${this.className})`;
    return this.parent ? `${this.parent.id}::${own}` : own;
  }

  get hasExplicitBounds() {
    const b = this.bounds;
    return b.width > 0 || b.height > 0 || b.left !== 0 || b.top !== 0;
  }

  /** Flatten tree depth-first */
  walk(callback) {
    callback(this);
    for (const child of this.children) {
      child.walk(callback);
    }
  }

  /** All descendant nodes (not including self) */
  get descendants() {
    const list = [];
    for (const child of this.children) {
      child.walk((n) => list.push(n));
    }
    return list;
  }

  findById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }
}

module.exports = { FormNode };
