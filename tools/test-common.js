// Node harness: exercise common.js outside the browser and validate the ZIP.
global.window = global;
global.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
global.location = { pathname: '/index.html', href: 'http://localhost/index.html' };
global.isSecureContext = false;
global.performance = { now: () => Date.now() };
global.TextEncoder = require('util').TextEncoder;
global.Blob = class { constructor(parts) { this.parts = parts; this.size = parts.reduce((n, p) => n + (p.length || p.byteLength || 0), 0); } };
global.requestAnimationFrame = () => 0;
global.setTimeout = setTimeout;

require('../assets/js/common.js');
const DK = global.DK;
const assert = require('assert');
const fs = require('fs');

// --- escaping / markdown ---
assert.strictEqual(DK.esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
assert.ok(DK.md('# H\n\n**b**') .includes('<h2>H</h2>'));
assert.ok(DK.md('- a\n- b').includes('<li>b</li>'));
assert.strictEqual(DK.slugify('Johnian School Walk!'), 'johnian-school-walk');
assert.strictEqual(DK.bytes(1536000), '1.5 MB');
// base path depends on where the page lives
assert.strictEqual(DK.mediaSrc('uploads/a.png'), '/uploads/a.png');
assert.strictEqual(DK.mediaSrc('/uploads/a.png'), '/uploads/a.png');
assert.strictEqual(DK.mediaSrc('https://x.com/a.png'), 'https://x.com/a.png');
global.location.pathname = '/admin/index.html';
assert.strictEqual(DK.basePath(), '/');
global.location.pathname = '/sub/dir/page.html';
assert.strictEqual(DK.basePath(), '/sub/dir/');
global.location.pathname = '/admin/';
assert.strictEqual(DK.basePath(), '/');
global.location.pathname = '/index.html';

// --- defaults + normalise repair ---
const d = DK.normalise({ hero: { stats: 'not-an-array' } });
assert.ok(Array.isArray(d.hero.stats) && d.hero.stats.length === 3);
assert.ok(Array.isArray(d.collections.graphics));
assert.strictEqual(d.collections.graphics[0].id, 'g1');
// pages get slugs, radio stations unique ids
d.pages.forEach(p => assert.ok(p.slug));
assert.strictEqual(new Set(d.radio.stations.map(s => s.id)).size, 3);
// unknown junk keys survive without crashing
const junk = DK.normalise({ collections: { logos: 'nope' }, radio: { stations: [{ name: 'A', url: 'u' }, { name: 'B', url: 'u' }] } });
assert.ok(Array.isArray(junk.collections.logos));
assert.strictEqual(new Set(junk.radio.stations.map(s => s.id)).size, 2);

// --- zip writer ---
// Our Blob stub keeps parts nested; flatten to real bytes for verification.
const zip = DK.zip([
  { name: 'a.txt', data: 'hello' },
  { name: 'nested/b.json', data: JSON.stringify({ ok: true }) }
]);
assert.ok(zip.parts.length > 0, 'zip has parts');
const flat = Buffer.concat(zip.parts.map((p) => Buffer.from(p)));
fs.writeFileSync(__dirname + '/test.zip', flat);
assert.strictEqual(flat.readUInt32LE(0), 0x04034b50, 'local file header signature');
assert.strictEqual(flat.readUInt32LE(flat.length - 22), 0x06054b50, 'end of central directory signature');
console.log('all assertions passed; zip bytes', flat.length);