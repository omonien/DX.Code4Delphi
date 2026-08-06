'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
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
} = require('../src/parser.js');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

test('maskSource blanks comments and strings but keeps structure', () => {
  const src = "procedure T.Foo;\nbegin\n  // comment {fake}\n  A := 'str ( ;' + #13 + $FF;\n  { block } B := 1; // tail\nend;";
  const masked = maskSource(src);
  assert.ok(!masked.includes('comment'));
  assert.ok(!masked.includes('fake'));
  assert.ok(!masked.includes('str ('));
  assert.ok(masked.includes('procedure'));
  assert.ok(masked.includes('begin'));
  assert.ok(masked.includes('end'));
  assert.ok(masked.includes('$FF'));
  assert.ok(masked.includes(';'));
  assert.ok(masked.includes(':='));
});

test('maskSource keeps multiline strings intact (blanked)', () => {
  const src = "S := '''line1\nline2\nline3''';";
  const masked = maskSource(src);
  assert.ok(!masked.includes('line1'));
  assert.ok(!masked.includes('line2'));
  assert.ok(masked.includes(';'));
  // keyword on a later line must still be visible
  const src2 = "S := '''multi\nline'''; // after\nbegin\nend;";
  const masked2 = maskSource(src2);
  assert.ok(masked2.includes('begin'));
});

test('findSections locates all four section headers', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const s = model.sections;
  assert.ok(s.interface >= 0);
  assert.ok(s.implementation > s.interface);
  assert.ok(s.initialization > s.implementation);
  assert.ok(s.finalization > s.initialization);
  // line numbers are 0-based
  assert.equal(s.interface, 2);
  assert.equal(s.implementation, 53);
  assert.equal(s.initialization, 147);
  assert.equal(s.finalization, 150);
});

test('interface scanning finds class methods with correct class owner', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const iface = model.interfaceMethods;
  const names = iface.map((d) => `${d.className || '<global>'}.${d.name}`).sort();
  assert.ok(names.includes('TMyClass.Create'));
  assert.ok(names.includes('TMyClass.DoWork'));
  assert.ok(names.includes('TMyClass.GetValue'));
  assert.ok(names.includes('TMyClass.Add'));
  assert.ok(names.includes('TMyGeneric.AddItem'));
  assert.ok(names.includes('TMyRecord.Reset'));
  assert.ok(names.includes('TMyHelper.HelperMethod'));
  assert.ok(names.includes('TBase.BaseMethod'));
  // 4 DoWork (abstract + 3 overloads) + Add + Create + Destroy + GetValue + CreateDefault + Annotated + BaseMethod
  const dw = iface.filter((d) => d.name === 'DoWork');
  assert.equal(dw.length, 4);
});

test('implementation scanning finds qualified and global methods, skips locals', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const impl = model.implementationMethods;
  assert.ok(impl.some((d) => d.className === 'TMyClass' && d.name === 'DoWork'));
  assert.ok(impl.some((d) => d.className === 'TMyGeneric' && d.name === 'AddItem'));
  assert.ok(impl.some((d) => d.className === 'TMyRecord' && d.name === 'Implicit'));
  assert.ok(impl.some((d) => d.className === 'TMyHelper' && d.name === 'HelperMethod'));
  const global = impl.find((d) => d.className === null && d.name === 'GlobalHelper');
  assert.ok(global, 'global helper function should be found');
  // nested local routines inside begin/end must NOT be treated as methods
  const complex = analyze(fixture('Complex.pas'));
  const locals = complex.implementationMethods.filter((d) => d.name === 'NestedLocal');
  assert.equal(locals.length, 0, 'nested local routine must be ignored');
  assert.ok(complex.implementationMethods.some((d) => d.name === 'LocalRoutineDemo'));
  assert.ok(complex.implementationMethods.some((d) => d.className === 'TFuncHolder' && d.name === 'SetCallbacks'));
});

test('overloads are matched by parameter types', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const iface = model.interfaceMethods.filter((d) => d.name === 'DoWork');
  const impl = model.implementationMethods.filter((d) => d.name === 'DoWork');
  assert.equal(iface.length, 4);
  assert.equal(impl.length, 3);

  const intString = iface.find((d) => d.params.length === 2 && d.params[1] === 'string');
  const double = iface.find((d) => d.params.length === 1);
  const three = iface.find((d) => d.params.length === 3);

  const implIntString = findImplementation(intString, model.implementationMethods, true);
  const implDouble = findImplementation(double, model.implementationMethods, true);
  const implThree = findImplementation(three, model.implementationMethods, true);

  assert.equal(implIntString.params.length, 2);
  assert.deepEqual(implIntString.params, ['integer', 'string']);
  assert.equal(implDouble.params.length, 1);
  assert.deepEqual(implDouble.params, ['double']);
  assert.equal(implThree.params.length, 3);
  assert.deepEqual(implThree.params, ['integer', 'string', 'array of byte']);
});

test('findImplementation and findDeclaration are mutual inverses', () => {
  const model = analyze(fixture('MyUnit.pas'));
  for (const decl of model.interfaceMethods) {
    const impl = findImplementation(decl, model.implementationMethods, true);
    assert.ok(impl, `no implementation found for ${decl.className}.${decl.name}`);
    const back = findDeclaration(impl, model.interfaceMethods, true);
    assert.equal(back.name.toLowerCase(), decl.name.toLowerCase());
    assert.equal((back.className || '').toLowerCase(), (decl.className || '').toLowerCase());
  }
  // global function round-trip
  const globalIface = model.interfaceMethods.find((d) => d.className === null && d.name === 'GlobalHelper');
  const globalImpl = model.implementationMethods.find((d) => d.className === null && d.name === 'GlobalHelper');
  assert.ok(globalIface && globalImpl);
  assert.equal(findImplementation(globalIface, model.implementationMethods, true), globalImpl);
  assert.equal(findDeclaration(globalImpl, model.interfaceMethods, true), globalIface);
});

test('methodAtPosition resolves the method under the cursor', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const decl = model.interfaceMethods.find((d) => d.name === 'GetValue');
  const hit = methodAtPosition(model, decl.line, decl.col + 1);
  assert.equal(hit, decl);
  // a line inside a method body (no declaration) must not match
  const miss = methodAtPosition(model, model.lineCount - 1, 0);
  assert.equal(miss, null);
});

test('sectionAtPosition and regionForLine', () => {
  const model = analyze(fixture('MyUnit.pas'));
  assert.equal(sectionAtPosition(model, model.sections.interface), 'interface');
  assert.equal(sectionAtPosition(model, model.sections.implementation), 'implementation');
  assert.equal(regionForLine(model, model.sections.interface + 2), 'interface');
  assert.equal(regionForLine(model, model.sections.implementation + 2), 'implementation');
  assert.equal(regionForLine(model, model.sections.initialization + 1), 'initialization');
  assert.equal(regionForLine(model, model.sections.finalization + 1), 'finalization');
});

test('next/previous method navigation', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const first = model.methods[0];
  const next = findNextMethod(model, first.line, first.col);
  assert.ok(next.line >= first.line);
  const last = model.methods[model.methods.length - 1];
  const prev = findPreviousMethod(model, last.line, last.col);
  assert.ok(prev.line <= last.line);
  assert.equal(findNextMethod(model, 99999, 0), null);
  assert.equal(findPreviousMethod(model, -1, 0), null);
});

test('extractParamTypes handles complex signatures', () => {
  assert.deepEqual(extractParamTypes('A: Integer; const B: string'), ['integer', 'string']);
  assert.deepEqual(extractParamTypes('const C: array of Byte'), ['array of byte']);
  assert.deepEqual(extractParamTypes('const F: TFunc<Integer, string>'), ['tfunc<integer, string>']);
  assert.deepEqual(extractParamTypes('const CB: TNotifyEvent'), ['tnotifyevent']);
  // Multi-name groups expand to one type entry per formal parameter
  assert.deepEqual(extractParamTypes('A, B: TMyClass'), ['tmyclass', 'tmyclass']);
  assert.deepEqual(extractParamTypes('X, Y: Integer'), ['integer', 'integer']);
  assert.deepEqual(extractParamTypes('const A, B: Integer'), ['integer', 'integer']);
  assert.deepEqual(extractParamTypes('S: set of Byte'), ['set of byte']);
  assert.deepEqual(extractParamTypes('P: ^Integer'), ['^integer']);
  assert.deepEqual(extractParamTypes('const P: procedure(A: Integer) of object'), ['procedure(a: integer) of object']);
  assert.deepEqual(extractParamTypes(''), []);
});

test('forward class and class-of do not pollute later global routines', () => {
  const src = [
    'unit U;',
    'interface',
    'type',
    '  TFoo = class;',
    '  TMeta = class of TObject;',
    '  TBar = class',
    '    procedure Hello;',
    '  end;',
    'procedure GlobalProc;',
    'implementation',
    'procedure TBar.Hello;',
    'begin',
    'end;',
    'procedure GlobalProc;',
    'begin',
    'end;',
    'end.',
  ].join('\n');
  const model = analyze(src);
  const hello = model.interfaceMethods.find((d) => d.name === 'Hello');
  const global = model.interfaceMethods.find((d) => d.name === 'GlobalProc');
  assert.equal(hello.className, 'TBar');
  assert.equal(global.className, null, 'global must not inherit a forward/class-of owner');
  const impl = findImplementation(global, model.implementationMethods, true);
  assert.ok(impl, 'global procedure must resolve to its implementation');
  assert.equal(impl.className, null);
});

test('type keyword on the same line as the class name still owns methods', () => {
  const src = [
    'unit U;',
    'interface',
    'type T = class',
    '  procedure Hello;',
    'end;',
    'implementation',
    'procedure T.Hello;',
    'begin',
    'end;',
    'end.',
  ].join('\n');
  const model = analyze(src);
  assert.equal(model.interfaceMethods.length, 1);
  assert.equal(model.interfaceMethods[0].className, 'T');
  assert.ok(findImplementation(model.interfaceMethods[0], model.implementationMethods, true));
});

test('multi-name interface params match split implementation params', () => {
  const src = [
    'unit U;',
    'interface',
    'type',
    '  T = class',
    '    procedure Foo(A, B: Integer); overload;',
    '    procedure Foo(S: string); overload;',
    '  end;',
    'implementation',
    'procedure T.Foo(A: Integer; B: Integer);',
    'begin',
    'end;',
    'procedure T.Foo(S: string);',
    'begin',
    'end;',
    'end.',
  ].join('\n');
  const model = analyze(src);
  const ifaceInt = model.interfaceMethods.find((d) => d.params[0] === 'integer');
  const ifaceStr = model.interfaceMethods.find((d) => d.params[0] === 'string');
  assert.deepEqual(ifaceInt.params, ['integer', 'integer']);
  const implInt = findImplementation(ifaceInt, model.implementationMethods, true);
  const implStr = findImplementation(ifaceStr, model.implementationMethods, true);
  assert.ok(implInt);
  assert.deepEqual(implInt.params, ['integer', 'integer']);
  assert.ok(implStr);
  assert.deepEqual(implStr.params, ['string']);
});

test('overload match does not fall back to the wrong candidate', () => {
  const src = [
    'unit U;',
    'interface',
    'type',
    '  T = class',
    '    procedure Foo(A: Integer); overload;',
    '    procedure Foo(S: string); overload;',
    '  end;',
    'implementation',
    'procedure T.Foo(S: string);',
    'begin',
    'end;',
    // Integer overload deliberately missing
    'end.',
  ].join('\n');
  const model = analyze(src);
  const ifaceInt = model.interfaceMethods.find((d) => d.params[0] === 'integer');
  const ifaceStr = model.interfaceMethods.find((d) => d.params[0] === 'string');
  assert.equal(findImplementation(ifaceInt, model.implementationMethods, true), null);
  assert.ok(findImplementation(ifaceStr, model.implementationMethods, true));
});

test('indented begin does not suppress subsequent implementation methods', () => {
  const src = [
    'unit U;',
    'interface',
    'implementation',
    'procedure Foo;',
    '  begin',
    '  end;',
    'procedure Bar;',
    'begin',
    'end;',
    'end.',
  ].join('\n');
  const names = analyze(src).implementationMethods.map((d) => d.name);
  assert.deepEqual(names, ['Foo', 'Bar']);
});

test('methodAtPosition respects signature end column', () => {
  const src = [
    'unit U;',
    'interface',
    'type',
    '  T = class',
    '    procedure A; procedure B;',
    '  end;',
    'implementation',
    'end.',
  ].join('\n');
  const model = analyze(src);
  // Only the first method is scanned (line-anchored), but past its ';' must not hit
  const a = model.interfaceMethods.find((d) => d.name === 'A');
  assert.ok(a);
  assert.equal(methodAtPosition(model, a.line, a.col + 1), a);
  assert.equal(methodAtPosition(model, a.line, a.signatureEndCol + 1), null);
});

test('countBlockDelta counts begin/end style blocks', () => {
  assert.equal(countBlockDelta('begin'), 1);
  assert.equal(countBlockDelta('end;'), -1);
  assert.equal(countBlockDelta('end else begin'), 0);
  assert.equal(countBlockDelta('TFoo = class(TObject)'), 1);
  assert.equal(countBlockDelta('TBar = record'), 1);
  assert.equal(countBlockDelta('case X of'), 1);
  assert.equal(countBlockDelta('try'), 1);
  assert.equal(countBlockDelta('class procedure Foo;'), 0);
  assert.equal(countBlockDelta('end.'), -1);
  assert.equal(countBlockDelta('procedure Foo; begin'), 1);
});

test('computeFoldRegions produces balanced begin/end folds', () => {
  const model = analyze(fixture('MyUnit.pas'));
  const regions = computeFoldRegions(fixture('MyUnit.pas'), { sections: true, beginEnd: true });
  assert.ok(regions.length >= 10);
  // sections folds present
  const ifaceFold = regions.find(([s]) => s === model.sections.interface);
  assert.ok(ifaceFold, 'interface section fold');
  const implFold = regions.find(([s]) => s === model.sections.implementation);
  assert.ok(implFold, 'implementation section fold');
  // a begin/end fold spans the DoWork body
  const dw = model.implementationMethods.find((d) => d.name === 'DoWork' && d.params.length === 2);
  const beginLine = dw.line + 1; // line after signature = 'begin'
  const bodyFold = regions.find(([s, e]) => s === beginLine && e > beginLine);
  assert.ok(bodyFold, 'begin/end fold for method body');
  // no region starts below document end
  for (const [s, e] of regions) {
    assert.ok(s >= 0 && e >= s && e < model.lineCount);
  }
});

test('empty input and no-section input are safe', () => {
  const model = analyze('');
  assert.equal(model.methods.length, 0);
  assert.equal(findNextMethod(model, 0, 0), null);
  assert.equal(regionForLine(model, 0), 'header');

  const noSections = analyze('program P;\nbegin\nend.');
  assert.equal(noSections.sections.interface, -1);
  assert.equal(noSections.sections.implementation, -1);
});
