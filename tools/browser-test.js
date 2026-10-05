/**
 * End-to-end browser check for the public site.
 * Loads the real page in headless Chrome, verifies the DOM actually rendered,
 * captures console errors, and writes screenshots.
 *   node tools/browser-test.js
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

/** Tiny static server so the page runs on a real http origin. */
function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + url); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

/** Shorten the intro so the suite does not wait the full 10 seconds. */
function shortenLoader(page) {
  return page.evaluateOnNewDocument(() => {
    const OVERRIDE = 900;
    const apply = () => {
      try {
        if (window.DK_CONTENT && window.DK_CONTENT.settings && window.DK_CONTENT.settings.preloader) {
          window.DK_CONTENT.settings.preloader.duration = OVERRIDE;
        }
      } catch (e) { /* ignore */ }
      if (window.DK && window.DK.loader && typeof window.DK.loader.run === 'function' &&
          !window.DK.loader.__dkShortened) {
        window.DK.loader.__dkShortened = true;
        const orig = window.DK.loader.run.bind(window.DK.loader);
        window.DK.loader.run = function (cfg) {
          try {
            cfg = cfg || {};
            cfg.preloader = Object.assign({}, cfg.preloader, { duration: OVERRIDE });
          } catch (e2) { /* ignore */ }
          return orig(cfg);
        };
        return true;
      }
      return false;
    };
    if (document.documentElement) apply();
    document.addEventListener('DOMContentLoaded', apply);
    const timer = setInterval(() => { if (apply()) clearInterval(timer); }, 10);
    setTimeout(() => clearInterval(timer), 8000);
  });
}
/* ------------------------------------------------------- filters + modals */
async function interactions(page, pass, fail, wait) {
  // Category filter isolates a single project.
  await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll('.dk-filter'))
      .find((b) => b.dataset.scope === 'graphics' && b.dataset.filter !== '*');
    if (f) f.click();
  });
  await wait(350);
  const visible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#work [data-category]'))
      .filter((c) => !c.classList.contains('is-hidden')).length);
  if (visible === 1) pass('graphics filter isolates 1 project');
  else fail('filter left ' + visible + ' visible (expected 1)');

  await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll('.dk-filter'))
      .find((b) => b.dataset.filter === '*' && b.dataset.scope === 'graphics');
    if (f) f.click();
  });
  await wait(250);

  // Lightbox opens and closes (wait a beat: content renders after the loader).
  await page.evaluate(() => {
    const el = document.querySelector('#logos, #work');
    if (el) el.scrollIntoView({ block: 'start' });
  });
  await wait(900);
  // Trusted click via the input pipeline: synthetic evaluate-clicks can be
  // swallowed while a reveal/scroll animation is still settling.
  await page.click('.dk-logo-card');
  await wait(600);
  const lb = await page.evaluate(() => {
    const node = document.querySelector('.dk-lightbox');
    return {
      opened: !!node,
      hasClose: !!(node && node.querySelector('.dk-lightbox__close')),
      reason: node ? '' : 'no .dk-lightbox after click; cards=' +
        document.querySelectorAll('.dk-logo-card').length
    };
  });
  if (lb.opened) pass('lightbox opens from a logo card');
  else fail('lightbox did not open' + (lb.reason ? ' (' + lb.reason + ')' : ''));
  if (lb.hasClose) pass('lightbox close button present');
  else fail('lightbox close button missing');

  await page.keyboard.press('Escape');
  await wait(300);
  const closed = await page.evaluate(() => !document.querySelector('.dk-lightbox'));
  if (closed) pass('lightbox closes on Escape');
  else fail('lightbox stayed open after Escape');

  // Sound toggle flips state.
  const sound = await page.evaluate(() => {
    const b = document.querySelector('.dk-nav__sound');
    if (!b) return null;
    const before = b.getAttribute('aria-pressed');
    b.click();
    return { before, after: b.getAttribute('aria-pressed') };
  });
  if (sound && sound.before !== sound.after) pass('sound toggle flips aria-pressed');
  else fail('sound toggle did not flip state');
}

/* ------------------------------------------------------------ screenshots */
async function shots(page, pass) {
  const dir = path.join(__dirname, 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const snap = async (name, sel) => {
    if (sel) {
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) el.scrollIntoView({ block: 'start' });
      }, sel);
      await new Promise((r) => setTimeout(r, 900));
    }
    await page.screenshot({ path: path.join(dir, name) });
    pass('screenshot: ' + name);
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  await snap('desktop-hero.png');
  await snap('desktop-work.png', '#work');
  await snap('desktop-radio.png', '#radio');
}

/* ------------------------------------------------------------ mobile pass */
async function mobile(browser, pass, fail) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shortenLoader(page);
  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle2' });
  // Real readiness: content rendered and the loader finished (simple loader
  // absence is true before the loader even starts).
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('dk-ready') &&
    !document.getElementById('dk-loader'), { timeout: 20000 }).catch(() => {});

  const info = await page.evaluate(() => {
    const burger = document.querySelector('.dk-nav__burger');
    return {
      burger: burger ? getComputedStyle(burger).display !== 'none' : false,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      scrollW: document.documentElement.scrollWidth,
      winW: window.innerWidth
    };
  });
  if (info.burger) pass('mobile: burger menu visible');
  else fail('mobile: burger hidden');
  if (info.overflow <= 2) pass('mobile: no horizontal overflow (' + info.scrollW + ' <= ' + info.winW + ')');
  else fail('mobile: horizontal overflow ' + info.scrollW + ' > ' + info.winW);

  const dir = path.join(__dirname, 'shots');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'mobile-hero.png') });
  pass('screenshot: mobile-hero.png');
  await page.close();
}

(async () => {
  const server = await serve(8099);
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });

  const results = [];
  const fail = (m) => results.push('FAIL  ' + m);
  const pass = (m) => results.push('pass  ' + m);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => {
      const u = r.url();
      if (u.startsWith('http://localhost')) {
        errors.push('requestfailed: ' + u + ' ' + (r.failure() || {}).errorText);
      }
    });

    await shortenLoader(page);
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle2', timeout: 45000 });

    // Wait for REAL readiness: dk-ready is only added after content rendered
    // and the loader finished (loader absence alone is true before it starts).
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('dk-ready') &&
      !document.getElementById('dk-loader'), { timeout: 20000 })
      .then(() => pass('loader completed and removed'))
      .catch(() => fail('loader did not complete within 20s'));

    const c = await page.evaluate(() => ({
      layers: document.querySelectorAll('.dk-hero__backdrop .dk-layer').length,
      sections: Array.from(document.querySelectorAll('main > section')).map((s) => s.id),
      navLinks: document.querySelectorAll('.dk-nav__link').length,
      cards: document.querySelectorAll('.dk-card').length,
      logos: document.querySelectorAll('.dk-logo-card').length,
      stations: document.querySelectorAll('.dk-radio__station-btn').length,
      radioCanvas: !!document.querySelector('.dk-radio__canvas'),
      footer: !!document.querySelector('.dk-footer'),
      contact: !!document.querySelector('#contact'),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--dk-accent').trim()
    }));

    if (c.layers >= 3) pass('hero parallax layers: ' + c.layers);
    else fail('expected >=3 hero layers, got ' + c.layers);
    if (c.sections.length >= 7) pass('sections: ' + c.sections.join(', '));
    else fail('too few sections: ' + c.sections.join(', '));
    if (c.navLinks >= 4) pass('nav links: ' + c.navLinks);
    else fail('nav links: ' + c.navLinks);
    if (c.cards >= 5) pass('cards rendered: ' + c.cards);
    else fail('cards rendered: ' + c.cards);
    if (c.logos >= 4) pass('logo cards: ' + c.logos);
    else fail('logo cards: ' + c.logos);
    if (c.stations === 3) pass('radio stations listed: 3');
    else fail('radio stations: ' + c.stations);
    if (c.radioCanvas) pass('radio canvas present');
    else fail('radio canvas missing');
    if (c.footer && c.contact) pass('footer + contact rendered');
    else fail('footer/contact missing');
    if (c.accent) pass('theme accent applied: ' + c.accent);
    else fail('accent var not set');

    const imgs = await page.evaluate(() => {
      const l = Array.from(document.querySelectorAll('img'));
      return { total: l.length, broken: l.filter((i) => i.complete && i.naturalWidth === 0).length };
    });
    if (imgs.total > 0 && imgs.broken === 0) pass('all ' + imgs.total + ' images loaded');
    else fail('images: ' + imgs.broken + '/' + imgs.total + ' broken');

    await interactions(page, pass, fail, wait);
    await shots(page, pass);
    await mobile(browser, pass, fail);

    const real = errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e));
    if (!real.length) pass('no console errors');
    else real.forEach((e) => fail('console: ' + e));
} catch (err) {
    fail('EXCEPTION: ' + err.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + results.join('\n'));
  const failures = results.filter((r) => r.startsWith('FAIL'));
  console.log('\n' + (results.length - failures.length) + ' passed, ' + failures.length + ' failed');
  process.exit(failures.length ? 1 : 0);
})();
