'use strict';

/**
 * Tests for the webview host: HTML generation, script-safe embedding of
 * arbitrary DFM text, and id-based selection / "go to source".
 *
 * `vscode` is not resolvable outside the extension host, so it is mocked
 * through Module._load the same way test/extension.test.js does it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class Position {
  constructor(line, character) { this.line = line; this.character = character; }
}
class Range {
  constructor(start, end) { this.start = start; this.end = end; }
}

const shownDocuments = [];

function createPanel() {
  return {
    webview: {
      html: '',
      onDidReceiveMessage(handler) {
        this._handler = handler;
        return { dispose() {} };
      },
    },
    reveal() {},
    onDidDispose() { return { dispose() {} }; },
  };
}

let lastPanel = null;

const vscodeMock = {
  Position,
  Range,
  ViewColumn: { One: 1, Beside: 2 },
  window: {
    createWebviewPanel() {
      lastPanel = createPanel();
      return lastPanel;
    },
    showTextDocument(document, options) {
      shownDocuments.push({ document, options });
    },
    showInformationMessage() {},
  },
  workspace: {
    onDidChangeTextDocument() {
      return { dispose() {} };
    },
    getConfiguration() {
      return {
        get(key, defaultValue) {
          // Default label display options for tests
          if (key === 'formLayout.labels.showName') return true;
          if (key === 'formLayout.labels.showClassName') return false;
          if (key === 'formLayout.labels.showCaption') return false;
          if (key === 'formLayout.labels.showAlign') return false;
          return defaultValue;
        },
      };
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.apply(this, arguments);
};

const { FormLayoutView } = require('../src/formLayout/FormLayoutView.js');

function makeDocument(text, fileName = '/tmp/Test.dfm') {
  return {
    fileName,
    uri: { toString: () => 'file://' + fileName, fsPath: fileName },
    getText: () => text,
  };
}

function openView(text, fileName) {
  const context = { subscriptions: [] };
  const view = new FormLayoutView(context, makeDocument(text, fileName));
  return view;
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

    var propsStart = html.indexOf('const propertiesMap = ') + 22;
    var propsEnd = html.indexOf(';', propsStart);
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

    var treeStart = html.indexOf('\n    const tree = ') + 18;
    assert.ok(treeStart > 17, 'tree variable found');
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
});
