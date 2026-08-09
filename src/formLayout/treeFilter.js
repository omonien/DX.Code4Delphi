'use strict';

/**
 * Build the lowercase search haystack for a tree node (name + className).
 * @param {string} [name]
 * @param {string} [className]
 * @returns {string}
 */
function buildSearchText(name, className) {
  return ((name || '') + ' ' + (className || '')).toLowerCase();
}

/**
 * Compute which tree nodes should be hidden for a filter query.
 *
 * @param {{ search: string, parent: number|null }[]} entries
 *   Flat list of nodes. `parent` is the index of the parent entry, or null for roots.
 * @param {string} query
 * @returns {boolean[]} `true` = hidden for each entry index
 */
function computeTreeFilterHidden(entries, query) {
  const q = (query || '').toLowerCase();
  const n = entries.length;
  if (!q) {
    return entries.map(() => false);
  }

  const show = new Array(n);
  for (let i = 0; i < n; i++) {
    const hay = entries[i].search || '';
    show[i] = hay.indexOf(q) !== -1;
  }

  // Ancestors of matches must stay visible
  for (let i = 0; i < n; i++) {
    if (!show[i]) continue;
    let p = entries[i].parent;
    while (p != null && p >= 0 && p < n) {
      if (show[p]) break;
      show[p] = true;
      p = entries[p].parent;
    }
  }

  return show.map((s) => !s);
}

module.exports = {
  buildSearchText,
  computeTreeFilterHidden,
};
