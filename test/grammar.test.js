'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tokenize, scopesFor } = require('./helpers/grammar-harness.js');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

const SNIPPET = [
  'unit MyUnit;',
  '',
  'interface',
  '',
  'uses',
  '  System.SysUtils, System.Classes;',
  '',
  'type',
  '  TMyClass = class(TObject)',
  '  private',
  '    FValue: Integer; // a field',
  '    { a block comment }',
  '    (* another *)',
  '    procedure DoWork(A: Integer; const B: string); virtual; abstract;',
  '    function GetValue: Integer;',
  '    class operator Add(A, B: TMyClass): TMyClass;',
  '  public',
  '    constructor Create;',
  '    [ComponentName(1)]',
  '    procedure Annotated;',
  '    property Value: Integer read FValue write FValue;',
  '  end;',
  '',
  'implementation',
  '',
  'procedure TMyClass.DoWork(A: Integer; const B: string);',
  'begin',
  '  FValue := $FF + 42 + 3.14 + %1010;',
  '  if FValue > 0 then',
  '    WriteLn(Format(\'x %d\', [FValue]))',
  '  else',
  '    WriteLn(\'nope\');',
  '  {$IFDEF DEBUG}',
  '  WriteLn(\'debug\' + #13#10 + \'mode\');',
  '  {$ENDIF}',
  'end;',
  '',
  'end.',
].join('\n');

test('grammar tokenizes a full unit without errors', async () => {
  const tokens = await tokenize(fixture('MyUnit.pas'));
  assert.ok(tokens.length > 100);
  // every token must carry a valid scope chain starting with source.delphi
  for (const t of tokens) {
    assert.equal(t.scopes[0], 'source.delphi');
  }
});

test('keywords get keyword scopes', async () => {
  const s = 'begin if then else case while for do and not end.';
  const checks = {
    begin: 'keyword.control.delphi',
    if: 'keyword.control.delphi',
    case: 'keyword.control.delphi',
    and: 'keyword.operator.logical.delphi',
    not: 'keyword.operator.logical.delphi',
    end: 'keyword.control.delphi',
  };
  for (const [word, scope] of Object.entries(checks)) {
    const scopes = await scopesFor(s, word);
    assert.ok(scopes && scopes.includes(scope), `${word} should have ${scope}, got ${scopes}`);
  }
});

test('section keywords are highlighted', async () => {
  const s = 'unit X; interface implementation initialization finalization uses type var const';
  for (const word of ['interface', 'implementation', 'initialization', 'finalization', 'uses', 'type', 'var', 'const']) {
    const scopes = await scopesFor(s, word);
    assert.ok(scopes && scopes.includes('keyword.control.section.delphi'), `${word} -> ${scopes}`);
  }
});

test('method declarations highlight keyword and function name', async () => {
  const scopes = await scopesFor(SNIPPET, 'procedure');
  assert.ok(scopes.includes('storage.type.function.delphi'), scopes.join(' '));
  const nameScopes = await scopesFor(SNIPPET, 'DoWork');
  assert.ok(nameScopes.includes('entity.name.function.delphi'), nameScopes.join(' '));
});

test('qualified implementation name: class and method separated', async () => {
  const s = 'procedure TMyClass.DoWork(A: Integer);';
  const tokens = await tokenize(s);
  const cls = tokens.find((t) => t.text === 'TMyClass');
  const meth = tokens.find((t) => t.text === 'DoWork');
  assert.ok(cls && cls.scopes.includes('entity.name.type.delphi'), cls && cls.scopes.join(' '));
  assert.ok(meth && meth.scopes.includes('entity.name.function.delphi'), meth && meth.scopes.join(' '));
  const dot = tokens.find((t) => t.text === '.');
  assert.ok(dot && dot.scopes.includes('punctuation.accessor.delphi'), dot && dot.scopes.join(' '));
});

test('type declarations highlight the class name', async () => {
  const s = 'type\n  TMyClass = class(TObject)\n  TMyRecord = record\n  end;';
  const clsScopes = await scopesFor(s, 'TMyClass');
  assert.ok(clsScopes.includes('entity.name.type.delphi'), clsScopes.join(' '));
  const recScopes = await scopesFor(s, 'TMyRecord');
  assert.ok(recScopes.includes('entity.name.type.delphi'), recScopes.join(' '));
});

test('built-in types are support.type.primitive', async () => {
  const s = 'var A: Integer; B: string; C: Double; D: TObject; E: TList<Integer>;';
  for (const word of ['Integer', 'string', 'Double', 'TObject']) {
    const scopes = await scopesFor(s, word);
    assert.ok(scopes && scopes.includes('support.type.primitive.delphi'), `${word} -> ${scopes}`);
  }
});

test('comments: line, brace, paren-star, and compiler directives', async () => {
  const s = [
    '// line comment',
    '{ brace comment }',
    '(* paren comment *)',
    '{$IFDEF DEBUG}',
    '{$ENDIF}',
    'A := 1; // tail',
  ].join('\n');
  const line = await scopesFor(s, '// line comment');
  assert.ok(line.includes('comment.line.double-slash.delphi'), line.join(' '));
  const brace = await scopesFor(s, '{ brace comment }');
  assert.ok(brace.includes('comment.block.delphi'), brace.join(' '));
  const paren = await scopesFor(s, '(* paren comment *)');
  assert.ok(paren.includes('comment.block.pascal.delphi'), paren.join(' '));
  const opening = await scopesFor(s, '{$');
  assert.ok(opening && opening.includes('meta.preprocessor.delphi'), opening && opening.join(' '));
  const ifdefKw = await scopesFor(s, 'IFDEF');
  assert.ok(ifdefKw && ifdefKw.some((sc) => sc.includes('directive')), ifdefKw.join(' '));
  const debugKw = await scopesFor(s, 'DEBUG');
  assert.ok(debugKw && debugKw.includes('constant.language.delphi'), debugKw && debugKw.join(' '));
});

test('directives inside comments are NOT treated as keywords', async () => {
  // a keyword-like word inside a comment must not get a keyword scope
  const s = '{ this comment mentions interface and begin }';
  const comment = await scopesFor(s, '{ this comment mentions interface and begin }');
  assert.ok(comment.includes('comment.block.delphi'));
  const tokens = await tokenize(s);
  for (const t of tokens) {
    assert.ok(t.scopes.some((sc) => sc.startsWith('comment') || sc === 'source.delphi'));
  }
});

test('strings and char codes', async () => {
  const s = "'hello' + #13#10 + #$0A + 'world'";
  const hello = await scopesFor(s, "'hello'");
  assert.ok(hello.includes('string.quoted.single.delphi'), hello.join(' '));
  const code = await scopesFor(s, '#13');
  assert.ok(code && code.includes('constant.character.numeric.delphi'), code.join(' '));
  const hex = await scopesFor(s, '#$0A');
  assert.ok(hex && hex.includes('constant.character.numeric.hex.delphi'), hex.join(' '));
});

test('multiline string literal is a single triple-quoted token', async () => {
  const s = "S := '''line1\nline2''';";
  const tokens = await tokenize(s);
  const triple = tokens.find((t) => t.text.startsWith("'''"));
  assert.ok(triple && triple.scopes.includes('string.quoted.triple.delphi'), triple && triple.scopes.join(' '));
  // keywords after the string on following lines still work
  const s2 = "S := '''multi\nline'''; begin";
  const begin = await scopesFor(s2, 'begin');
  assert.ok(begin && begin.includes('keyword.control.delphi'));
});

test('numbers: decimal, hex, binary, float', async () => {
  const s = '$FF %1010 42 3.14 1_000';
  assert.ok((await scopesFor(s, '$FF')).includes('constant.numeric.hex.delphi'));
  assert.ok((await scopesFor(s, '%1010')).includes('constant.numeric.binary.delphi'));
  assert.ok((await scopesFor(s, '42')).includes('constant.numeric.integer.delphi'));
  assert.ok((await scopesFor(s, '3.14')).includes('constant.numeric.float.delphi'));
  assert.ok((await scopesFor(s, '1_000')).includes('constant.numeric.integer.delphi'));
});

test('range operator is not a float', async () => {
  const s = 'for I := 1 .. 10 do';
  const one = await scopesFor(s, '1');
  assert.ok(one.includes('constant.numeric.integer.delphi'));
  const range = await scopesFor(s, '..');
  assert.ok(range.includes('keyword.operator.range.delphi'), range.join(' '));
});

test('modifiers: virtual, abstract, overload, const, var, out', async () => {
  const s = 'procedure Foo(A: Integer; const B: string); virtual; abstract; overload;';
  for (const word of ['virtual', 'abstract', 'overload']) {
    const scopes = await scopesFor(s, word);
    assert.ok(scopes && scopes.includes('storage.modifier.delphi'), `${word} -> ${scopes}`);
  }
  const constScopes = await scopesFor(s, 'const');
  assert.ok(constScopes && constScopes.includes('storage.type.parameter.delphi'), constScopes.join(' '));
});

test('literals: self, result, nil, true, false', async () => {
  const s = 'self result nil true false';
  for (const word of ['self', 'result', 'nil', 'true', 'false']) {
    const scopes = await scopesFor(s, word);
    assert.ok(scopes && scopes.includes('constant.language.delphi'), `${word} -> ${scopes}`);
  }
});

test('attributes are recognized (and array indexing is not)', async () => {
  const s = '[ComponentName(1)]\nprocedure Annotated;\nvar A: array[0..9] of Integer;';
  const attrName = await scopesFor(s, 'ComponentName');
  assert.ok(attrName && attrName.includes('entity.other.attribute-name.delphi'), attrName && attrName.join(' '));
  const bracket = await scopesFor(s, '[');
  assert.ok(bracket && bracket.includes('meta.attribute.delphi'), bracket && bracket.join(' '));
  const close = await scopesFor(s, ']');
  assert.ok(close && close.includes('meta.attribute.delphi'), close && close.join(' '));
  // array indexing must NOT be treated as an attribute
  const idx = await scopesFor(s, '[0..9]');
  assert.equal(idx, null, 'array index must not be an attribute');
  const zero = await scopesFor(s, '0');
  assert.ok(zero && zero.includes('constant.numeric.integer.delphi'));
});

test('operators and assignment', async () => {
  const s = 'A := B + C * D / E; if X <> Y then;';
  assert.ok((await scopesFor(s, ':=')).includes('keyword.operator.assignment.delphi'));
  assert.ok((await scopesFor(s, '+')).includes('keyword.operator.delphi'));
  assert.ok((await scopesFor(s, '<>')).includes('keyword.operator.assignment.delphi'));
});

test('generics type parameters are highlighted', async () => {
  const s = 'TMyGeneric<T> = class(TObject)';
  const scopes = await scopesFor(s, '<T>');
  assert.ok(scopes && scopes.includes('entity.name.type.delphi'), scopes.join(' '));
});

test('records, helpers and interfaces', async () => {
  const s = [
    'type',
    '  IFoo = interface(IInterface)',
    '    procedure DoIt;',
    '  end;',
    '  TRec = record',
    '    X: Integer;',
    '  end;',
    '  THelper = class helper for TRec',
    '    function Fmt: string;',
    '  end;',
  ].join('\n');
  assert.ok((await scopesFor(s, 'IFoo')).includes('entity.name.type.delphi'));
  assert.ok((await scopesFor(s, 'TRec')).includes('entity.name.type.delphi'));
  assert.ok((await scopesFor(s, 'THelper')).includes('entity.name.type.delphi'));
  const recordScopes = await scopesFor(s, 'record');
  assert.ok(recordScopes && recordScopes.some((sc) => sc.includes('storage.type.delphi')), recordScopes.join(' '));
});

test('builtin RTL functions are support.function.builtin', async () => {
  const s = 'Length(S); SetLength(S, 10); IntToStr(42); Format(\'%d\', [1]);';
  for (const word of ['Length', 'SetLength', 'IntToStr', 'Format']) {
    const scopes = await scopesFor(s, word);
    assert.ok(scopes && scopes.includes('support.function.builtin.delphi'), `${word} -> ${scopes}`);
  }
});

test('words inside strings are not highlighted as keywords', async () => {
  const s = "'this is not a begin end procedure'";
  const tokens = await tokenize(s);
  for (const t of tokens) {
    assert.ok(t.scopes.every((sc) => sc.startsWith('source') || sc.startsWith('string') || sc.startsWith('constant.character')), t.text + ' -> ' + t.scopes);
  }
});

test('unrelated identifiers get no bogus scopes', async () => {
  const s = 'MyVariable := SomeProcedure(AnotherValue);';
  const tokens = await tokenize(s);
  for (const t of tokens) {
    if (/^[A-Za-z_]/.test(t.text)) {
      assert.ok(t.scopes.length === 1, `${t.text} should only have source.delphi, got ${t.scopes.join(' ')}`);
    }
  }
});

test('a large real-world unit tokenizes quickly and stays balanced', async () => {
  const src = fixture('Complex.pas');
  const start = Date.now();
  const tokens = await tokenize(src);
  const elapsed = Date.now() - start;
  assert.ok(tokens.length > 50);
  assert.ok(elapsed < 5000, `tokenization took ${elapsed}ms`);
});

test('modern Delphi 12/13 features: inline var, managed records, weak refs, multiline strings', async () => {
  const s = [
    'procedure Demo;',
    'var',
    '  inline var I: Integer;',
    'begin',
    '  I := 1;',
    'end;',
    '',
    'TManaged = record',
    '  class operator Initialize(var Dest: TManaged);',
    '  class operator Finalize(var Dest: TManaged);',
    '  class operator Assign(var Dest: TManaged; const [ref] Src: TManaged);',
    'end;',
    '',
    'TFoo = class',
    'private',
    '  FWeak: [weak] TObject;',
    '  FUnsafe: [unsafe] TObject;',
    'public',
    '  procedure DoIt; inline;',
    'end;',
    '',
    "S := '''a multi",
    "line''' string;",
  ].join('\n');

  const tokens = await tokenize(s);
  const scope = (text) => {
    const t = tokens.find((x) => x.text === text);
    return t ? t.scopes.join(' ') : null;
  };
  assert.ok(scope('inline').includes('storage.modifier.delphi'), scope('inline'));
  // [weak] / [unsafe] / [ref] are magic attribute names in modern Delphi
  assert.ok(scope('weak').includes('entity.other.attribute-name.delphi'), scope('weak'));
  assert.ok(scope('unsafe').includes('entity.other.attribute-name.delphi'), scope('unsafe'));
  assert.ok(scope('ref').includes('entity.other.attribute-name.delphi'), scope('ref'));
  assert.ok(scope('var').includes('keyword.control.section.delphi'), scope('var'));
  assert.ok(scope('Initialize').includes('entity.name.function.delphi'), scope('Initialize'));
  assert.ok(scope('Finalize').includes('entity.name.function.delphi'), scope('Finalize'));
  assert.ok(scope('Assign').includes('entity.name.function.delphi'), scope('Assign'));
  assert.ok(scope('TManaged').includes('entity.name.type.delphi'), scope('TManaged'));
  assert.ok(scope("'''").includes('string.quoted.triple.delphi'), scope("'''"));
});
