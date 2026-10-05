/**
 * site.css got fragmented by incremental edits: section blocks ended up in
 * the wrong order and a duplicate tail was appended. This script extracts
 * every "/* --- section --- *\/" block and rewrites the file in a canonical
 * order, so the stylesheet parses as one clean sheet.
 *
 *   node tools/rebuild-css.js
 */
const fs = require('fs');
const file = 'assets/css/site.css';
const src = fs.readFileSync(file, 'utf8');

// Split on section banner comments, e.g. "/* ------ name ------ */".
// The dashes either side are greedy and the closer may be preceded by a space.
const banner = /^\/\* -{3,}\s*([^\r\n]+?)\s*-*\s*\*\/[ \t]*\r?$/gm;
const marks = [];
let m;
while ((m = banner.exec(src)) !== null) {
  marks.push({ name: m[1].trim(), start: m.index, end: m.index + m[0].length });
}

console.log('found ' + marks.length + ' section banners:');
marks.forEach((k, i) => console.log('  ' + (i + 1) + '. ' + k.name));

// A block runs from its banner to the start of the next banner.
const blocks = marks.map((k, i) => ({
  name: k.name,
  text: src.slice(k.start, i + 1 < marks.length ? marks[i + 1].start : src.length).trim()
}));

// Canonical order for the stylesheet.
const ORDER = [
  'tokens', 'base', 'typography', 'buttons', 'toast', 'cursor', 'nav',
  'hero', 'about', 'filters', 'cards', 'logo grid', 'radio',
  'lightbox', 'video box', 'article', 'contact', 'footer',
  'Pre-loader: 10 second animated intro.', 'centre'
];

const used = new Set();
const ordered = [];
ORDER.forEach((name) => {
  blocks.forEach((b, i) => {
    if (!used.has(i) && b.name.toLowerCase().indexOf(name.toLowerCase()) === 0) {
      ordered.push(b); used.add(i);
    }
  });
});
// anything not matched goes at the end so nothing is silently dropped
blocks.forEach((b, i) => { if (!used.has(i)) { ordered.push(b); console.log('  (appended, no slot): ' + b.name); } });

// Header + the two base blocks that precede the first banner.
const header = src.slice(0, marks[0].start).trim();

const out = [header]
  .concat(ordered.map((b) => b.text))
  .join('\n\n') + '\n';

fs.writeFileSync(file, out, 'utf8');
console.log('\nrebuilt: ' + out.split('\n').length + ' lines');
console.log('order: ' + ordered.map((b) => b.name).join(' -> '));