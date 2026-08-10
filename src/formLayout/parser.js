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
// `end>` terminates FMX collections, not objects — must not pop the stack
const END_RE = /^end\b(?!>)/i;

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

      // TStrings parenthesized lists – extract strings and store
      if (valueStr.startsWith('(')) {
        const extracted = extractStringsList(lines, i);
        const current = stack[stack.length - 1];
        if (extracted.value && isTextPropertyValue(extracted.value)) {
          current.properties[propName] = extracted.value;
        }
        i = extracted.nextIndex;
        continue;
      }

      // Multi-line / binary / collection values – skip without storing
      if (
        isBinaryPropertyName(propName) ||
        valueStr === '' ||
        valueStr.endsWith('{') ||
        valueStr.startsWith('{') ||
        valueStr.startsWith('<')
      ) {
        i = skipComplexValue(lines, i);
        continue;
      }

      // Strip trailing comments (quote-aware: '//' inside strings is not a comment)
      valueStr = stripTrailingComment(valueStr);

      const current = stack[stack.length - 1];
      applyLayoutProperty(current, propName, valueStr);
      // Only single-line text properties (no binary) for the inspector
      if (isTextPropertyValue(valueStr)) {
        current.properties[propName] = decodeDfmString(valueStr);
      }
      i++;
      continue;
    }

    i++;
  }

  // Snapshot original bounds before any layout simulation
  if (root) {
    root.walk((n) => {
      n.storedBounds = { ...n.bounds };
    });
  }

  // If the file never closed the root, still return what we have
  return root;
}

/**
 * Extract string values from a TStrings-style parenthesized DFM list.
 *
 * Lines inside `(...)` are decoded with `decodeDfmString` and joined with
 * `\n`. The closing `)` may appear on its own line or at the end of the last
 * value line. Stops on the next structural element (object/end/property) if
 * the closing paren was never found.
 *
 * @param {string[]} lines
 * @param {number} startIdx  index of the `prop = (` line
 * @returns {{ value: string, nextIndex: number }}
 */
function extractStringsList(lines, startIdx) {
  const values = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) { i++; continue; }

    // Standalone closing paren
    if (line === ')') {
      i++;
      break;
    }

    // Hit the next structural element – stop
    if (END_RE.test(line) || OBJECT_RE.test(line) || PROP_RE.test(line)) {
      break;
    }

    let s = line;
    let closed = false;
    if (s.endsWith(')')) {
      s = s.slice(0, -1).trim();
      closed = true;
    }

    if (s) {
      values.push(decodeDfmString(s));
    }

    if (closed) {
      i++;
      break;
    }

    i++;
  }

  const value = values.join('\n');
  return { value, nextIndex: i };
}

/**
 * Apply known layout-related properties onto the node bounds.
 * Supports classic VCL (Left/Top/Width/Height) and common FMX (Position.X/Y, Size.Width/Height).
 */
function applyLayoutProperty(node, propName, valueStr) {
  const p = propName.toLowerCase();

  // Align (string enum) – handle before numeric parse
  if (p === 'align') {
    node.align = normalizeAlign(valueStr);
    return;
  }

  // PixelsPerInch / PixelPerInch – DPI scaling of design-time coordinates
  if (p === 'pixelsperinch' || p === 'pixelperinch') {
    const ppi = parseNumber(valueStr);
    if (ppi !== null && ppi > 0) node.ppi = ppi;
    return;
  }

  const num = parseNumber(valueStr);
  if (num === null) return;

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

/**
 * Normalize VCL (alTop) and FMX (Top / MostTop / …) Align values
 * into a common set of strings used by the layout engine.
 */
function normalizeAlign(raw) {
  if (!raw) return 'None';
  let s = String(raw).trim();
  // strip quotes if present
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  // VCL style prefix
  if (s.toLowerCase().startsWith('al')) {
    s = s.slice(2);
  }
  // Canonical casing
  const map = {
    none: 'None',
    top: 'Top',
    bottom: 'Bottom',
    left: 'Left',
    right: 'Right',
    client: 'Client',
    custom: 'Custom',
    mosttop: 'MostTop',
    mostbottom: 'MostBottom',
    mostleft: 'MostLeft',
    mostright: 'MostRight',
    contents: 'Contents',
    center: 'Center',
    vertcenter: 'VertCenter',
    horzcenter: 'HorzCenter',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    scale: 'Scale',
    fit: 'Fit',
    fitleft: 'FitLeft',
    fitright: 'FitRight',
  };
  const key = s.toLowerCase();
  return map[key] || s; // keep unknown values as-is
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
 *
 * FMX `< … end>` collections are consumed wholesale (their `item` blocks may
 * contain property-looking lines and nested `{ }` blobs that must not leak
 * into the enclosing object).
 */
function skipComplexValue(lines, startIdx) {
  const first = lines[startIdx].trim();
  const inCollection = first.includes('<');
  let i = startIdx + 1;
  let depth = 1;
  let braceDepth = 0;
  while (i < lines.length && depth > 0) {
    const t = lines[i].trim();
    if (inCollection) {
      if (t.includes('{')) braceDepth++;
      if (t.includes('}')) braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth === 0) {
        // collection terminator: `end>` (or a lone `>` on its own line)
        if (t === 'end>' || t === '>') return i + 1;
      }
      i++;
      continue;
    }
    if (t.includes('{')) depth++;
    if (t.includes('}')) depth--;
    if (t.startsWith(')')) depth = 0;
    // also stop at a clear property or object start on next lines
    if (depth > 0 && (OBJECT_RE.test(t) || END_RE.test(t) || PROP_RE.test(t))) {
      // do not consume that line
      return i;
    }
    i++;
  }
  return i;
}

/**
 * Remove a trailing `//` comment, but only when it occurs outside a quoted
 * string chunk (quote parity scan; `''` escaped quotes stay inside).
 *
 * @param {string} valueStr
 * @returns {string}
 */
function stripTrailingComment(valueStr) {
  if (typeof valueStr !== 'string') return valueStr;
  let inQuote = false;
  for (let i = 0; i < valueStr.length; i++) {
    const c = valueStr[i];
    if (c === "'") {
      if (inQuote && valueStr[i + 1] === "'") { i++; continue; } // '' escape
      inQuote = !inQuote;
    } else if (!inQuote && c === '/' && valueStr[i + 1] === '/') {
      return valueStr.slice(0, i).trim();
    }
  }
  return valueStr;
}

/**
 * Decode Delphi #xyz character encoding, segment-wise:
 *   'J'#228'nner' → 'Jänner',  #13#10 → '\r\n'
 * `#n` is only significant OUTSIDE quoted chunks; inside quotes it is literal
 * text ('Room #2' stays 'Room #2'). `''` inside a quoted chunk is an escaped
 * quote; a bare `''` value decodes to the empty string.
 *
 * @param {string} raw
 * @returns {string}
 */
function decodeDfmString(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      i++;
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { out += "'"; i += 2; continue; }
          i++;
          break;
        }
        out += s[i];
        i++;
      }
    } else if (ch === '#') {
      const m = /^#(\d{1,5})/.exec(s.slice(i));
      if (m) {
        const n = parseInt(m[1], 10);
        out += n <= 0x10FFFF ? String.fromCodePoint(n) : '';
        i += m[0].length;
      } else {
        out += ch;
        i++;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/**
 * Property names that typically hold binary or large streamed data in DFM/FMX.
 * Matched case-insensitively against the full property path (e.g. Picture.Data).
 */
const BINARY_PROP_NAMES = [
  'picture', 'glyph', 'bitmap', 'image', 'icon', 'blob',
  'pngimage', 'jpegimage', 'metafile', 'wmf', 'emf',
  'data', 'imagedata', 'picture.data', 'glyph.data',
  'bitmap.data', 'items.data', 'imagelist',
];

/**
 * Carriers of binary payloads anywhere in the property path, so that
 * `Some.Picture.Data` is rejected as well as a bare `Picture`.
 */
const BINARY_PROP_CARRIERS = [
  'picture', 'glyph', 'bitmap', 'image', 'icon',
  'pngimage', 'jpegimage', 'metafile',
];

function isBinaryPropertyName(propName) {
  if (!propName) return false;
  const p = String(propName).toLowerCase();
  if (BINARY_PROP_NAMES.includes(p)) return true;
  // path ends with a binary segment (e.g. Some.Picture.Data)
  const parts = p.split('.');
  const last = parts[parts.length - 1];
  if (BINARY_PROP_NAMES.includes(last)) return true;
  // a binary carrier anywhere in the path (e.g. Buttons.Glyph.Something)
  return parts.some((seg) => BINARY_PROP_CARRIERS.includes(seg));
}

/**
 * True if the value is safe to show as a single-line text property.
 */
function isTextPropertyValue(valueStr) {
  if (valueStr == null) return false;
  const s = String(valueStr).trim();
  if (!s) return false;
  if (s.startsWith('{') || s.endsWith('{') || s.startsWith('<') || s.startsWith('(')) return false;
  // reject long hex-looking blobs that slipped through as one line
  if (s.length > 200 && /^[0-9A-Fa-f\s]+$/.test(s)) return false;
  return true;
}

/**
 * Sorted list of { name, value } for the read-only property inspector.
 * @param {import('./model').FormNode} node
 * @returns {{ name: string, value: string }[]}
 */
function getTextProperties(node) {
  if (!node || !node.properties) return [];
  return Object.keys(node.properties)
    .filter((k) => !isBinaryPropertyName(k) && isTextPropertyValue(node.properties[k]))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, value: String(node.properties[name]) }));
}

module.exports = {
  parseDfm,
  getTextProperties,
  isBinaryPropertyName,
  isTextPropertyValue,
  decodeDfmString,
  stripTrailingComment,
};
