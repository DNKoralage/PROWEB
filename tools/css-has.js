// Does a given selector survive in the parsed stylesheet?
const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2] || 'http://localhost:8098/index.html';
const wanted = process.argv.slice(3);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const info = await page.evaluate((sels) => {
    const sheet = Array.from(document.styleSheets)
      .find((s) => (s.href || '').includes('site.css'));
    if (!sheet) return { error: 'site.css not found' };
    const all = Array.from(sheet.cssRules);
    const selectors = [];
    const walk = (rules) => {
      rules.forEach((r) => {
        if (r.selectorText) selectors.push(r.selectorText);
        if (r.cssRules) walk(Array.from(r.cssRules));
      });
    };
    walk(all);
    const out = { totalTopLevel: all.length, totalSelectors: selectors.length, found: {}, sample: [] };
    sels.forEach((s) => {
      out.found[s] = selectors.filter((x) => x.includes(s)).slice(0, 2);
    });
    out.sample = selectors.slice(0, 5).concat(['...']).concat(selectors.slice(-5));
    return out;
  }, wanted);

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();