const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('404'); return; }
        res.writeHead(200); res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}
(async () => {
  const server = await serve(8099);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument(() => {
    const OVERRIDE = 900;
    const apply = () => {
      try {
        if (window.DK_CONTENT && window.DK_CONTENT.settings && window.DK_CONTENT.settings.preloader) {
          window.DK_CONTENT.settings.preloader.duration = OVERRIDE;
        }
      } catch (e) {}
      if (window.DK && window.DK.loader && typeof window.DK.loader.run === 'function' &&
          !window.DK.loader.__dkShortened) {
        window.DK.loader.__dkShortened = true;
        const orig = window.DK.loader.run.bind(window.DK.loader);
        window.DK.loader.run = function (cfg) {
          try {
            cfg = cfg || {};
            cfg.preloader = Object.assign({}, cfg.preloader, { duration: OVERRIDE, skipAfterSeen: false });
            cfg.skipIntro = true;
          } catch (e) {}
          return orig(cfg);
        };
      }
      try {
        const raw = localStorage.getItem('dk:content');
        if (raw) {
          const doc = JSON.parse(raw);
          if (doc.settings && doc.settings.preloader) doc.settings.preloader.duration = OVERRIDE;
          localStorage.setItem('dk:content', JSON.stringify(doc));
        }
      } catch (e) {}
      setTimeout(apply, 300);
    };
    apply();
  });
  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('dk-loader'), { timeout: 15000 }).catch(()=>{});
  const diag = await page.evaluate(() => {
    const card = document.querySelector('.dk-logo-card');
    let openErr = null;
    let after = null;
    try {
      if (card) card.click();
      after = !!document.querySelector('.dk-lightbox');
    } catch (e) { openErr = e.message; }
    const burger = document.querySelector('.dk-nav__burger');
    const mob = burger ? getComputedStyle(burger).display : 'missing';
    // check media query match
    const mq = matchMedia('(max-width: 860px)').matches;
    // find burger rule
    let burgerRules = [];
    for (const sh of document.styleSheets) {
      try {
        for (const r of sh.cssRules) {
          if (r.conditionText && r.conditionText.includes('860')) {
            for (const inner of r.cssRules) burgerRules.push(inner.cssText.slice(0,120));
          }
          if (r.selectorText && r.selectorText.includes('dk-nav__burger')) burgerRules.push('top:'+r.cssText.slice(0,120));
        }
      } catch(e){}
    }
    return { cardHtml: card ? card.outerHTML.slice(0,300) : null, cardClass: card?card.className:null, cardId: card?card.dataset.id:null, after, openErr, burgerDisplay: mob, mq, burgerRules, viewport: document.querySelector('meta[name=viewport]')?.outerHTML||null };
  });
  console.log(JSON.stringify(diag, null, 2));
  console.log('ERRORS:', errs);
  await browser.close();
  server.close();
})();
