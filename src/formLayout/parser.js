'use strict';

const { FormNode } = require('./model.js');

/**
 * Lightweight DFM / FMX text parser focused on layout visualization.
 * Extracts: object hierarchy, Name, Class, Left/Top/Width/Height (and FMX Position.X/Y).
 *
 * Does NOT attempt full fidelity (binary, complex nested properties, collections, etc.).
 * Good enough for the box-model visualizer.
 */

const OBJECT_RE = /^(object|inherited|inline)\s+(?:(\w+)\s*:\s*)?(\w+(?:\.\w+)*)(?:\s*\[(\d+)\])?/i;
const PROP_RE = /^([\w.]+)\s*=\s*(.*)$/;
const END_RE = /^end\b/i;

/**
 * @param {string} text
 * @returns {FormNode|null}
 */
function parseDfm(text) {
  if (!text || typeof text !== 'string') return null;

  // Normalize line endings and split
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  /** @type {FormNode[]} */
  const stack = [];
  /** @type {FormNode|null} */
  let root = null;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    const lineNo = i; // 0-based

    if (!line || line.startsWith('//') || line.startsWith('{')) {
      i++;
      continue;
    }

    // object / inherited / inline
    const objMatch = line.match(OBJECT_RE);
    if (objMatch) {
      const kind = objMatch[1].toLowerCase();
      const name = objMatch[2] || '';
      const className = objMatch[3] || '';

      const node = new FormNode({
        name,
        className,
        kind,
        startLine: lineNo,
        bounds: { left: 0, top: 0, width: 0, height: 0 },
      });

      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        node.parent = parent;
        parent.children.push(node);
      } else {
        root = node;
      }
      stack.push(node);
      i++;
      continue;
    }

    // end
    if (END_RE.test(line)) {
      if (stack.length > 0) {
        const node = stack.pop();
        node.endLine = lineNo;
      }
      i++;
      continue;
    }

    // property
    const propMatch = line.match(PROP_RE);
    if (propMatch && stack.length > 0) {
      const propName = propMatch[1];
      let valueStr = propMatch[2].trim();

      // Multi-line values (strings, binary, collections) – skip content until we can
      // reasonably continue. We only care about simple numeric layout props.
      if (valueStr === '' || valueStr.endsWith('{') || valueStr.startsWith('<') || valueStr.startsWith('(')) {
        // consume until matching end-ish; very simplified
        i = skipComplexValue(lines, i);
        continue;
      }

      // Strip trailing comments
      const commentIdx = valueStr.indexOf('//');
      if (commentIdx >= 0) valueStr = valueStr.slice(0, commentIdx).trim();

      const current = stack[stack.length - 1];
      applyLayoutProperty(current, propName, valueStr);
      // keep raw for future use
      current.properties[propName] = valueStr;
      i++;
      continue;
    }

    i++;
  }

  // If the file never closed the root, still return what we have
  return root;
}

/**
 * Apply known layout-related properties onto the node bounds.
 * Supports classic VCL (Left/Top/Width/Height) and common FMX (Position.X/Y, Size.Width/Height).
 */
function applyLayoutProperty(node, propName, valueStr) {
  const num = parseNumber(valueStr);
  if (num === null) return;

  const p = propName.toLowerCase();

  switch (p) {
    case 'left':
      node.bounds.left = num;
      break;
    case 'top':
      node.bounds.top = num;
      break;
    case 'width':
      node.bounds.width = num;
      break;
    case 'height':
      node.bounds.height = num;
      break;
    case 'position.x':
      node.bounds.left = num;
      break;
    case 'position.y':
      node.bounds.top = num;
      break;
    case 'size.width':
      node.bounds.width = num;
      break;
    case 'size.height':
      node.bounds.height = num;
      break;
    case 'clientwidth':
      // useful for forms when Width is absent
      if (!node.bounds.width) node.bounds.width = num;
      break;
    case 'clientheight':
      if (!node.bounds.height) node.bounds.height = num;
      break;
    default:
      break;
  }
}

function parseNumber(s) {
  if (s === undefined || s === null) return null;
  // Remove possible trailing type suffixes or quotes
  const cleaned = String(s).replace(/^['"]|['"]$/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Very simple skip for multi-line values. Not perfect, but prevents the parser
 * from treating content of strings/binary blocks as objects/properties.
 */
function skipComplexValue(lines, startIdx) {
  let i = startIdx + 1;
  let depth = 1;
  while (i < lines.length && depth > 0) {
    const t = lines[i].trim();
    if (t.includes('{')) depth++;
    if (t.includes('}')) depth--;
    if (t.startsWith('>') || t === 'end>' || t.startsWith(')')) depth = 0;
    // also stop at a clear property or object start on next lines
    if (OBJECT_RE.test(t) || END_RE.test(t) || PROP_RE.test(t)) {
      // do not consume that line
      return i;
    }
    i++;
  }
  return i;
}

module.exports = { parseDfm };
