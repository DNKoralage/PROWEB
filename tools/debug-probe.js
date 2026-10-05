/**
 * Live DOM probe: inspects lightbox wiring + burger visibility in headless Edge.
 *   node tools/debug-probe.js
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

(async () => {
  const server = await serve(8097);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('DOMContentLoaded', () => {
      try {
        if (window.DK_CONTENT && window.DK_CONTENT.settings && window.DK_CONTENT.settings.preloader) {
          window.DK_CONTENT.settings.preloader.duration = 500;
        }
      } catch (e) { /* ignore */ }
    });
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  await page.goto('http://localhost:8097/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('dk-loader'), { timeout: 15000 }).catch(() => console.log('loader stuck'));

  const out = await page.evaluate(() => {
    const r = {};
    const card = document.querySelector('.dk-logo-card');
    r.cardFound = !!card;
    r.cardClass = card ? card.className : null;
    r.cardId = card ? card.dataset.id : null;
    r.appFound = !!document.querySelector('#dk-app');
    r.logosInDoc = (window.DK && window.DK.site && window.DK.site.current)
      ? (window.DK.site.current.collections.logos || []).map((l) => l.id) : 'no DK.site';
    // simulate what openCard does
    try {
      const m = card.className.match(/dk-card--(\w+)/);
      r.kindMatch = m ? m[1] : null;
    } catch (e) { r.kindMatch = 'err ' + e.message; }
    // try clicking with a real trusted event + wait, then check
    return r;
  });
  console.log(JSON.stringify(out, null, 2));

  // click via puppeteer trusted click, then wait and inspect
  await page.evaluate(() => { document.querySelector('#logos').scrollIntoView(); });
  await new Promise((r) => setTimeout(r, 600));
  try {
    await page.click('.dk-logo-card');
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) { console.log('CLICK ERR', e.message); }
  const lb = await page.evaluate(() => ({
    lightbox: !!document.querySelector('.dk-lightbox'),
    close: !!document.querySelector('.dk-lightbox__close'),
    bodyHtml: document.body.innerHTML.slice(-400),
  }));
  console.log(JSON.stringify(lb, null, 2));

  // burger probe: check media query match + computed style
  const burger = await page.evaluate(() => {
    const b = document.querySelector('.dk-nav__burger');
    const mq = window.matchMedia('(max-width: 860px)');
    return {
      found: !!b, display: b ? getComputedStyle(b).display : null,
      mqMatches1440: mq.matches, innerW: window.innerWidth,
      burgerCss: (() => {
        const hits = [];
        for (const sh of document.styleSheets) {
          let rules; try { rules = sh.cssRules; } catch (e) { continue; }
          for (const rl of rules) {
            if (rl.conditionText && rl.conditionText.includes('860')) hits.push('MEDIA ' + rl.conditionText + ' rules=' + rl.cssRules.length);
            if (rl.selectorText && rl.selectorText.includes('dk-nav__burger')) hits.push(rl.selectorText + ' => ' + rl.style.display);
          }
        }
        return hits;
      })(),
    };
  });
  console.log(JSON.stringify(burger, null, 2));

  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
