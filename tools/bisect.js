// Bisect: find the smallest prefix of a JS file that stops parsing.
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');

function ok(n) {
  try { new vm.Script(lines.slice(0, n).join('\n')); return true; }
  catch (e) { return false; }
}

// First find prefixes that parse at all (incomplete functions are fine to
// fail, so we instead look for where the balance "completes").
let lastGood = 0;
for (let n = 1; n <= lines.length; n++) {
  if (ok(n)) lastGood = n;
}
console.log('last fully-parsing prefix length:', lastGood, 'of', lines.length);
if (lastGood) console.log('  ends at: ' + JSON.stringify(lines[lastGood - 1].trim().slice(0, 60)));

// Now report, for each line, the running depth using a real tokenizer-ish
// approach: strip comments and strings with a state machine, then count.
function depthAt(n) {
  const text = lines.slice(0, n).join('\n');
  let d = 0, i = 0, st = null, tpl = 0, prev = '';
  while (i < text.length) {
    const c = text[i], x = text[i + 1];
    if (st) { if (c === '\\') { i += 2; continue; } if (c === st) st = null; i++; continue; }
    if (tpl) { if (c === '\\') { i += 2; continue; } if (c === '`') tpl = 0; i++; continue; }
    if (c === '/' && x === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && x === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/' && '=(,:[!&|?{};+-*%<>^~'.includes(prev)) {
      i++; let cls = false;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '[') cls = true;
        else if (text[i] === ']') cls = false;
        else if (text[i] === '/' && !cls) break;
        else if (text[i] === '\n') break;
        i++;
      }
      i++; prev = 'x'; continue;
    }
    if (c === '"' || c === "'") { st = c; i++; prev = 'x'; continue; }
    if (c === '`') { tpl = 1; i++; prev = 'x'; continue; }
    if ('{(['.includes(c)) d++;
    if ('})]'.includes(c)) d--;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return d;
}

// Print depth at the end of each top-level function declaration.
lines.forEach((line, idx) => {
  if (/^\s{0,4}function\s+\w+\s*\(/.test(line)) {
    console.log('fn @L' + (idx + 1), line.trim().slice(0, 34), '| depth before:', depthAt(idx));
  }
});
console.log('total depth:', depthAt(lines.length));