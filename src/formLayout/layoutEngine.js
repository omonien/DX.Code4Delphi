'use strict';

/**
 * Approximate Align layout simulation for DFM (VCL) and FMX forms.
 *
 * Goals:
 * - Make aligned controls appear in realistic positions instead of the
 *   last design-time coordinates stored in the file.
 * - Support the common cases that cover the majority of real forms:
 *   Top / Bottom / Left / Right / Client + FMX Most* and Contents.
 *
 * Limitations (accepted for a visualizer):
 * - Does not implement full FMX layout managers, Padding/Margins of every
 *   control, Scale, Fit aspect-ratio math, or CustomAlign callbacks.
 * - Order among same-Align siblings follows declaration order (good enough).
 * - Parent client area is taken from the node's Width/Height (or Client*).
 */

/**
 * Run layout simulation on the whole tree (depth-first, parent before children).
 * Mutates node.bounds in place. Original values stay in node.storedBounds.
 *
 * @param {import('./model').FormNode} root
 * @param {object} [options]
 * @param {'vcl'|'fmx'|'auto'} [options.framework='auto']
 */
function applyAlignLayout(root, options = {}) {
  if (!root) return;

  const framework = options.framework === 'auto'
    ? detectFramework(root)
    : (options.framework || 'vcl');

  layoutNode(root, framework);
}

/**
 * Heuristic: presence of FMX-only Align values or .fmx-typical properties.
 */
function detectFramework(root) {
  let isFmx = false;
  root.walk((n) => {
    const a = n.align;
    if (
      a === 'MostTop' || a === 'MostBottom' || a === 'MostLeft' || a === 'MostRight' ||
      a === 'Contents' || a === 'Center' || a === 'VertCenter' || a === 'HorzCenter' ||
      a === 'Horizontal' || a === 'Vertical' || a === 'Scale' || a === 'Fit' ||
      a === 'FitLeft' || a === 'FitRight'
    ) {
      isFmx = true;
    }
  });
  return isFmx ? 'fmx' : 'vcl';
}

/**
 * Layout one parent and then recurse into children.
 */
function layoutNode(parent, framework) {
  const children = parent.children;
  if (!children || children.length === 0) return;

  const pw = Math.max(parent.bounds.width || 0, 1);
  const ph = Math.max(parent.bounds.height || 0, 1);

  // Working client rectangle that shrinks as edge-aligned controls are placed
  let client = { left: 0, top: 0, right: pw, bottom: ph };

  // Partition children by Align priority
  const most = [];
  const edges = [];
  const clients = [];
  const contents = [];
  const centers = [];
  const none = [];

  for (const c of children) {
    switch (c.align) {
      case 'MostTop':
      case 'MostBottom':
      case 'MostLeft':
      case 'MostRight':
        most.push(c);
        break;
      case 'Top':
      case 'Bottom':
      case 'Left':
      case 'Right':
        edges.push(c);
        break;
      case 'Client':
        clients.push(c);
        break;
      case 'Contents':
        contents.push(c);
        break;
      case 'Center':
      case 'VertCenter':
      case 'HorzCenter':
      case 'Horizontal':
      case 'Vertical':
        centers.push(c);
        break;
      case 'Scale':
      case 'Fit':
      case 'FitLeft':
      case 'FitRight':
        // Approximate as Client for visualization
        clients.push(c);
        break;
      default:
        // None / Custom / unknown → keep stored position
        none.push(c);
        break;
    }
  }

  // 1) Most* (FMX) – highest priority, consume space first
  placeEdgeAligned(most, client, true);

  // 2) Normal edge aligns
  placeEdgeAligned(edges, client, false);

  // 3) Client – fill remaining
  for (const c of clients) {
    const w = Math.max(client.right - client.left, 0);
    const h = Math.max(client.bottom - client.top, 0);
    c.bounds = {
      left: client.left,
      top: client.top,
      width: w,
      height: h,
    };
  }

  // 4) Contents – fill entire parent (overlaps everything)
  for (const c of contents) {
    c.bounds = { left: 0, top: 0, width: pw, height: ph };
  }

  // 5) Center-like – keep stored size, center inside remaining client (or parent)
  for (const c of centers) {
    const sw = c.storedBounds.width || c.bounds.width || 50;
    const sh = c.storedBounds.height || c.bounds.height || 20;
    let left = c.bounds.left;
    let top = c.bounds.top;

    if (c.align === 'Center' || c.align === 'HorzCenter' || c.align === 'Horizontal') {
      left = client.left + Math.max(0, (client.right - client.left - sw) / 2);
    }
    if (c.align === 'Center' || c.align === 'VertCenter' || c.align === 'Vertical') {
      top = client.top + Math.max(0, (client.bottom - client.top - sh) / 2);
    }
    if (c.align === 'Horizontal') {
      // stretch horizontally, keep vertical centering / stored height
      left = client.left;
      c.bounds = { left, top, width: Math.max(client.right - client.left, 0), height: sh };
    } else if (c.align === 'Vertical') {
      top = client.top;
      c.bounds = { left, top, width: sw, height: Math.max(client.bottom - client.top, 0) };
    } else {
      c.bounds = { left, top, width: sw, height: sh };
    }
  }

  // 6) None / Custom – leave stored bounds (already in c.bounds)

  // Recurse so nested containers also layout their children
  for (const c of children) {
    layoutNode(c, framework);
  }
}

/**
 * Place Top/Bottom/Left/Right (and Most*) controls, shrinking the client rect.
 * @param {import('./model').FormNode[]} list
 * @param {{left:number,top:number,right:number,bottom:number}} client
 * @param {boolean} _isMost  currently unused, reserved for future spacing differences
 */
function placeEdgeAligned(list, client, _isMost) {
  for (const c of list) {
    const sw = c.storedBounds.width || c.bounds.width || 0;
    const sh = c.storedBounds.height || c.bounds.height || 0;

    switch (c.align) {
      case 'Top':
      case 'MostTop': {
        const h = sh > 0 ? sh : 30;
        c.bounds = {
          left: client.left,
          top: client.top,
          width: Math.max(client.right - client.left, 0),
          height: h,
        };
        client.top += h;
        break;
      }
      case 'Bottom':
      case 'MostBottom': {
        const h = sh > 0 ? sh : 30;
        c.bounds = {
          left: client.left,
          top: client.bottom - h,
          width: Math.max(client.right - client.left, 0),
          height: h,
        };
        client.bottom -= h;
        break;
      }
      case 'Left':
      case 'MostLeft': {
        const w = sw > 0 ? sw : 100;
        c.bounds = {
          left: client.left,
          top: client.top,
          width: w,
          height: Math.max(client.bottom - client.top, 0),
        };
        client.left += w;
        break;
      }
      case 'Right':
      case 'MostRight': {
        const w = sw > 0 ? sw : 100;
        c.bounds = {
          left: client.right - w,
          top: client.top,
          width: w,
          height: Math.max(client.bottom - client.top, 0),
        };
        client.right -= w;
        break;
      }
      default:
        break;
    }
  }
}

module.exports = { applyAlignLayout, detectFramework };
