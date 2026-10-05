/**
 * Find the CSS line where the browser stops parsing.
 * Feeds the real stylesheet into a page and compares the number of CSSOM
 * rules against a synthetic sheet built from successive prefixes.
 *   node tools/css-bisect.js assets/css/site.css
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const file = process.argv[2] || 'assets/css/site.css';
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  // Measure how many top-level rules each prefix yields inside the browser.
  const measure = async (n) => {
    const css = lines.slice(0, n).join('\n');
    return page.evaluate((text) => {
      const style = document.createElement('style');
      style.textContent = text;
      document.head.appendChild(style);
      const n = style.sheet ? style.sheet.cssRules.length : -1;
      style.remove();
      return n;
    }, css);
  };

  await page.setContent('<!DOCTYPE html><html><head></head><body></body></html>');
  const total = await measure(lines.length);
  console.log('whole file parses to', total, 'rules');

  // Find the first line after which the count stops increasing.
  let prev = 0;
  let firstBad = null;
  const step = Math.max(1, Math.floor(lines.length / 220));
  for (let n = 1; n <= lines.length; n += step) {
    const c = await measure(n);
    if (c < prev) { firstBad = n; break; }
    prev = c;
  }

  if (firstBad == null) {
    console.log('no regression found across ' + step + '-line prefixes');
  } else {
    // Narrow in.
    let lo = firstBad - step, hi = firstBad;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const c = await measure(mid);
      if (c < await measure(lo)) hi = mid; else lo = mid;
    }
    console.log('\nparsing degrades when including line', hi + ':');
    for (let i = Math.max(0, lo - 6); i < Math.min(lines.length, hi + 3); i++) {
      console.log((i + 1 === hi + 1 ? '>> ' : '   ') + (i + 1) + ': ' + lines[i].slice(0, 90));
    }
  }
  await browser.close();
})();