'use strict';

/**
 * Tests for the webview host: HTML generation, script-safe embedding of
 * arbitrary DFM text, and id-based selection / "go to source".
 *
 * `vscode` is mocked via the shared test/helpers/vscodeMock.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./helpers/vscodeMock.js');

mock.install();

const { FormLayoutView } = require('../src/formLayout/FormLayoutView.js');

const shownDocuments = mock.shownDocuments;

function openView(text, fileName) {
  const context = { subscriptions: [] };
  const view = new FormLayoutView(context, mock.makeDocument(text, fileName));
  return view;
}

function lastPosted(view) {
  const posted = view.panel.webview.posted;
  return posted.length ? posted[posted.length - 1] : null;
}

describe('FormLayoutView webview HTML', () => {
  test('renders a panel with the box host and inspector', () => {
    const view = openView(`
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 100
  object Panel1: TPanel
    Align = alTop
    Height = 20
  end
end
`);
    const html = view.panel.webview.html;
    assert.match(html, /<div id="host">/);
    assert.match(html, /id="inspector-body"/);
    // Provider CSS and client script are both embedded
    assert.match(html, /\.c4d-box\s*\{/);
    assert.match(html, /function renderLayout\(\)/);
    assert.match(html, /function applySelection\(\)/);
  });

  test('a Caption containing </script> cannot break out of the script block', () => {
    const hostile = "'</script><script>window.__pwned=1;</script>'";
    const view = openView(`
object Form1: TForm1
  ClientWidth = 100
  ClientHeight = 100
  Caption = ${hostile}
end
`);
    const html = view.panel.webview.html;

    // The raw closing tag must not survive anywhere in the embedded data.
    assert.ok(!html.includes('</script><script>'));

    // Exactly one script element opens and closes.
    const openTags = html.match(/<script\b/g) || [];
    const closeTags = html.match(/<\/script>/g) || [];
    assert.equal(openTags.length, 1);
    assert.equal(closeTags.length, 1);
  });

  test('embedded tree carries host-computed, unique ids', () => {
    const view = openView(`
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 200
  object Panel1: TPanel
    Width = 100
    Height = 100
    object Button1: TButton
      Width = 40
      Height = 20
    end
  end
  object Panel2: TPanel
    Left = 100
    Width = 100
    Height = 100
    object Button1: TButton
      Width = 40
      Height = 20
    end
  end
end
`);
    const html = view.panel.webview.html;
    assert.ok(html.includes('Form1::Panel1::Button1'));
    assert.ok(html.includes('Form1::Panel2::Button1'));
    // The webview must not recompute ids itself.
    assert.ok(!html.includes("node.id = node.name ||"));
  });

  test('goto resolves the clicked node, not the first name match', () => {
    const view = openView(`
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 200
  object Panel1: TPanel
    Width = 100
    Height = 100
    object Button1: TButton
      Width = 40
      Height = 20
    end
  end
  object Panel2: TPanel
    Left = 100
    Width = 100
    Height = 100
    object Button1: TButton
      Width = 40
      Height = 20
    end
  end
end
`);
    shownDocuments.length = 0;

    const second = view.root.findById('Form1::Panel2::Button1');
    assert.ok(second);
    view._onMessage({ type: 'goto', nodeId: second.id });

    assert.equal(shownDocuments.length, 1);
    assert.equal(shownDocuments[0].options.selection.start.line, second.startLine);
    // and that really is the second button, further down the file
    const first = view.root.findById('Form1::Panel1::Button1');
    assert.ok(second.startLine > first.startLine);
  });

  test('parse failure renders the empty state instead of throwing', () => {
    const view = openView('this is not a form file\n');
    assert.equal(view.root, null);
    assert.match(view.panel.webview.html, /No form structure found/);
  });

  test('properties with #xyz are decoded on the host side', () => {
    const view = openView(`
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 100
  object Label1: TLabel
    Left = 8
    Top = 8
    Caption = 'J'#228'nner'
  end
  object Label2: TLabel
    Left = 8
    Top = 24
    Caption = 'ELKE - '#220'bersicht'
  end
end
`);
    const html = view.panel.webview.html;

    var propsStart = html.indexOf('const bootProps = ') + 18;
    var propsEnd = html.indexOf(';\n', propsStart);
    if (propsEnd === -1) propsEnd = html.indexOf(';', propsStart);
    var propsJson = html.slice(propsStart, propsEnd);
    const propsMap = JSON.parse(propsJson);

    const ids = Object.keys(propsMap);
    const label1Id = ids.find((id) => id.includes('Label1'));
    const label2Id = ids.find((id) => id.includes('Label2'));
    assert.ok(label1Id);
    assert.ok(label2Id);

    const l1caption = propsMap[label1Id].find((p) => p.name === 'Caption');
    const l2caption = propsMap[label2Id].find((p) => p.name === 'Caption');
    assert.ok(l1caption);
    assert.ok(l2caption);

    // Values are pre-decoded on the host — no #xyz in the webview
    assert.equal(l1caption.value, 'J\u00e4nner');
    assert.equal(l2caption.value, 'ELKE - \u00dcbersicht');
  });

  test('tree data-search covers name and className for filtering', () => {
    const view = openView(`
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 200
  object Button1: TButton
    Width = 40
    Height = 20
  end
  object Label1: TLabel
    Left = 50
    Top = 30
    Width = 60
  end
  object Panel2: TPanel
    Align = alClient
  end
end
`);
    const html = view.panel.webview.html;

    var treeStart = html.indexOf('\n    const bootTree = ') + 22;
    assert.ok(treeStart > 21, 'tree variable found');
    var treeEnd = html.indexOf(';\n', treeStart);
    if (treeEnd === -1) treeEnd = html.indexOf(';', treeStart);
    var treeJson = html.slice(treeStart, treeEnd);
    const tree = JSON.parse(treeJson);

    function walk(node, list) {
      list.push(node);
      (node.children || []).forEach(function(c) { walk(c, list); });
    }
    var nodes = [];
    walk(tree, nodes);

    assert.ok(nodes.length >= 4);

    var searches = nodes.map(function(n) {
      return ((n.name || '') + ' ' + (n.className || '')).toLowerCase();
    });

    assert.ok(searches.some(function(s) { return s.indexOf('orm') !== -1; }));
    assert.ok(searches.some(function(s) { return s.indexOf('labe') !== -1; }));
    assert.ok(searches.some(function(s) { return s.indexOf('butt') !== -1; }));
    assert.ok(searches.some(function(s) { return s.indexOf('panel') !== -1; }));
    var ones = searches.filter(function(s) { return s.indexOf('1') !== -1; });
    assert.equal(ones.length, 3);
  });

  test('selection is preserved after setProp refresh', async () => {
    const dfm = `
object Form1: TForm1
  ClientWidth = 200
  ClientHeight = 100
  object Label1: TLabel
    Left = 8
    Top = 8
    Caption = 'Hello'
  end
end
`;
    const view = openView(dfm);
    const label = view.root.findById('Form1::Label1');
    assert.ok(label);

    // Simulate user selection in the webview
    view.panel.webview._handler({ type: 'select', nodeId: label.id });
    assert.equal(view.selectedId, 'Form1::Label1');

    // Simulate property edit
    await new Promise((resolve) => {
      const orig = view._refreshFromDocument.bind(view);
      view._refreshFromDocument = function () {
        orig();
        resolve();
      };
      view.panel.webview._handler({
        type: 'setProp',
        nodeId: label.id,
        propName: 'Caption',
        value: 'World',
      });
    });

    assert.equal(view.selectedId, 'Form1::Label1', 'host keeps selectedId after edit');
    const update = lastPosted(view);
    assert.ok(update && update.type === 'update', 'refresh went through postMessage update');
    assert.equal(update.state.selectedId, 'Form1::Label1', 'update state carries selectedId');
    assert.ok(
      view.document.getText().includes("'World'") || view.document.getText().includes('World'),
      'document was updated'
    );
  });

  test('labelOpts round-trip: toggles survive a refresh', () => {
    const view = openView(`
object Form1: TForm1
  ClientWidth = 100
  ClientHeight = 100
end
`);
    view.panel.webview._handler({
      type: 'labelOpts',
      showName: false,
      showClassName: true,
      showCaption: true,
      showAlign: false,
    });
    assert.deepEqual(view._labelOpts, {
      showName: false,
      showClassName: true,
      showCaption: true,
      showAlign: false,
    });
    view._updateHtml();
    const update = lastPosted(view);
    assert.ok(update && update.type === 'update');
    assert.deepEqual(update.state.labelOpts, {
      showName: false,
      showClassName: true,
      showCaption: true,
      showAlign: false,
    });
  });

  test('dotted sub-properties appear in bootProps (property inspector)', () => {
    const view = openView(`
object DottedForm: TDottedForm
  Left = 0
  Top = 0
  ClientWidth = 400
  ClientHeight = 300
  Caption = 'Test'
  object DatePicker: TIWCGJQDatePicker
    Left = 208
    Top = 6
    Width = 185
    Height = 48
    Caption = 'aktuelles Datum:'
    JQDatePickerOptions.DateFormat = 'dd.mm.yyyy'
    JQDatePickerOptions.DayNamesMin.Strings = (
      'Mo'
      'Di'
      'Mi'
      'Do'
      'Fr'
      'Sa'
      'So')
  end
end
`);
    const html = view.panel.webview.html;

    var propsStart = html.indexOf('const bootProps = ') + 18;
    var propsEnd = html.indexOf(';\n', propsStart);
    if (propsEnd === -1) propsEnd = html.indexOf(';', propsStart);
    var propsJson = html.slice(propsStart, propsEnd);
    const propsMap = JSON.parse(propsJson);

    const ids = Object.keys(propsMap);
    const dpId = ids.find((id) => id.includes('DatePicker'));
    assert.ok(dpId, 'DatePicker node should have an entry in propertiesMap');

    const props = propsMap[dpId];
    const dateFmt = props.find((p) => p.name === 'JQDatePickerOptions.DateFormat');
    assert.ok(dateFmt, 'JQDatePickerOptions.DateFormat should appear in inspector properties');
    assert.equal(dateFmt.value, 'dd.mm.yyyy');

    // Multi-line parenthesized TStrings values are now extracted
    const dayNames = props.find((p) => p.name === 'JQDatePickerOptions.DayNamesMin.Strings');
    assert.ok(dayNames, 'JQDatePickerOptions.DayNamesMin.Strings should now appear (TStrings extracted)');
    assert.ok(dayNames.value.includes('Mo'), 'value should contain extracted strings');
  });

  test('dotted sub-property in bootProps survives embedJson escaping', () => {
    const view = openView(`
object Form: TForm
  Caption = 'X'
  JQDatePickerOptions.DateFormat = 'dd.mm.yyyy'
end
`);
    const html = view.panel.webview.html;

    // Property name must appear literally in the serialized propsMap
    assert.ok(
      html.includes('JQDatePickerOptions.DateFormat'),
      'dotted property name should survive JSON serialization + embedJson'
    );
  });

  test('setProp encodes newlines as #13#10 in string properties', async () => {
    const view = openView(`
object Form1: TForm1
  Caption = 'Hi'
end
`);
    view.panel.webview._handler({ type: 'select', nodeId: 'Form1' });
    await new Promise((resolve) => {
      const orig = view._refreshFromDocument.bind(view);
      view._refreshFromDocument = function () {
        orig();
        resolve();
      };
      view.panel.webview._handler({
        type: 'setProp',
        nodeId: 'Form1',
        propName: 'Caption',
        value: 'Line1\nLine2',
      });
    });
    const text = view.document.getText();
    assert.match(text, /Caption\s*=\s*'Line1'#13#10'Line2'/);
    assert.ok(!text.includes('Caption = Line1\n'), 'raw newline must not break the DFM line');
  });
});
