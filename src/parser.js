'use strict';

/**
 * Lightweight, dependency-free Delphi source analyser used for code
 * navigation (interface <-> implementation, next/previous method) and
 * folding. It deliberately works on *lines* with a masked copy of the
 * source (comments/strings blanked out) so keyword detection is safe.
 *
 * This module never imports `vscode` and is fully unit-testable in Node.
 */

const METHOD_KW = '(?:class\\s+|sealed\\s+|static\\s+)?(procedure|function|constructor|destructor|operator)';
const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
/**
 * Type header: optional `type` prefix, name, `= [packed] class|interface|…`, rest of line.
 * No trailing `$` — sources may be CRLF and `.` does not consume `\r`, which would
 * make an end-anchored pattern fail on Windows line endings.
 */
const TYPE_DECL_RE = new RegExp(
  `^\\s*(?:type\\s+)?(${IDENT})(?:<[^>]+>)?\\s*=\\s*(?:packed\\s+)?(class|interface|dispinterface|record|object)\\b(.*)`,
  'i'
);
const END_RE = /^\s*end\b[;.]?/;
const IFACE_METHOD_RE = new RegExp(`^\\s*${METHOD_KW}\\s+(${IDENT})`);
/** Matches the method keyword at the start of an implementation header line. */
const IMPL_METHOD_START_RE = new RegExp(`^\\s*${METHOD_KW}\\s+`, 'i');
const IDENT_RE = new RegExp(`^${IDENT}`);

/**
 * True when this type header opens a body that will be closed by `end`
 * (not a forward `class;` / `interface;` and not `class of …`).
 */
function typeDeclOpensBody(restAfterKeyword) {
  const rest = (restAfterKeyword || '').trimStart();
  if (rest.startsWith(';')) return false; // forward: TFoo = class;
  if (/^of\b/i.test(rest)) return false; // metaclass: TMeta = class of TObject
  return true;
}

/**
 * Skip a balanced `<...>` generic argument list starting at `text[i]` (`<`).
 * Returns the index just past the matching `>`, or `i` if not a generic list.
 */
function skipGenericArgs(text, i) {
  if (text[i] !== '<') return i;
  let depth = 1;
  let j = i + 1;
  while (j < text.length && depth > 0) {
    const ch = text[j];
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    j++;
  }
  return depth === 0 ? j : i;
}

/**
 * Fully qualified owner for a method declared inside nested types
 * (`TOuter.TInner`), or null at unit scope.
 */
function qualifiedOwner(stack) {
  if (!stack || stack.length === 0) return null;
  return stack.map((s) => s.name).join('.');
}

/**
 * Parse an implementation method's qualified name after the keyword match.
 * Supports multi-level nested types and optional generic args on each segment:
 *   Foo
 *   TFoo.Bar
 *   TOuter.TInner.Bar
 *   TOuter<T>.TInner.Ping
 *   TOuter.TInner.Prop<E>
 *
 * Returns { name, className, nameColInTrimmed, endInTrimmed } or null.
 * `className` strips generic args (matches interface scanning). `endInTrimmed`
 * is past any method-level `<...>` so `readSignature` sees the `(` next.
 */
function parseImplQualifiedName(trimmed, afterKeywordIndex) {
  let i = afterKeywordIndex;
  const segments = []; // { name, nameStart, end }
  while (i < trimmed.length) {
    const m = trimmed.slice(i).match(IDENT_RE);
    if (!m) break;
    const name = m[0];
    const nameStart = i;
    i += name.length;
    i = skipGenericArgs(trimmed, i);
    segments.push({ name, nameStart, end: i });
    if (trimmed[i] === '.') {
      i++;
      continue;
    }
    break;
  }
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  const className =
    segments.length > 1
      ? segments
          .slice(0, -1)
          .map((s) => s.name)
          .join('.')
      : null;
  return {
    name: last.name,
    className,
    nameColInTrimmed: last.nameStart,
    endInTrimmed: last.end,
  };
}

class SectionIndex {
  constructor() {
    this.interface = -1;
    this.implementation = -1;
    this.initialization = -1;
    this.finalization = -1;
  }
}

class Decl {
  constructor(opts) {
    this.section = opts.section; // 'interface' | 'implementation'
    this.kind = opts.kind;       // procedure|function|constructor|destructor|operator
    this.name = opts.name;       // method name (unqualified)
    this.className = opts.className || null; // enclosing type path (e.g. TOuter.TInner) or qualified prefix
    this.line = opts.line;       // line of the declaration keyword
    this.col = opts.col;         // column of the method name
    this.nameLen = opts.nameLen;
    this.params = opts.params || [];       // normalized parameter type names
    this.paramsText = opts.paramsText || ''; // raw text between ( )
    this.returnType = opts.returnType || ''; // normalized return type
    this.signatureEndLine = opts.signatureEndLine || opts.line;
    this.signatureEndCol = opts.signatureEndCol || 0;
  }

  /**
   * True when (line, col) lies on this signature. The start column is not
   * enforced so a cursor on the class prefix (`TMyClass.Foo`) still hits;
   * past the terminating `;` does not.
   */
  contains(line, col) {
    if (line < this.line || line > this.signatureEndLine) return false;
    if (line === this.signatureEndLine && col > this.signatureEndCol) return false;
    return true;
  }
}

/**
 * Blank out comments and string literals, preserving newlines and columns.
 * With `opts.keepDirectives` the single-line `{$...}` compiler directives are
 * left untouched (only comments/strings are blanked) — used by the folding
 * scans so that markers inside comments or strings are never seen.
 */
function maskSource(text, opts) {
  const keepDirectives = !!(opts && opts.keepDirectives);
  const out = text.split('');
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out[i] = ' '; i++; }
    } else if (ch === '{') {
      if (text[i + 1] === '$') {
        // compiler directive: single line
        if (keepDirectives) {
          while (i < n && text[i] !== '\n' && text[i] !== '}') i++;
          if (i < n && text[i] === '}') i++;
        } else {
          while (i < n && text[i] !== '\n' && text[i] !== '}') { out[i] = ' '; i++; }
          if (i < n && text[i] === '}') { out[i] = ' '; i++; }
        }
      } else {
        while (i < n && text[i] !== '}') { if (text[i] !== '\n') out[i] = ' '; i++; }
        if (i < n && text[i] === '}') { out[i] = ' '; i++; }
      }
    } else if (ch === '(' && text[i + 1] === '*') {
      while (i < n && !(text[i] === '*' && text[i + 1] === ')')) {
        if (text[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) { out[i] = ' '; i++; }
      if (i < n) { out[i] = ' '; i++; }
    } else if (ch === "'") {
      if (text[i + 1] === "'" && text[i + 2] === "'") {
        // ''' multi-line string literal (Delphi 10.3+)
        i += 3;
        let k = i;
        while (k < n) {
          if (text[k] === "'" && text[k + 1] === "'" && text[k + 2] === "'") break;
          if (text[k] !== '\n') out[k] = ' ';
          k++;
        }
        if (k < n) { out[k] = ' '; out[k + 1] = ' '; out[k + 2] = ' '; i = k + 3; }
        else i = n;
      } else {
        i++;
        while (i < n) {
          if (text[i] === "'") {
            if (text[i + 1] === "'") { out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            out[i] = ' ';
            i++;
            break;
          }
          if (text[i] !== '\n') out[i] = ' ';
          i++;
        }
      }
    } else if (ch === '#') {
      if (text[i + 1] === '$') {
        let j = i + 2;
        while (j < n && /[0-9A-Fa-f]/.test(text[j])) { out[j] = ' '; j++; }
        out[i] = ' '; out[i + 1] = ' ';
        i = j;
      } else if (/[0-9]/.test(text[i + 1] || '')) {
        let j = i + 1;
        while (j < n && /[0-9]/.test(text[j])) { out[j] = ' '; j++; }
        out[i] = ' ';
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Find section header lines. Returns a SectionIndex. */
function findSections(maskedText) {
  const sections = new SectionIndex();
  const lines = maskedText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (/^interface\b/.test(trimmed)) sections.interface = i;
    else if (/^implementation\b/.test(trimmed)) sections.implementation = i;
    else if (/^initialization\b/.test(trimmed)) sections.initialization = i;
    else if (/^finalization\b/.test(trimmed)) sections.finalization = i;
  }
  return sections;
}

/** Split `s` on `sep` at parenthesis/bracket/generic depth 0. */
function splitTopLevel(s, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '>') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim().length > 0) parts.push(cur);
  return parts;
}

function lastTopLevelColon(s) {
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (ch === ')' || ch === ']' || ch === '>') depth++;
    else if (ch === '(' || ch === '[' || ch === '<') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

function normalizeType(t) {
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Sentinel type for untyped formals (`const Source; var Dest`). */
const UNTYPED_PARAM = '?';

/**
 * Count comma-separated formal names in a parameter group (left of `:` or whole
 * untyped group), stripping leading const/var/out/ref on each name.
 */
function countFormalNames(left) {
  const names = splitTopLevel(left, ',')
    .map((s) => s.trim().replace(/^(?:const|var|out|ref)\s+/i, '').trim())
    .filter(Boolean);
  return Math.max(1, names.length);
}

/** Extract normalized parameter type list from the text between ( ). */
function extractParamTypes(inner) {
  const types = [];
  for (let part of splitTopLevel(inner, ';')) {
    part = part.trim();
    if (!part) continue;
    part = part.replace(/^(?:const|var|out|ref)\s+/i, '');
    const colon = lastTopLevelColon(part);
    if (colon < 0) {
      // Untyped formals (e.g. Move's `const Source; var Dest`) — keep arity
      const count = countFormalNames(part);
      for (let n = 0; n < count; n++) types.push(UNTYPED_PARAM);
      continue;
    }
    const left = part.slice(0, colon).trim();
    const type = part.slice(colon + 1).trim();
    const norm = normalizeType(type);
    if (!norm) continue;
    // `A, B: Integer` is two formals — expand so overload matching stays accurate
    const count = countFormalNames(left);
    for (let n = 0; n < count; n++) types.push(norm);
  }
  return types;
}

/**
 * Read the parameter list and return type starting at `offset` (which
 * points just after the method name in `source`). Returns
 * { paramsText, params, returnType, endOffset }.
 */
function readSignature(source, masked, offset, lineStarts, declLine) {
  let i = offset;
  const n = source.length;
  // skip whitespace
  while (i < n && /\s/.test(source[i])) i++;
  let paramsText = '';
  let params = [];
  let endOffset = i;
  if (i < n && source[i] === '(') {
    const start = i + 1;
    let depth = 1;
    i++;
    while (i < n && depth > 0) {
      const ch = masked[i]; // strings/comments are blanked to spaces in `masked`
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }
    paramsText = source.slice(start, i - 1);
    params = extractParamTypes(paramsText);
  }
  const afterParams = i; // first char after optional parameter list
  // return type / directives: scan to ';' at depth 0 (masked text so strings/comments ignored)
  let returnType = '';
  let depth = 0;
  while (i < n) {
    const ch = masked[i];
    if (ch === ';' && depth === 0) { endOffset = i; break; }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    i++;
  }
  // normalized return type: everything between the parameter list and ';'
  if (i < n) {
    const ret = source.slice(afterParams, i);
    const colon = lastTopLevelColon(ret);
    if (colon >= 0) returnType = normalizeType(ret.slice(colon + 1));
  }
  let endLine = declLine;
  let endCol = endOffset - lineStarts[declLine];
  for (let l = declLine + 1; l < lineStarts.length; l++) {
    if (lineStarts[l] > endOffset) break;
    endLine = l;
    endCol = endOffset - lineStarts[l];
  }
  return { paramsText, params, returnType, endOffset, endLine, endCol };
}

/** Scan interface-section declarations (methods inside class/record bodies). */
function scanInterfaceDecls(source, masked, lineStarts, startLine, endLine) {
  const methods = [];
  const classes = [];
  const stack = []; // { name, indent }
  const maskLines = masked.split('\n');
  for (let i = startLine; i < endLine; i++) {
    const line = maskLines[i];
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    const typeMatch = trimmed.match(TYPE_DECL_RE);
    if (typeMatch) {
      const name = typeMatch[1];
      classes.push({ name, line: i });
      // Forward (`class;`) and metaclass (`class of`) open no body — do not push
      if (typeDeclOpensBody(typeMatch[3])) {
        // Drop siblings / stale types at the same-or-deeper indent so an
        // over-indented `end` (which did not pop) cannot poison the next type's
        // qualified path (TFoo stuck → TBar would become TFoo.TBar).
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        stack.push({ name, indent });
      }
      continue;
    }
    if (END_RE.test(trimmed) && stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
      continue;
    }
    const m = trimmed.match(IFACE_METHOD_RE);
    if (m && !/^(?:end|begin)\b/.test(trimmed)) {
      const name = m[2];
      const afterName = m.index + m[0].length;
      // Skip method-level generics (`Foo<T>(...)`) so params match the impl side
      const afterGenerics = skipGenericArgs(trimmed, afterName);
      const col = indent + afterName - name.length;
      const offset = lineStarts[i] + indent + afterGenerics;
      const sig = readSignature(source, masked, offset, lineStarts, i);
      methods.push(new Decl({
        section: 'interface',
        kind: m[1].toLowerCase(),
        name,
        className: qualifiedOwner(stack),
        line: i,
        col,
        nameLen: name.length,
        params: sig.params,
        paramsText: sig.paramsText,
        returnType: sig.returnType,
        signatureEndLine: sig.endLine,
        signatureEndCol: sig.endCol,
      }));
    }
  }
  return { methods, classes };
}

/**
 * Count the begin/end style block delta contributed by one (masked) line.
 * Positive = opens a block that closes with `end`.
 */
function countBlockDelta(maskedLine) {
  let delta = 0;
  let s = maskedLine;
  s = s.replace(/\bend\b/g, () => { delta--; return ' '; });
  s = s.replace(/\b(begin|case|try|record|object|asm)\b/g, () => { delta++; return ' '; });
  s = s.replace(/=\s*class\b/g, () => { delta++; return ' '; });
  s = s.replace(/=\s*interface\b/g, () => { delta++; return ' '; });
  s = s.replace(/=\s*record\s+helper\b/g, () => { delta++; return ' '; });
  return delta;
}

/** Scan implementation-section method declarations (depth 0 only). */
function scanImplDecls(source, masked, lineStarts, startLine, endLine) {
  const methods = [];
  const maskLines = masked.split('\n');
  let depth = 0;
  // After a top-level method header we await its body. Nested local routines
  // declared before that body must not be indexed and must not clear the wait.
  let awaitingBody = false;
  let nestedLocals = 0;
  for (let i = startLine; i < endLine; i++) {
    const line = maskLines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    if (depth === 0 && trimmed.length > 0) {
      const kw = trimmed.match(IMPL_METHOD_START_RE);
      if (kw) {
        if (!awaitingBody && nestedLocals === 0) {
          const parsed = parseImplQualifiedName(trimmed, kw[0].length);
          if (parsed) {
            const col = indent + parsed.nameColInTrimmed;
            const offset = lineStarts[i] + indent + parsed.endInTrimmed;
            const sig = readSignature(source, masked, offset, lineStarts, i);
            methods.push(new Decl({
              section: 'implementation',
              kind: kw[1].toLowerCase(),
              name: parsed.name,
              className: parsed.className,
              line: i,
              col,
              nameLen: parsed.name.length,
              params: sig.params,
              paramsText: sig.paramsText,
              returnType: sig.returnType,
              signatureEndLine: sig.endLine,
              signatureEndCol: sig.endCol,
            }));
            const after = trimmed.slice(parsed.endInTrimmed);
            if (!/\bbegin\b/.test(after) && !/\b(forward|external)\b/.test(after)) {
              awaitingBody = true;
            }
          }
        } else if (awaitingBody) {
          // Local routine declared before the outer begin
          nestedLocals++;
          const parsed = parseImplQualifiedName(trimmed, kw[0].length);
          const after = parsed ? trimmed.slice(parsed.endInTrimmed) : trimmed.slice(kw[0].length);
          // Same-line begin/end is handled purely by block depth below
          if (/\b(forward|external)\b/.test(after)) {
            nestedLocals = Math.max(0, nestedLocals - 1);
          }
        }
      }
    }
    const delta = countBlockDelta(line);
    const prevDepth = depth;
    // Outer body opens only when no nested local is still open
    if (delta > 0 && depth === 0 && awaitingBody && nestedLocals === 0) {
      awaitingBody = false;
    }
    depth = Math.max(0, depth + delta);
    // A nested local's body closed when depth returns to 0
    if (prevDepth > 0 && depth === 0 && nestedLocals > 0) {
      nestedLocals--;
    }
  }
  return methods;
}

/** Full source model. */
function analyze(text) {
  const masked = maskSource(text);
  const sections = findSections(masked);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  const totalLines = lineStarts.length;

  let interfaceMethods = [];
  let implementationMethods = [];
  let classes = [];

  if (sections.interface >= 0) {
    const end = sections.implementation >= 0 ? sections.implementation : totalLines;
    const r = scanInterfaceDecls(text, masked, lineStarts, sections.interface + 1, end);
    interfaceMethods = r.methods;
    classes = r.classes;
  }
  if (sections.implementation >= 0) {
    const end = sections.initialization >= 0 ? sections.initialization : totalLines;
    implementationMethods = scanImplDecls(text, masked, lineStarts, sections.implementation + 1, end);
  }

  const methods = [...interfaceMethods, ...implementationMethods]
    .sort((a, b) => a.line - b.line || a.col - b.col);

  return {
    sections,
    interfaceMethods,
    implementationMethods,
    methods,
    classes,
    lineCount: totalLines,
  };
}

function sameName(a, b) {
  return a.name.toLowerCase() === b.name.toLowerCase();
}

function sameClass(a, b) {
  return (a.className || '').toLowerCase() === (b.className || '').toLowerCase();
}

function paramsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function pickMatch(candidates, decl, matchOverloads) {
  if (candidates.length === 0) return null;
  if (matchOverloads) {
    return candidates.find((c) => paramsEqual(c.params, decl.params)) || null;
  }
  return candidates[0];
}

/** Find the implementation for an interface method declaration. */
function findImplementation(decl, implementationMethods, matchOverloads) {
  if (!decl || decl.section !== 'interface') return null;
  const candidates = implementationMethods.filter(
    (d) => sameName(d, decl) && sameClass(d, decl)
  );
  return pickMatch(candidates, decl, matchOverloads);
}

/** Find the interface declaration for an implementation method. */
function findDeclaration(decl, interfaceMethods, matchOverloads) {
  if (!decl || decl.section !== 'implementation') return null;
  const candidates = interfaceMethods.filter(
    (d) => sameName(d, decl) && sameClass(d, decl)
  );
  return pickMatch(candidates, decl, matchOverloads);
}

/** Find the method declaration (interface or implementation) under (line, col). */
function methodAtPosition(model, line, col) {
  for (const m of model.methods) {
    if (m.contains(line, col)) return m;
  }
  return null;
}

/** Section header under cursor, or null. */
function sectionAtPosition(model, line) {
  const s = model.sections;
  if (line === s.interface) return 'interface';
  if (line === s.implementation) return 'implementation';
  if (line === s.initialization) return 'initialization';
  if (line === s.finalization) return 'finalization';
  return null;
}

/** Region a cursor line belongs to. */
function regionForLine(model, line) {
  const s = model.sections;
  if (s.interface < 0) return 'header';
  if (line < s.interface) return 'header';
  if (s.implementation >= 0 && line < s.implementation) return 'interface';
  if (s.implementation < 0) return 'interface';
  if (s.initialization >= 0 && line < s.initialization) return 'implementation';
  if (s.initialization < 0) return 'implementation';
  if (s.finalization >= 0 && line < s.finalization) return 'initialization';
  if (s.finalization < 0) return 'initialization';
  return 'finalization';
}

function findNextMethod(model, line, col) {
  for (const m of model.methods) {
    if (m.line > line || (m.line === line && m.col > col)) return m;
  }
  return null;
}

function findPreviousMethod(model, line, col) {
  for (let i = model.methods.length - 1; i >= 0; i--) {
    const m = model.methods[i];
    if (m.line < line || (m.line === line && m.col < col)) return m;
  }
  return null;
}

/** Fold regions: [startLine, endLine] inclusive, from the block/end scan. */
function computeFoldRegions(text, opts) {
  const masked = maskSource(text);
  const maskLines = masked.split('\n');
  const regions = [];
  const sections = findSections(masked);

  if (opts.sections) {
    const last = maskLines.length - 1;
    const add = (start, end) => {
      if (start >= 0 && end > start) regions.push([start, end]);
    };
    if (sections.interface >= 0) {
      const end = sections.implementation >= 0 ? sections.implementation - 1 : sections.initialization >= 0 ? sections.initialization - 1 : last - 1;
      add(sections.interface, end);
    }
    if (sections.implementation >= 0) {
      const end = sections.initialization >= 0 ? sections.initialization - 1 : sections.finalization >= 0 ? sections.finalization - 1 : last - 1;
      add(sections.implementation, end);
    }
    if (sections.initialization >= 0) {
      const end = sections.finalization >= 0 ? sections.finalization - 1 : last - 1;
      add(sections.initialization, end);
    }
    if (sections.finalization >= 0) add(sections.finalization, last - 1);
  }

  if (opts.beginEnd) {
    const stack = []; // pending open-block start lines
    for (let i = 0; i < maskLines.length; i++) {
      const delta = countBlockDelta(maskLines[i]);
      if (delta > 0) {
        for (let k = 0; k < delta; k++) stack.push(i);
      } else if (delta < 0) {
        for (let k = 0; k < -delta; k++) {
          if (stack.length > 0) {
            const start = stack.pop();
            if (i > start) regions.push([start, i]);
          }
        }
      }
    }
  }

  if (opts.regions) {
    // Scan the masked source with directives kept: markers inside comments or
    // strings must not be seen (commented-out {$REGION} does not fold).
    const lines = maskSource(text, { keepDirectives: true }).split('\n');
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (/^\{\$region\b/i.test(trimmed)) {
        stack.push(i);
      } else if (/^\{\$endregion\b/i.test(trimmed)) {
        if (stack.length > 0) {
          const start = stack.pop();
          if (i > start) regions.push([start, i]);
        }
      }
    }
  }

  if (opts.conditionals) {
    const lines = maskSource(text, { keepDirectives: true }).split('\n');
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (/^\{\$(ifdef|ifndef|if\s)/i.test(trimmed)) {
        stack.push(i);
      } else if (/^\{\$(endif|ifend)\b/i.test(trimmed)) {
        if (stack.length > 0) {
          const start = stack.pop();
          if (i > start) regions.push([start, i]);
        }
      }
    }
  }

  regions.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return regions;
}

module.exports = {
  analyze,
  maskSource,
  findSections,
  findImplementation,
  findDeclaration,
  methodAtPosition,
  sectionAtPosition,
  regionForLine,
  findNextMethod,
  findPreviousMethod,
  computeFoldRegions,
  extractParamTypes,
  countBlockDelta,
  typeDeclOpensBody,
  Decl,
  SectionIndex,
};
