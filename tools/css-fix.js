/**
 * Close CSS rules that are left open when a section banner comment starts.
 * Each such block makes the browser apply CSS nesting and silently swallow
 * every following rule, which is why the site rendered unstyled.
 *
 * Reports what it changed and writes <file>.fixed.
 *   node tools/css-fix.js assets/css/site.css
 */
const fs = require('fs');
const file = process.argv[2] || 'assets/css/site.css';
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');

const isBanner = (l) => /^\/\* -{3,}/.test(l.trim());
const count = (s, ch) => (s.match(new RegExp('\\' + ch, 'g')) || []).length;

const out = [];
const fixes = [];
let depth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const stripped = line.replace(/\/\*.*?\*\//g, '');

  // Before starting a new top-level section, close anything still open.
  if (depth > 0 && isBanner(line) && depth === 1) {
    out.push('}');
    fixes.push('L' + (i + 1) + ': closed ' + depth + ' dangling block before "' + line.trim().slice(0, 40) + '"');
    depth = 0;
  }

  out.push(line);
  depth += count(stripped, '{') - count(stripped, '}');
  if (depth < 0) depth = 0;
}

// Trailing unbalanced blocks.
while (depth > 0) {
  out.push('}');
  fixes.push('EOF: closed ' + depth + ' dangling block(s)');
  depth--;
}

const target = file.replace(/\.fixed$/, '');
fs.writeFileSync(target + '.fixed', out.join('\n'), 'utf8');
console.log('wrote ' + target + '.fixed');
console.log('fixes applied: ' + fixes.length);
fixes.forEach((f) => console.log('  ' + f));