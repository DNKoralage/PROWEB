/**
 * Rebuild proweb-deploy.zip — the Hostinger upload bundle.
 *   node tools/build-deploy-zip.js
 * Keeps the same layout the site has shipped with (root html, assets/, data/,
 * uploads/, firestore.rules) plus api/ so image uploads work on PHP hosts.
 * The zip is gitignored; this just keeps the local artifact in step with the
 * repository.
 *
 * Written by hand (store + deflate) rather than via Compress-Archive because
 * PowerShell's archiver emits backslash entry names, which the ZIP spec does
 * not allow — some unzip tools choke on them.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ENTRIES = [
  'index.html',
  'admin.html',
  'assets/css/admin.css',
  'assets/css/site.css',
  'assets/css/site.css.fixed',
  'assets/js/admin.js',
  'assets/js/common.js',
  'assets/js/cursor.js',
  'assets/js/firebase-bridge.js',
  'assets/js/foliage.js',
  'assets/js/loader.js',
  'assets/js/parallax.js',
  'assets/js/radio.js',
  'assets/js/site.js',
  'assets/js/sound.js',
  'data/content.js',
  'data/content.json',
  'uploads/.htaccess',
  'uploads/favicon.svg',
  'uploads/og.svg',
  'uploads/Devnith_Koralage_Professional_CV.pdf',
  'api/upload.php',
  'api/db.php',
  'api/health.php',
  'api/config.sample.php',
  'firestore.rules'
];

const missing = ENTRIES.filter((e) => !fs.existsSync(path.join(ROOT, e)));
if (missing.length) {
  console.error('missing from the repo:', missing.join(', '));
  process.exit(1);
}

/** CRC-32 (ZIP checksum). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const chunks = [];
const central = [];
let offset = 0;

for (const rel of ENTRIES) {
  const data = fs.readFileSync(path.join(ROOT, rel));
  const name = rel.split(path.sep).join('/');       // ZIP requires forward slashes
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const payload = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10);            // mod time
  local.writeUInt16LE(0x5856, 12);       // mod date (2026-01-01)
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const hdr = Buffer.concat([local, nameBuf]);
  chunks.push(hdr, payload);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);               // made by
  cd.writeUInt16LE(20, 6);               // needed
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(method, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0x5856, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(payload.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);               // extra
  cd.writeUInt16LE(0, 32);               // comment
  cd.writeUInt16LE(0, 34);               // disk
  cd.writeUInt16LE(0, 36);               // internal attrs
  cd.writeUInt32LE(0, 38);               // external attrs
  cd.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([cd, nameBuf]));

  offset += hdr.length + payload.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(ENTRIES.length, 8);
eocd.writeUInt16LE(ENTRIES.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const out = path.join(ROOT, 'proweb-deploy.zip');
fs.rmSync(out, { force: true });
fs.writeFileSync(out, Buffer.concat([...chunks, centralBuf, eocd]));

console.log('proweb-deploy.zip rebuilt:', fs.statSync(out).size, 'bytes,', ENTRIES.length, 'files');

