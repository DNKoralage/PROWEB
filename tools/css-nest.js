// Identify the exact selector of any CSSStyleRule that has nested children
// (CSS nesting). Those are the rules swallowing the rest of the sheet.
const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2] || 'http://localhost:8098/index.html';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const info = await page.evaluate(() => {
    const sheet = Array.from(document.styleSheets).find((s) => (s.href || '').includes('site.css'));
    if (!sheet) return { error: 'no sheet' };
    const nested = [];
    const walk = (rules, parents, depth) => {
      if (depth > 3) return;
      Array.from(rules).forEach((r) => {
        const kids = r.cssRules ? Array.from(r.cssRules) : [];
        if (kids.length && r.constructor.name === 'CSSStyleRule') {
          nested.push({
            parents,
            selector: r.selectorText,
            childCount: kids.length,
            firstChildSelector: kids[0].selectorText,
            cssTextHead: r.cssText.slice(0, 200)
          });
        }
        if (kids.length) walk(kids, parents.concat(r.conditionText || r.name || r.selectorText || '?'), depth + 1);
      });
    };
    walk(sheet.cssRules, [], 0);
    return nested;
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();