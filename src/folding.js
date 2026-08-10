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
      regions: cfg.regions,
      conditionals: cfg.conditionals,
    });
    return regions.map(([start, end]) => {
      const head = start >= 0 ? document.lineAt(start).text.trimStart() : '';
      const isSection = cfg.sections && /^(interface|implementation|initialization|finalization)\b/i.test(head);
      const isRegionMarker = cfg.regions && /^\{\$region\b/i.test(head);
      return new vscode.FoldingRange(
        start,
        end,
        (isSection || isRegionMarker) ? vscode.FoldingRangeKind.Region : undefined
      );
    });
  }
}

module.exports = { DelphiFoldingProvider };
