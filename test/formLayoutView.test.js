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
    assert.ok(!html.includes('window.__pwned'.concat('=1;</script>')));
    // It is escaped instead, so the value is still transported.
    assert.match(html, /\\u003c\/script/);

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
});
