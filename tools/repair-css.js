/** One-off repair: close the truncated .dk-about__clients-label rule. */
const fs = require('fs');
const file = 'assets/css/site.css';
let src = fs.readFileSync(file, 'utf8');
const broken = '  text-transform: uppercase;\n\n/* ';
const fixed = '  text-transform: uppercase;\n  color: var(--dk-accent);\n  margin-bottom: 0.5rem;\n}\n.dk-about__clients { color: var(--dk-ink-soft); }\n\n/* ';
if (!src.includes(broken)) {
  console.log('pattern not found — nothing to do');
  process.exit(1);
}
src = src.replace(broken, fixed);
fs.writeFileSync(file, src, 'utf8');
console.log('repaired .dk-about__clients-label');