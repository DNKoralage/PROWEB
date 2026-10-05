/**
 * Clean a CSS file: remove orphan declaration/brace lines that sit outside any
 * rule block (depth 0). Keeps comments, @media/@keyframes wrappers and rules.
 * Writes <file>.clean next to the original for review.
 *   node tools/clean-css.js assets/css/site.css.bak
 */
const fs = require('fs');
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');

let depth = 0;
const kept = [];
const dropped = [];

function stripComments(s) {
  return s.replace(/\/\*.*?\*\//g, '');
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const s = stripComments(line);
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  const trimmed = line.trim();

  const isBlank = trimmed === '';
  const isComment = trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.endsWith('*/');

  if (depth === 0 && !isBlank && !isComment) {
    if (opens === 0 && closes === 0) {
      // Selector continuation lines end with a comma — keep those.
      if (trimmed.endsWith(',')) {
        kept.push(line);
        continue;
      }
      // A stray declaration or text outside any block: drop it.
      dropped.push((i + 1) + ': ' + trimmed.slice(0, 70));
      continue;
    }
    if (opens === 0 && closes > 0) {
      dropped.push((i + 1) + ': stray } -> ' + trimmed.slice(0, 70));
      continue;
    }
  }
  kept.push(line);
  depth += opens - closes;
  if (depth < 0) depth = 0;
}

const out = file.replace(/\.bak$/, '') + '.clean';
fs.writeFileSync(out, kept.join('\n'), 'utf8');
console.log('wrote ' + out + ' (' + kept.length + ' lines, end depth ' + depth + ')');
console.log('dropped ' + dropped.length + ' fragment lines:');
dropped.slice(0, 40).forEach((d) => console.log('  ' + d));