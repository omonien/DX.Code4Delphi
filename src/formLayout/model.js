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
    /** @type {FormNode|null} */
    this.parent = null;
  }

  /** Unique id for selection / DOM mapping */
  get id() {
    // Prefer name; fall back to path-like id if anonymous
    if (this.name) return this.name;
    const parentId = this.parent ? this.parent.id : 'root';
    return `${parentId}::${this.className}`;
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
