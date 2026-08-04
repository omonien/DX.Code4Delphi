'use strict';

const fs = require('fs');
const path = require('path');
const { Registry, parseRawGrammar } = require('vscode-textmate');
const onig = require('vscode-oniguruma');

let registryPromise = null;

function getRegistry() {
  if (!registryPromise) {
    registryPromise = (async () => {
      const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
      const wasm = fs.readFileSync(wasmPath).buffer;
      await onig.loadWASM(wasm);
      return new Registry({
        onigLib: Promise.resolve({
          createOnigScanner: (s) => onig.createOnigScanner(s),
          createOnigString: (s) => onig.createOnigString(s),
        }),
        loadGrammar: async (scopeName) => {
          if (scopeName === 'source.delphi') {
            const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'delphi.tmLanguage.json');
            return parseRawGrammar(fs.readFileSync(grammarPath, 'utf8'), 'delphi.tmLanguage.json');
          }
          return null;
        },
      });
    })();
  }
  return registryPromise;
}

/**
 * Tokenize `source` with the Delphi grammar and return a map of
 * token text -> array of scopes (full scope path strings).
 */
async function tokenize(source) {
  const registry = await getRegistry();
  const grammar = await registry.loadGrammar('source.delphi');
  const lines = source.split('\n');
  let ruleStack = null;
  const tokens = [];
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;
    for (const token of result.tokens) {
      const text = line.slice(token.startIndex, token.endIndex);
      if (text.trim().length > 0) {
        tokens.push({ text, scopes: token.scopes.slice(), line: tokens.length ? -1 : -1 });
      }
    }
  }
  return tokens;
}

/**
 * Return the full scope path (e.g. 'source.delphi keyword.control.delphi')
 * for the first token whose text exactly equals `text`, or null.
 */
async function scopesFor(source, text) {
  const tokens = await tokenize(source);
  const found = tokens.find((t) => t.text === text);
  return found ? found.scopes : null;
}

module.exports = { tokenize, scopesFor, getRegistry };
