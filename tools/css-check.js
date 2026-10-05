/**
 * Find orphaned CSS declarations: lines outside any rule that start a new
 * block. These silently truncate a stylesheet in the browser.
 *   node tools/css-check.js assets/css/site.css
 */
const fs = require('fs');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');

let depth = 0;
const problems = [];

lines.forEach((raw, idx) => {
  const stripped = raw.replace(/\/\*.*?\*\//g, '');
  const hasOpen = stripped.includes('{');
  const hasClose = stripped.includes('}');
  const trimmed = raw.trim();

  // A declaration ending in ";" while depth === 0 has lost its selector.
  if (depth === 0 && !hasOpen && !hasClose && trimmed && /;\s*$/.test(trimmed)) {
    problems.push('L' + (idx + 1) + ' orphaned declaration: ' + trimmed.slice(0, 64));
  }
  if (depth === 0 && hasClose && !hasOpen) {
    problems.push('L' + (idx + 1) + ' stray closing brace: ' + trimmed.slice(0, 64));
  }
  if (hasOpen) depth++;
  if (hasClose) depth--;
  if (depth < 0) { problems.push('L' + (idx + 1) + ' depth negative'); depth = 0; }
});

if (depth !== 0) problems.push('file ends at depth ' + depth);

if (problems.length) {
  console.log('PROBLEMS in ' + file + ':');
  problems.forEach((p) => console.log('  ' + p));
  process.exitCode = 1;
} else {
  console.log('css ok (' + lines.length + ' lines, structure sound)');
}