/**
 * End-to-end test for the standalone admin CMS (admin.html).
 * Covers: login gate (wrong + right passcode) -> shell -> panel navigation ->
 * list CRUD -> Publish to localStorage -> public site sees the draft ->
 * Reset -> Lock.
 *   node tools/admin-test.js
 * NOTE: binds port 8099 like the other browser tools — run it alone.
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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
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

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (extra ? '  (' + extra + ')' : ''));
  if (!ok) process.exitCode = 1;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await serve(8099);
  fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', async (d) => { await d.accept(); }); // Reset asks confirm()

  /* 1. Login screen ------------------------------------------------- */
  await page.goto('http://localhost:8099/admin.html', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('dk:content'));
  await page.reload({ waitUntil: 'networkidle2' });
  check('login card renders', (await page.$('#adm-login-form')) !== null);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'admin-login.png') });

  /* 2. Wrong passcode ------------------------------------------------ */
  await page.type('#adm-pass', 'nope');
  await page.click('#adm-login-form button[type=submit]');
  await wait(300);
  const errMsg = await page.$eval('#adm-login-error', (n) => n.textContent);
  check('wrong passcode rejected', /wrong/i.test(errMsg), errMsg);

  /* 3. Correct passcode ---------------------------------------------- */
  await page.$eval('#adm-pass', (n) => { n.value = ''; });
  await page.type('#adm-pass', 'dk-admin');
  await page.click('#adm-login-form button[type=submit]');
  await page.waitForSelector('#adm-shell', { timeout: 5000 });
  check('shell renders after login', true);
  const navCount = (await page.$$('.adm-nav__btn')).length;
  check('sidebar lists every panel', navCount === 16, navCount + ' buttons');
  check('session flag set', await page.evaluate(() => sessionStorage.getItem('dk:admin-session') !== null));

  /* 4. Overview ------------------------------------------------------ */
  const tiles = (await page.$$('.adm-stats .dk-dashboard__tile')).length;
  check('overview shows 8 stat tiles', tiles === 8, String(tiles));
  const status1 = await page.$eval('#adm-top-status', (n) => n.textContent);
  check('status starts at shipped content', /shipped/i.test(status1), status1);

  /* 5. Navigate to Logos --------------------------------------------- */
  await page.click('.adm-nav__btn[data-panel="logos"]');
  await wait(200);
  const title = await page.$eval('#adm-top-title', (n) => n.textContent);
  check('logos panel opens', /logos/i.test(title), title);
  const before = await page.evaluate(() => DK.admin.doc.collections.logos.length);
  const itemsBefore = (await page.$$('.adm-item')).length;
  check('logo items rendered', itemsBefore === before, itemsBefore + '/' + before);

  /* 6. CRUD: add a logo ---------------------------------------------- */
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.adm-card__head .adm-btn'))
      .find((x) => /add logo/i.test(x.textContent));
    b.click();
  });
  await wait(250);
  const after = await page.evaluate(() => DK.admin.doc.collections.logos.length);
  check('add creates a logo', after === before + 1, before + ' -> ' + after);
  check('edit marks the doc dirty', await page.evaluate(() => DK.admin.dirty));
  const status2 = await page.$eval('#adm-top-status', (n) => n.textContent);
  check('status shows unpublished changes', /unpublished/i.test(status2), status2);

  /* 7. Field edit writes into the doc --------------------------------- */
  await page.evaluate(() => {
    const input = document.querySelector('.adm-item.is-open .adm-field input');
    input.value = 'QA Test Mark';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(150);
  const edited = await page.evaluate(() => DK.admin.doc.collections.logos.slice(-1)[0].title);
  check('field edit writes to doc', edited === 'QA Test Mark', edited);

  /* 8. Delete the entry again ----------------------------------------- */
  await page.evaluate(() => {
    document.querySelector('.adm-item.is-open [title="Delete"]').click();
  });
  await wait(250);
  const undone = await page.evaluate(() => DK.admin.doc.collections.logos.length);
  check('delete restores the count', undone === before, String(undone));

  /* 9. Publish -------------------------------------------------------- */
  await page.click('#adm-publish');
  await wait(350);
  const draft = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('dk:content')); } catch (e) { return null; }
  });
  check('publish writes a draft', !!(draft && draft.__updatedAt));
  check('DK.hasDraft() reports true', await page.evaluate(() => DK.hasDraft()));
  check('cloud bridge exposed', await page.evaluate(() =>
    typeof DK !== 'undefined' && !!(DK.cloud && typeof DK.cloud.fetch === 'function' && typeof DK.cloud.save === 'function')));
  const status3 = await page.$eval('#adm-top-status', (n) => n.textContent);
  check('status shows draft published', /draft published/i.test(status3), status3);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'admin-shell.png') });

  /* 10. Public site picks the draft up -------------------------------- */
  const pub = await browser.newPage();
  await pub.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle2' });
  const pubDraft = await pub.evaluate(() => typeof DK !== 'undefined' && !!(DK.hasDraft && DK.hasDraft()));
  check('public site sees the draft', pubDraft === true);
  check('public page loads the cloud bridge', await pub.evaluate(() =>
    typeof DK !== 'undefined' && !!(DK.cloud && typeof DK.cloud.fetch === 'function')));
  await pub.close();

  /* 11. Reset (confirm auto-accepted) ---------------------------------- */
  await page.click('.adm-top__actions .adm-btn--danger');
  await page.waitForFunction(() => localStorage.getItem('dk:content') === null, { timeout: 5000 });
  check('reset clears the draft', true);
  await wait(400);
  check('shell survives the reset', (await page.$('#adm-shell')) !== null);

  /* 12. Lock ----------------------------------------------------------- */
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.adm-side__foot .adm-btn'))
      .find((x) => /lock/i.test(x.textContent));
    b.click();
  });
  await wait(300);
  check('lock returns to the login gate', (await page.$('#adm-login-form')) !== null);
  check('session flag cleared', await page.evaluate(() => sessionStorage.getItem('dk:admin-session') === null));

  /* 13. Errors --------------------------------------------------------- */
  check('no page errors', errors.length === 0, errors.join(' | '));

  const failed = results.filter((r) => !r.ok).length;
  console.log('\nadmin: ' + (results.length - failed) + '/' + results.length + ' checks passed');
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

