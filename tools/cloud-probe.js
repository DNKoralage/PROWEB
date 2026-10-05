/**
 * Diagnostic: how long does the Firebase bridge take on this machine?
 *   node tools/cloud-probe.js
 * Binds port 8099 like the other browser tools — run it alone.
 */
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

(async () => {
  const server = await serve(8099);
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const t0 = Date.now();
  await page.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
  console.log('goto (domcontentloaded):', Date.now() - t0, 'ms');

  const status = await page.evaluate(() => (window.DK && DK.cloud) ? DK.cloud.status : 'MISSING');
  console.log('DK.cloud.status right after load:', status);

  const fetchMs = await page.evaluate(() => {
    if (!window.DK || !DK.cloud) return -1;
    const t = Date.now();
    return DK.cloud.fetch().then((doc) => ({ ms: Date.now() - t, got: !!doc }));
  });
  console.log('DK.cloud.fetch():', JSON.stringify(fetchMs));

  const loadMs = await page.evaluate(() => {
    const t = Date.now();
    return DK.loadContent().then((doc) => ({ ms: Date.now() - t, ok: !!(doc && doc.site) }));
  });
  console.log('DK.loadContent():', JSON.stringify(loadMs));

  const readyMs = await page.evaluate(() => {
    if (!window.DK || !DK.cloud) return -1;
    const t = Date.now();
    return Promise.race([
      DK.cloud.ready.then((db) => ({ ms: Date.now() - t, db: !!db })),
      new Promise((r) => setTimeout(() => r({ ms: Date.now() - t, db: 'TIMEOUT' }), 9000))
    ]);
  });
  console.log('DK.cloud.ready:', JSON.stringify(readyMs));

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
