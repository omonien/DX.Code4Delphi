'use strict';

const vscode = require('vscode');
const { computeFoldRegions } = require('./parser.js');
const { getConfig } = require('./configuration.js');

class DelphiFoldingProvider {
  provideFoldingRanges(document, _context, _token) {
    const cfg = getConfig().folding;
    const regions = computeFoldRegions(document.getText(), {
      sections: cfg.sections,
      beginEnd: cfg.beginEnd,
    });
    return regions.map(([start, end]) => {
      const isSection = cfg.sections && start >= 0 && /^(interface|implementation|initialization|finalization)\b/.test(
        document.lineAt(start).text.trimStart()
      );
      return new vscode.FoldingRange(
        start,
        end,
        isSection ? vscode.FoldingRangeKind.Region : undefined
      );
    });
  }
}

module.exports = { DelphiFoldingProvider };
