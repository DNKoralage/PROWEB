// Walk the CSSOM tree and report the nesting path for rules prefixed with '&'.
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
    const out = [];
    const walk = (rules, path, depth) => {
      if (depth > 4) return;
      Array.from(rules).forEach((r, i) => {
        const isGroup = !!r.cssRules;
        const sel = r.selectorText || (r.conditionText || r.name || r.cssText.slice(0, 30));
        if (isGroup) {
          // Record containers that hold many rules — likely a stray @media.
          out.push({
            depth,
            index: i,
            type: r.constructor.name,
            cond: r.conditionText || r.name || '',
            childCount: r.cssRules.length,
            firstChild: (r.cssRules[0] && r.cssRules[0].selectorText) || ''
          });
          walk(r.cssRules, path + '/' + (r.conditionText || r.name || '?'), depth + 1);
        }
      });
    };
    walk(sheet.cssRules, '', 0);
    // top-level types for reference
    return {
      containers: out.filter((c) => c.depth <= 1),
      topLevelTypes: Array.from(sheet.cssRules).map((r) => r.constructor.name)
        .reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {})
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();