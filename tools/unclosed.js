// Report unclosed brackets with a stack, tracking line numbers.
// Strings, template literals, comments and regex literals are skipped.
const fs = require('fs');
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');

const stack = [];
let line = 1, i = 0;
let inStr = null, inTpl = false, prev = '';

function maybeRegexAllowed() {
  return '=(,:[!&|?{};+-*%<>^~'.includes(prev);
}

while (i < src.length) {
  const c = src[i], x = src[i + 1];

  if (c === '\n') { line++; i++; prev = '\n'; continue; }

  if (inStr) {
    if (c === '\\') { i += 2; continue; }
    if (c === inStr) inStr = null;
    i++; continue;
  }
  if (inTpl) {
    if (c === '\\') { i += 2; continue; }
    if (c === '`') inTpl = false;
    i++; continue;
  }

  if (c === '/' && x === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
  if (c === '/' && x === '*') {
    i += 2;
    while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
    i += 2; continue;
  }
  if (c === '/' && maybeRegexAllowed()) {
    i++;
    let inClass = false;
    while (i < src.length) {
      const d = src[i];
      if (d === '\\') { i += 2; continue; }
      if (d === '[') inClass = true;
      else if (d === ']') inClass = false;
      else if (d === '/' && !inClass) break;
      else if (d === '\n') { line++; break; }
      i++;
    }
    i++; prev = 'x'; continue;
  }

  if (c === '"' || c === "'") { inStr = c; i++; prev = 'x'; continue; }
  if (c === '`') { inTpl = true; i++; prev = 'x'; continue; }

  if (c === '{' || c === '(' || c === '[') {
    // capture a short label from the text just before the bracket
    const start = Math.max(0, i - 70);
    stack.push({ ch: c, line, label: src.slice(start, i).replace(/\s+/g, ' ').trim() });
  } else if (c === '}' || c === ')' || c === ']') {
    const want = { '}': '{', ')': '(', ']': '[' }[c];
    const top = stack[stack.length - 1];
    if (!top) {
      console.log(`UNMATCHED CLOSE '${c}' at line ${line}`);
    } else if (top.ch !== want) {
      console.log(`MISMATCH: '${c}' at line ${line} closes '${top.ch}' opened at line ${top.line}`);
      stack.pop();
    } else {
      stack.pop();
    }
  }

  if (!/\s/.test(c)) prev = c;
  i++;
}

if (stack.length) {
  console.log('UNCLOSED (innermost last):');
  stack.forEach((s) => console.log(`  '${s.ch}' opened at line ${s.line}  <- ...${s.label}`));
} else {
  console.log('all brackets balanced');
}