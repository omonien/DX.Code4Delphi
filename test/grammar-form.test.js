'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tokenize, scopesFor } = require('./helpers/grammar-harness.js');

const FORM = 'source.delphi-form';

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'forms', name), 'utf8');
}

test('form grammar tokenizes SimpleVcl.dfm without errors', async () => {
  const tokens = await tokenize(fixture('SimpleVcl.dfm'), FORM);
  assert.ok(tokens.length > 50);
  for (const t of tokens) {
    assert.equal(t.scopes[0], 'source.delphi-form');
  }
});

test('form grammar tokenizes SimpleFmx.fmx without errors', async () => {
  const tokens = await tokenize(fixture('SimpleFmx.fmx'), FORM);
  assert.ok(tokens.length > 40);
  for (const t of tokens) {
    assert.equal(t.scopes[0], 'source.delphi-form');
  }
});

test('object / end / inherited / inline are keywords', async () => {
  const s = [
    'object Form1: TForm1',
    '  inherited Panel1: TPanel',
    '  end',
    '  inline Frame1: TFrame1',
    '  end',
    '  inherited',
    '  object Form2',
    'end',
  ].join('\n');
  for (const word of ['object', 'inherited', 'inline', 'end']) {
    const scopes = await scopesFor(s, word, FORM);
    assert.ok(scopes && scopes.includes('keyword.control.delphi'), `${word} -> ${scopes}`);
  }
  const bare = await scopesFor(s, 'inherited', FORM);
  assert.ok(bare && bare.includes('keyword.control.delphi'), bare);
});

test('object header highlights name and type', async () => {
  const s = 'object FormHaupt: TFormHaupt';
  const nameScopes = await scopesFor(s, 'FormHaupt', FORM);
  const typeScopes = await scopesFor(s, 'TFormHaupt', FORM);
  assert.ok(nameScopes && nameScopes.includes('entity.name.type.delphi'), nameScopes);
  assert.ok(typeScopes && typeScopes.includes('entity.name.type.delphi'), typeScopes);
});

test('property names and assignment are scoped', async () => {
  const s = "  Caption = 'Hello'";
  const prop = await scopesFor(s, 'Caption', FORM);
  const eq = await scopesFor(s, '=', FORM);
  assert.ok(prop && prop.includes('entity.name.variable.property.delphi'), prop);
  assert.ok(eq && eq.includes('keyword.operator.assignment.delphi'), eq);
});

test('dotted property names are scoped as one property token', async () => {
  const s = "  Font.Name = 'Segoe UI'";
  const tokens = await tokenize(s, FORM);
  const prop = tokens.find((t) => t.text === 'Font.Name');
  assert.ok(prop, 'expected Font.Name token');
  assert.ok(prop.scopes.includes('entity.name.variable.property.delphi'), prop.scopes.join(' '));
});

test('strings use string scope', async () => {
  const s = "  Caption = 'SDE-Protokoll-Testclient'";
  const scopes = await scopesFor(s, "'SDE-Protokoll-Testclient'", FORM);
  assert.ok(scopes && scopes.includes('string.quoted.single.delphi'), scopes);
});

test('numbers and negatives are numeric scopes', async () => {
  const s = '  Left = 0\n  Font.Height = -24\n  ClientWidth = 1534';
  assert.ok((await scopesFor(s, '0', FORM)).includes('constant.numeric.integer.delphi'));
  assert.ok((await scopesFor(s, '-24', FORM)).includes('constant.numeric.integer.delphi'));
  assert.ok((await scopesFor(s, '1534', FORM)).includes('constant.numeric.integer.delphi'));
});

test('floats are float scope', async () => {
  const s = '  Size.Width = 400.000000000000000000';
  const scopes = await scopesFor(s, '400.000000000000000000', FORM);
  assert.ok(scopes && scopes.includes('constant.numeric.float.delphi'), scopes);
});

test('True/False are language constants', async () => {
  const s = '  OldCreateOrder = False\n  Visible = True';
  assert.ok((await scopesFor(s, 'False', FORM)).includes('constant.language.delphi'));
  assert.ok((await scopesFor(s, 'True', FORM)).includes('constant.language.delphi'));
});

test('set members and enum-like values use the plain value scope', async () => {
  const s = '  Font.Style = []\n  Align = alTop\n  Anchors = [akLeft, akTop, akRight]';
  assert.ok((await scopesFor(s, 'alTop', FORM)).includes('variable.other.delphi'));
  assert.ok((await scopesFor(s, 'akLeft', FORM)).includes('variable.other.delphi'));
});

test('DFM #nnn string encoding is one whole string token', async () => {
  const s = [
    "  Caption = 'ELKE - '#220'bersicht'",
    "  Caption = 'l'#246'schen'",
    "  Caption = 'au'#223'erhalb'",
    "  Caption = 'N'#228'chster >'",
  ].join('\n');
  const tokens = await tokenize(s, FORM);
  const wholes = [
    "'ELKE - '#220'bersicht'",
    "'l'#246'schen'",
    "'au'#223'erhalb'",
    "'N'#228'chster >'",
  ];
  for (const whole of wholes) {
    const tok = tokens.find((t) => t.text === whole);
    assert.ok(tok, `expected whole string token ${JSON.stringify(whole)}`);
    assert.ok(
      tok.scopes.includes('string.quoted.single.delphi'),
      `${whole} -> ${tok.scopes.join(' ')}`
    );
  }
  // no split-out #nnn token next to string fragments
  assert.equal(tokens.filter((t) => /^#\d+$/.test(t.text)).length, 0);
});

test('binary hex blocks are scoped', async () => {
  const s = '  Picture.Data = {\n    07544269746D6170}\n';
  const tokens = await tokenize(s, FORM);
  const hex = tokens.find((t) => t.text === '07544269746D6170');
  assert.ok(hex, 'hex payload token');
  assert.ok(hex.scopes.includes('constant.numeric.hex.delphi'), hex.scopes.join(' '));
});

test('multi-line (* *) comments span lines', async () => {
  const s = ['(* comment', '   spans lines *)', '  Left = 1'].join('\n');
  const tokens = await tokenize(s, FORM);
  const span = tokens.find((t) => t.text.includes('spans lines'));
  assert.ok(span && span.scopes.includes('comment.block.pascal.delphi'), span && span.scopes.join(' '));
  const left = await scopesFor(s, 'Left', FORM);
  assert.ok(left && left.includes('entity.name.variable.property.delphi'), left);
});

test('stray < in an unterminated string does not open a collection', async () => {
  const s = "  Caption = '<<<<<<<";
  const tokens = await tokenize(s, FORM);
  assert.equal(
    tokens.filter((t) => t.scopes.some((sc) => sc.startsWith('meta.embedded.collection'))).length,
    0
  );
});

test('item keyword inside collections', async () => {
  const s = [
    '  Items = <',
    '    item',
    "      Caption = 'One'",
    '    end',
    '    item',
    "      Caption = 'Two'",
    '    end>',
  ].join('\n');
  const scopes = await scopesFor(s, 'item', FORM);
  assert.ok(scopes && scopes.includes('keyword.control.delphi'), scopes);
});

test('package.json contributes form grammar', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const formLang = pkg.contributes.languages.find((l) => l.id === 'delphi-form');
  assert.ok(formLang);
  assert.deepEqual(formLang.extensions, ['.dfm', '.fmx']);
  const formGrammar = pkg.contributes.grammars.find((g) => g.language === 'delphi-form');
  assert.ok(formGrammar);
  assert.equal(formGrammar.scopeName, 'source.delphi-form');
  assert.equal(formGrammar.path, './syntaxes/delphi-form.tmLanguage.json');
});
