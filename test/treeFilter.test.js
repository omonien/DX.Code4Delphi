'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSearchText,
  computeTreeFilterHidden,
} = require('../src/formLayout/treeFilter.js');

describe('treeFilter', () => {
  test('buildSearchText lowercases name and className', () => {
    assert.equal(buildSearchText('Label1', 'TLabel'), 'label1 tlabel');
    assert.equal(buildSearchText('Form1', 'TForm1'), 'form1 tform1');
    assert.equal(buildSearchText('', 'TButton'), ' tbutton');
  });

  test('"labe" matches Label1 and keeps Form1 ancestor visible', () => {
    // Document order: Form1, Label1, Label2, Button1
    const entries = [
      { search: buildSearchText('Form1', 'TForm1'), parent: null },
      { search: buildSearchText('Label1', 'TLabel'), parent: 0 },
      { search: buildSearchText('Label2', 'TLabel'), parent: 0 },
      { search: buildSearchText('Button1', 'TButton'), parent: 0 },
    ];
    const hidden = computeTreeFilterHidden(entries, 'labe');
    assert.equal(hidden[0], false, 'Form1 ancestor visible');
    assert.equal(hidden[1], false, 'Label1 visible');
    assert.equal(hidden[2], false, 'Label2 visible');
    assert.equal(hidden[3], true, 'Button1 hidden');
  });

  test('"orm" matches Form1 only (children hidden if they do not match)', () => {
    const entries = [
      { search: buildSearchText('Form1', 'TForm1'), parent: null },
      { search: buildSearchText('Label1', 'TLabel'), parent: 0 },
      { search: buildSearchText('Button1', 'TButton'), parent: 0 },
    ];
    const hidden = computeTreeFilterHidden(entries, 'orm');
    assert.equal(hidden[0], false, 'Form1 visible');
    assert.equal(hidden[1], true, 'Label1 hidden');
    assert.equal(hidden[2], true, 'Button1 hidden');
  });

  test('"1" matches Form1, Label1, Button1', () => {
    const entries = [
      { search: buildSearchText('Form1', 'TForm1'), parent: null },
      { search: buildSearchText('Label1', 'TLabel'), parent: 0 },
      { search: buildSearchText('Label2', 'TLabel'), parent: 0 },
      { search: buildSearchText('Button1', 'TButton'), parent: 0 },
    ];
    const hidden = computeTreeFilterHidden(entries, '1');
    assert.deepEqual(hidden, [false, false, true, false]);
  });

  test('nested match keeps intermediate parents visible', () => {
    // Form1 > Panel1 > Button1
    const entries = [
      { search: buildSearchText('Form1', 'TForm1'), parent: null },
      { search: buildSearchText('Panel1', 'TPanel'), parent: 0 },
      { search: buildSearchText('Button1', 'TButton'), parent: 1 },
    ];
    const hidden = computeTreeFilterHidden(entries, 'button');
    assert.equal(hidden[0], false, 'Form1 visible');
    assert.equal(hidden[1], false, 'Panel1 visible');
    assert.equal(hidden[2], false, 'Button1 visible');
  });

  test('empty query shows all', () => {
    const entries = [
      { search: 'a', parent: null },
      { search: 'b', parent: 0 },
    ];
    assert.deepEqual(computeTreeFilterHidden(entries, ''), [false, false]);
    assert.deepEqual(computeTreeFilterHidden(entries, '   '.trim()), [false, false]);
  });

  test('no match hides everything', () => {
    const entries = [
      { search: buildSearchText('Form1', 'TForm1'), parent: null },
      { search: buildSearchText('Label1', 'TLabel'), parent: 0 },
    ];
    assert.deepEqual(computeTreeFilterHidden(entries, 'zzz'), [true, true]);
  });
});
