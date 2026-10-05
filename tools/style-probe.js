// Probe computed styles for the Radio, Contact and Footer sections and
// screenshot them, so "unstyled" reports can be verified against reality.
//   node tools/style-probe.js
const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};

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

function shortenLoader(page) {
  return page.evaluateOnNewDocument(() => {
    const apply = () => {
      try {
        if (window.DK_CONTENT && window.DK_CONTENT.settings && window.DK_CONTENT.settings.preloader) {
          window.DK_CONTENT.settings.preloader.duration = 700;
        }
      } catch (e) { /* ignore */ }
      if (window.DK && window.DK.loader && typeof window.DK.loader.run === 'function' &&
          !window.DK.loader.__dkShortened) {
        window.DK.loader.__dkShortened = true;
        const orig = window.DK.loader.run.bind(window.DK.loader);
        window.DK.loader.run = function (cfg) {
          cfg = cfg || {};
          cfg.preloader = Object.assign({}, cfg.preloader, { duration: 700 });
          return orig(cfg);
        };
        return true;
      }
      return false;
    };
    if (document.documentElement) apply();
    document.addEventListener('DOMContentLoaded', apply);
    const t = setInterval(() => { if (apply()) clearInterval(t); }, 10);
    setTimeout(() => clearInterval(t), 8000);
  });
}

const pick = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    display: cs.display, listStyle: cs.listStyleType, padding: cs.padding,
    margin: cs.margin, color: cs.color, background: cs.backgroundColor,
    border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
    borderRadius: cs.borderTopLeftRadius, font: cs.fontSize + '/' + cs.lineHeight,
    w: Math.round(r.width), h: Math.round(r.height)
  };
};

(async () => {
  const server = await serve(8099);
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await shortenLoader(page);
  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2600));
  // Reveal everything so screenshots are not blank.
  await page.evaluate(() => {
    document.querySelectorAll('[data-reveal]').forEach((n) => n.classList.add('is-in'));
    document.querySelectorAll('*').forEach((n) => { const s = getComputedStyle(n); if (s.opacity === '0' && n.matches('.dk-section__head, .dk-card, .dk-radio__inner, .dk-contact__inner')) n.style.opacity = '1'; });
  });
  await new Promise((r) => setTimeout(r, 400));

  const data = await page.evaluate((pickSrc) => {
    const pick = eval(pickSrc); // eslint-disable-line no-eval
    return {
      radioList: pick('.dk-radio__list'),
      radioItem: pick('.dk-radio__list li'),
      radioBtn: pick('.dk-radio__station-btn'),
      contactLinks: pick('.dk-contact__links'),
      footerSocial: pick('.dk-footer__social'),
      footerSocialItem: pick('.dk-footer__social li'),
      footerInner: pick('.dk-footer__inner'),
      field: pick('.dk-field input'),
      textarea: pick('.dk-field textarea'),
      form: pick('.dk-form'),
      sections: Array.from(document.querySelectorAll('main > section')).map((s) => s.id || s.className)
    };
  }, pick.toString());

  console.log(JSON.stringify(data, null, 2));
  if (errors.length) console.log('PAGE ERRORS:', errors);

  for (const [name, sel] of [['radio', '#radio'], ['contact', '#contact'], ['footer', 'footer']]) {
    const el = await page.$(sel);
    if (el) { await el.scrollIntoView(); await new Promise((r) => setTimeout(r, 300)); await el.screenshot({ path: path.join(ROOT, 'screenshots', 'probe-' + name + '.png') }); }
  }

  await browser.close();
  server.close();
})();