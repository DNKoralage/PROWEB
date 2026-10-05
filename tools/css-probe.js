// Ask the browser which CSS rules it actually parsed, and report the failures.
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2] || 'http://localhost:8099/index.html';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const info = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    const out = sheets.map((s) => {
      let rules = null, error = null;
      try { rules = s.cssRules.length; } catch (e) { error = e.message; }
      return {
        href: s.href,
        rules,
        error,
        // the first selectors in the sheet tell us where parsing stopped
        firstSelectors: (() => {
          try { return Array.from(s.cssRules).slice(0, 6).map((r) => r.selectorText || r.cssText.slice(0, 40)); }
          catch (e) { return ['<inaccessible>']; }
        })(),
        lastSelectors: (() => {
          try { return Array.from(s.cssRules).slice(-6).map((r) => r.selectorText || r.cssText.slice(0, 40)); }
          catch (e) { return ['<inaccessible>']; }
        })()
      };
    });
    // Is the nav actually styled?
    const nav = document.querySelector('.dk-nav__inner');
    const list = document.querySelector('.dk-nav__list');
    return {
      sheets: out,
      navDisplay: nav ? getComputedStyle(nav).display : null,
      navPosition: document.querySelector('.dk-nav') ? getComputedStyle(document.querySelector('.dk-nav')).position : null,
      listStyle: list ? getComputedStyle(list).listStyleType : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      drawerOpacity: document.querySelector('.dk-drawer') ? getComputedStyle(document.querySelector('.dk-drawer')).opacity : null
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();