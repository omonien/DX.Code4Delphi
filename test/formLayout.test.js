'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('node:module');

// Mock vscode (required transitively by FormLayoutView)
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return {
    window: {},
    workspace: { getConfiguration: () => ({ get: () => {} }), onDidChangeTextDocument: () => ({ dispose() {} }) },
    Uri: { parse: (s) => s, file: (s) => s },
    ViewColumn: { One: 1 },
    Position: class { constructor(l, c) { this.line = l; this.character = c; } },
    Range: class { constructor(s, e) { this.start = s; this.end = e; } },
    WorkspaceEdit: class { replace() {} },
  };
  return originalLoad.apply(this, arguments);
};

const {
  parseDfm,
  getTextProperties,
  isBinaryPropertyName,
  isTextPropertyValue,
  decodeDfmString,
} = require('../src/formLayout/parser.js');
const { FormNode } = require('../src/formLayout/model.js');
const {
  applyAlignLayout,
  detectFramework,
  ensureRootSize,
} = require('../src/formLayout/layoutEngine.js');
const { encodeDfmString } = require('../src/formLayout/FormLayoutView.js');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'forms', name), 'utf8');
}

function findChild(parent, name) {
  return parent.children.find((c) => c.name === name) || null;
}

describe('formLayout parser', () => {
  test('parses simple VCL form hierarchy and bounds', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    assert.ok(root);
    assert.equal(root.name, 'Form1');
    assert.equal(root.className, 'TForm1');
    assert.equal(root.bounds.width, 400);
    assert.equal(root.bounds.height, 300);
    assert.equal(root.children.length, 4);

    const top = findChild(root, 'PanelTop');
    assert.ok(top);
    assert.equal(top.className, 'TPanel');
    assert.equal(top.align, 'Top');
    assert.equal(top.bounds.height, 40);

    const client = findChild(root, 'PanelClient');
    assert.ok(client);
    assert.equal(client.align, 'Client');
    assert.equal(client.children.length, 1);
    assert.equal(client.children[0].name, 'Button1');
  });

  test('parses FMX Position/Size and Align values', () => {
    const root = parseDfm(fixture('SimpleFmx.fmx'));
    assert.ok(root);
    assert.equal(root.name, 'Form1');

    const tb = findChild(root, 'Toolbar1');
    assert.ok(tb);
    assert.equal(tb.align, 'Top');
    assert.equal(tb.bounds.height, 48);
    assert.equal(tb.bounds.width, 400);

    const side = findChild(root, 'LayoutSide');
    assert.ok(side);
    assert.equal(side.align, 'MostLeft');
    assert.equal(side.bounds.width, 120);

    const btn = findChild(findChild(root, 'LayoutClient'), 'Button1');
    assert.ok(btn);
    assert.equal(btn.bounds.left, 16);
    assert.equal(btn.bounds.top, 16);
    assert.equal(btn.bounds.width, 80);
  });

  test('normalizes VCL alXxx Align prefixes', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    assert.equal(findChild(root, 'PanelTop').align, 'Top');
    assert.equal(findChild(root, 'PanelBottom').align, 'Bottom');
    assert.equal(findChild(root, 'PanelLeft').align, 'Left');
    assert.equal(findChild(root, 'PanelClient').align, 'Client');
  });

  test('preserves storedBounds snapshot', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    const top = findChild(root, 'PanelTop');
    assert.deepEqual(top.storedBounds, top.bounds);
    top.bounds.height = 99;
    assert.equal(top.storedBounds.height, 40);
  });

  test('handles form without Align (explicit coordinates only)', () => {
    const root = parseDfm(fixture('NoAlign.dfm'));
    assert.ok(root);
    assert.equal(root.bounds.width, 250);
    assert.equal(root.children.length, 2);
    const edit = findChild(root, 'Edit1');
    assert.equal(edit.align, 'None');
    assert.equal(edit.bounds.left, 20);
    assert.equal(edit.bounds.top, 30);
  });

  test('returns null / throws gracefully on empty or garbage input', () => {
    assert.equal(parseDfm(''), null);
    assert.equal(parseDfm(null), null);
    assert.equal(parseDfm('just some text\nwithout objects'), null);
  });

  test('records source line numbers', () => {
    const root = parseDfm(fixture('NoAlign.dfm'));
    assert.equal(root.startLine, 0);
    const edit = findChild(root, 'Edit1');
    assert.ok(edit.startLine > 0);
    assert.ok(edit.endLine >= edit.startLine);
  });

  test('findById and walk work', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    const client = findChild(root, 'PanelClient');
    const btn = root.findById(client.children[0].id);
    assert.ok(btn);
    assert.equal(btn.className, 'TButton');

    const names = [];
    root.walk((n) => names.push(n.name));
    assert.ok(names.includes('Form1'));
    assert.ok(names.includes('PanelClient'));
    assert.ok(names.includes('Button1'));
  });
});

describe('Align normalization', () => {
  const cases = [
    ["Align = alTop", 'Top'],
    ["Align = alClient", 'Client'],
    ["Align = Top", 'Top'],
    ["Align = MostLeft", 'MostLeft'],
    ["Align = Contents", 'Contents'],
    ["Align = Center", 'Center'],
    ["Align = alNone", 'None'],
  ];

  for (const [line, expected] of cases) {
    test(`normalizes "${line}" → ${expected}`, () => {
      const text = `object X: TX\n  Width = 10\n  Height = 10\n  ${line}\nend\n`;
      const root = parseDfm(text);
      assert.equal(root.align, expected);
    });
  }
});

describe('layoutEngine VCL', () => {
  test('Top / Bottom / Left / Client produce expected stacking', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    applyAlignLayout(root, { framework: 'vcl' });

    const top = findChild(root, 'PanelTop');
    const bottom = findChild(root, 'PanelBottom');
    const left = findChild(root, 'PanelLeft');
    const client = findChild(root, 'PanelClient');

    assert.equal(top.bounds.top, 0);
    assert.equal(top.bounds.left, 0);
    assert.equal(top.bounds.width, 400);
    assert.equal(top.bounds.height, 40);

    assert.equal(bottom.bounds.height, 30);
    assert.equal(bottom.bounds.top, 300 - 30);
    assert.equal(bottom.bounds.width, 400);

    assert.equal(left.bounds.left, 0);
    assert.equal(left.bounds.top, 40);
    assert.equal(left.bounds.width, 80);
    assert.equal(left.bounds.height, 300 - 40 - 30);

    assert.equal(client.bounds.left, 80);
    assert.equal(client.bounds.top, 40);
    assert.equal(client.bounds.width, 400 - 80);
    assert.equal(client.bounds.height, 300 - 40 - 30);
  });

  test('nested Align is applied per parent', () => {
    const root = parseDfm(fixture('NestedAlign.dfm'));
    applyAlignLayout(root, { framework: 'vcl' });

    const outer = findChild(root, 'Outer');
    assert.equal(outer.align, 'Client');
    assert.equal(outer.bounds.left, 0);
    assert.equal(outer.bounds.top, 0);
    assert.equal(outer.bounds.width, 300);
    assert.equal(outer.bounds.height, 200);

    const header = findChild(outer, 'Header');
    assert.equal(header.bounds.top, 0);
    assert.equal(header.bounds.height, 25);
    assert.equal(header.bounds.width, 300);

    const body = findChild(outer, 'Body');
    assert.equal(body.bounds.top, 25);
    assert.equal(body.bounds.height, 175);
    assert.equal(body.bounds.width, 300);
  });

  test('None keeps stored coordinates', () => {
    const root = parseDfm(fixture('NoAlign.dfm'));
    applyAlignLayout(root, { framework: 'vcl' });
    const edit = findChild(root, 'Edit1');
    assert.equal(edit.bounds.left, 20);
    assert.equal(edit.bounds.top, 30);
    assert.equal(edit.bounds.width, 120);
  });
});

describe('layoutEngine FMX', () => {
  test('MostLeft takes precedence; Top/Bottom then use remaining width', () => {
    const root = parseDfm(fixture('SimpleFmx.fmx'));
    applyAlignLayout(root, { framework: 'fmx' });

    const tb = findChild(root, 'Toolbar1');
    const sb = findChild(root, 'StatusBar1');
    const side = findChild(root, 'LayoutSide');
    const client = findChild(root, 'LayoutClient');

    assert.equal(side.bounds.left, 0);
    assert.equal(side.bounds.top, 0);
    assert.equal(side.bounds.width, 120);
    assert.equal(side.bounds.height, 300);

    assert.equal(tb.bounds.top, 0);
    assert.equal(tb.bounds.left, 120);
    assert.equal(tb.bounds.height, 48);
    assert.equal(tb.bounds.width, 400 - 120);

    assert.equal(sb.bounds.height, 22);
    assert.equal(sb.bounds.left, 120);
    assert.equal(sb.bounds.top, 300 - 22);
    assert.equal(sb.bounds.width, 400 - 120);

    assert.equal(client.bounds.left, 120);
    assert.equal(client.bounds.top, 48);
    assert.equal(client.bounds.width, 400 - 120);
    assert.equal(client.bounds.height, 300 - 48 - 22);
  });

  test('detectFramework returns fmx when Most* present', () => {
    const root = parseDfm(fixture('SimpleFmx.fmx'));
    assert.equal(detectFramework(root), 'fmx');
  });

  test('detectFramework returns vcl for classic al* form', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    assert.equal(detectFramework(root), 'vcl');
  });
});

describe('layoutEngine edge cases', () => {
  test('Contents fills entire parent', () => {
    const text = `
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 100
  object Overlay: TPanel
    Align = Contents
    Width = 10
    Height = 10
  end
  object Edge: TPanel
    Align = alTop
    Height = 20
  end
end
`;
    const root = parseDfm(text);
    applyAlignLayout(root, { framework: 'fmx' });
    const overlay = findChild(root, 'Overlay');
    assert.equal(overlay.bounds.left, 0);
    assert.equal(overlay.bounds.top, 0);
    assert.equal(overlay.bounds.width, 200);
    assert.equal(overlay.bounds.height, 100);
  });

  test('Center keeps size and centers inside remaining client', () => {
    const text = `
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 100
  object Box: TPanel
    Align = Center
    Width = 40
    Height = 20
  end
end
`;
    const root = parseDfm(text);
    applyAlignLayout(root, { framework: 'fmx' });
    const box = findChild(root, 'Box');
    assert.equal(box.bounds.width, 40);
    assert.equal(box.bounds.height, 20);
    assert.equal(box.bounds.left, 80);
    assert.equal(box.bounds.top, 40);
  });

  test('multiple Top panels stack in declaration order', () => {
    const text = `
object Form1: TForm1
  ClientWidth = 100
  ClientHeight = 200
  object A: TPanel
    Align = alTop
    Height = 30
  end
  object B: TPanel
    Align = alTop
    Height = 20
  end
  object C: TPanel
    Align = alClient
  end
end
`;
    const root = parseDfm(text);
    applyAlignLayout(root, { framework: 'vcl' });
    const a = findChild(root, 'A');
    const b = findChild(root, 'B');
    const c = findChild(root, 'C');
    assert.equal(a.bounds.top, 0);
    assert.equal(a.bounds.height, 30);
    assert.equal(b.bounds.top, 30);
    assert.equal(b.bounds.height, 20);
    assert.equal(c.bounds.top, 50);
    assert.equal(c.bounds.height, 150);
  });

  test('applyAlignLayout is a no-op on null', () => {
    assert.doesNotThrow(() => applyAlignLayout(null));
  });

  test('root without Width/Height derives its size from children', () => {
    const text = `
object Frame1: TFrame1
  Left = 0
  Top = 0
  object Body: TPanel
    Left = 0
    Top = 0
    Width = 320
    Height = 180
  end
end
`;
    const root = parseDfm(text);
    applyAlignLayout(root, { framework: 'vcl' });
    assert.equal(root.bounds.width, 320);
    assert.equal(root.bounds.height, 180);
  });

  test('aligned child of a size-less root does not collapse to 1px', () => {
    const text = `
object Frame1: TFrame1
  Left = 0
  Top = 0
  object Bar: TPanel
    Align = alTop
    Height = 20
  end
end
`;
    const root = parseDfm(text);
    applyAlignLayout(root, { framework: 'vcl' });
    const bar = findChild(root, 'Bar');
    assert.equal(bar.bounds.height, 20);
    assert.equal(bar.bounds.width, 400); // default form width, not 1
  });

  test('ensureRootSize keeps an explicit root size untouched', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    ensureRootSize(root);
    assert.equal(root.bounds.width, 400);
    assert.equal(root.bounds.height, 300);
  });
});

describe('FormNode model', () => {
  test('id of a root node is its name', () => {
    const n = new FormNode({ name: 'Foo', className: 'TBar' });
    assert.equal(n.id, 'Foo');
  });

  test('id is path-based below a parent', () => {
    const parent = new FormNode({ name: 'P', className: 'TPanel' });
    const child = new FormNode({ name: 'B', className: 'TButton' });
    child.parent = parent;
    assert.equal(child.id, 'P::B');
  });

  test('id falls back to the class name for anonymous nodes', () => {
    const parent = new FormNode({ name: 'P', className: 'TPanel' });
    const child = new FormNode({ name: '', className: 'TButton' });
    child.parent = parent;
    assert.equal(child.id, 'P::(TButton)');
  });

  test('same control name under different parents yields distinct ids', () => {
    const text = `
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 200
  object Panel1: TPanel
    Width = 100
    Height = 100
    object Button1: TButton
      Left = 5
      Width = 40
      Height = 20
    end
  end
  object Panel2: TPanel
    Left = 100
    Width = 100
    Height = 100
    object Button1: TButton
      Left = 9
      Width = 40
      Height = 20
    end
  end
end
`;
    const root = parseDfm(text);
    const first = findChild(findChild(root, 'Panel1'), 'Button1');
    const second = findChild(findChild(root, 'Panel2'), 'Button1');

    assert.notEqual(first.id, second.id);
    assert.equal(first.id, 'Form1::Panel1::Button1');
    assert.equal(second.id, 'Form1::Panel2::Button1');

    // Each id must resolve back to its own node, not to the first match.
    assert.equal(root.findById(first.id).storedBounds.left, 5);
    assert.equal(root.findById(second.id).storedBounds.left, 9);

    // And all ids in the tree stay unique.
    const ids = [];
    root.walk((n) => ids.push(n.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  test('descendants lists all nested nodes', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    const names = root.descendants.map((n) => n.name);
    assert.ok(names.includes('PanelTop'));
    assert.ok(names.includes('Button1'));
    assert.ok(!names.includes('Form1'));
  });
});

describe('text property inspector', () => {
  test('isBinaryPropertyName detects Picture, Glyph, Data paths', () => {
    assert.equal(isBinaryPropertyName('Picture'), true);
    assert.equal(isBinaryPropertyName('Glyph'), true);
    assert.equal(isBinaryPropertyName('Picture.Data'), true);
    assert.equal(isBinaryPropertyName('Caption'), false);
    assert.equal(isBinaryPropertyName('Align'), false);
    assert.equal(isBinaryPropertyName('Font.Name'), false);
  });

  test('isTextPropertyValue rejects braces and angle brackets', () => {
    assert.equal(isTextPropertyValue("'OK'"), true);
    assert.equal(isTextPropertyValue('alClient'), true);
    assert.equal(isTextPropertyValue('True'), true);
    assert.equal(isTextPropertyValue('{'), false);
    assert.equal(isTextPropertyValue('<'), false);
    assert.equal(isTextPropertyValue(''), false);
  });

  test('parser stores Caption and skips binary Picture block', () => {
    const text = `
object Form1: TForm1
  ClientWidth = 100
  ClientHeight = 80
  object Image1: TImage
    Left = 0
    Top = 0
    Width = 50
    Height = 50
    Caption = 'Hello'
    Picture.Data = {
      07544269746D6170}
    Align = alClient
  end
end
`;
    const root = parseDfm(text);
    const img = findChild(root, 'Image1');
    assert.ok(img);
    assert.equal(img.properties.Caption, 'Hello');
    assert.equal(img.properties.Align, 'alClient');
    assert.equal(img.properties['Picture.Data'], undefined);
    assert.equal(img.align, 'Client');

    const props = getTextProperties(img);
    const names = props.map((p) => p.name);
    assert.ok(names.includes('Caption'));
    assert.ok(names.includes('Align'));
    assert.ok(!names.includes('Picture.Data'));
  });

  test('getTextProperties returns sorted name/value pairs from SimpleVcl', () => {
    const root = parseDfm(fixture('SimpleVcl.dfm'));
    const top = findChild(root, 'PanelTop');
    const props = getTextProperties(top);
    assert.ok(props.length > 0);
    assert.ok(props.every((p) => typeof p.name === 'string' && typeof p.value === 'string'));
    for (let i = 1; i < props.length; i++) {
      assert.ok(props[i - 1].name.localeCompare(props[i].name, undefined, { sensitivity: 'base' }) <= 0);
    }
    const caption = props.find((p) => p.name === 'Caption');
    assert.ok(caption);
    assert.equal(caption.value, 'Top');
  });
});

describe('DFM #xyz character encoding', () => {
  test('parser decodes #xyz values into readable text', () => {
    const root = parseDfm(fixture('DfmEncoding.dfm'));
    assert.ok(root);
    assert.equal(root.properties.Caption, 'ELKE - \u00dcbersicht');
    const l1 = findChild(root, 'Label1');
    assert.ok(l1);
    assert.equal(l1.properties.Caption, 'J\u00e4nner');
    const l3 = findChild(root, 'Label3');
    assert.ok(l3);
    assert.equal(l3.properties.Caption, 'au\u00dferhalb');
  });

  test('encodeDfmString – plain ASCII stays in quotes', () => {
    assert.equal(encodeDfmString('Hello'), "'Hello'");
    assert.equal(encodeDfmString(''), "''");
    assert.equal(encodeDfmString('Line 1'), "'Line 1'");
  });

  test('encodeDfmString – non-ASCII chars become #xyz', () => {
    assert.equal(encodeDfmString('J\u00e4nner'), "'J'#228'nner'");
  });

  test('encodeDfmString – mixed ASCII and non-ASCII', () => {
    assert.equal(encodeDfmString('au\u00dferhalb'), "'au'#223'erhalb'");
  });

  test('encodeDfmString – newlines become #13#10 (DFM convention)', () => {
    // Lone LF (as from a textarea) → CRLF codes
    assert.equal(encodeDfmString('Line1\nLine2'), "'Line1'#13#10'Line2'");
    // Already CRLF → same
    assert.equal(encodeDfmString('Line1\r\nLine2'), "'Line1'#13#10'Line2'");
    // Lone CR → #13 only (no trailing LF invented mid-stream beyond normalize)
    assert.equal(encodeDfmString('a\rb'), "'a'#13#10'b'");
  });

  test('encodeDfmString round-trip via decodeDfmString', () => {
    const roundtrip = (s) => decodeDfmString(encodeDfmString(s));
    assert.equal(roundtrip('J\u00e4nner'), 'J\u00e4nner');
    assert.equal(roundtrip('Hello'), 'Hello');
    assert.equal(roundtrip('l\u00f6schen'), 'l\u00f6schen');
    // LF input round-trips as CRLF (DFM Windows convention)
    assert.equal(roundtrip('Line1\nLine2'), 'Line1\r\nLine2');
    assert.equal(roundtrip('Line1\r\nLine2'), 'Line1\r\nLine2');
  });

  test('isDfmStringValue detects quoted, #n, and concatenated forms', () => {
    const { isDfmStringValue, looksLikeStringProp } = require('../src/formLayout/FormLayoutView.js');
    assert.equal(isDfmStringValue("'Hello'"), true);
    assert.equal(isDfmStringValue("'Hi'#13#10"), true);
    assert.equal(isDfmStringValue('#228'), true);
    assert.equal(isDfmStringValue('120'), false);
    assert.equal(isDfmStringValue('alTop'), false);
    assert.equal(looksLikeStringProp('Caption'), true);
    assert.equal(looksLikeStringProp('Width'), false);
  });
});
