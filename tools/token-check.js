/**
 * Token parity check: the backend constant must equal the frontend gate().
 *   node tools/token-check.js
 */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'assets/js/admin.js'), 'utf8');
const upload = fs.readFileSync(path.join(ROOT, 'api/upload.php'), 'utf8');

const passM = admin.match(/var PASSCODE = '([^']+)'/);
const phpM = upload.match(/define\('DK_UPLOAD_TOKEN', '([0-9a-f]{8})'\)/);
if (!passM) { console.error('FAIL: PASSCODE not found in admin.js'); process.exit(1); }
if (!phpM) { console.error('FAIL: DK_UPLOAD_TOKEN not found in upload.php'); process.exit(1); }

const expected = fnv('dk|' + passM[1] + '|studio');
console.log('PASSCODE :', passM[1]);
console.log('JS gate  :', expected);
console.log('PHP token:', phpM[1]);
if (expected !== phpM[1]) {
  console.error('FAIL: token mismatch — uploads will 403. Update DK_UPLOAD_TOKEN.');
  process.exit(1);
}

// Every XHR in admin.js must send the gate header.
const sends = (admin.match(/X-DK-Token/g) || []).length;
console.log('X-DK-Token send sites:', sends);
if (sends < 1) { console.error('FAIL: no X-DK-Token header sent'); process.exit(1); }
console.log('token parity: OK');
