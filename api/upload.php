/* ==========================================================================
   DK — api/upload.php
   Media upload endpoint for the studio dashboard (admin.html).

   Design constraints:
   - Static site, no accounts: authentication is the dashboard gate hash sent
     as X-DK-Token. This stops naive scripted posts, it is NOT real auth —
     never rely on it to protect anything you would not publish anyway.
   - Files land in ../uploads/ which carries an .htaccess that refuses to
     execute code or list the directory.
   - Whitelist by extension AND detected MIME type; random file names; hard
     size cap. Anything else is a 4xx JSON error.

   Returns: { "ok": true,  "path": "uploads/ab12cd34.jpg" }
            { "ok": false, "error": "reason" }
   ========================================================================== */

declare(strict_types=1);

// Same FNV-1a gate as assets/js/admin.js: fnv('dk|' + PASSCODE + '|studio').
define('DK_UPLOAD_TOKEN', '017cfc8b');
define('DK_MAX_BYTES', 50 * 1024 * 1024); // CV PDFs are ~3 MB

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function dk_fail(int $code, string $msg): void {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') dk_fail(405, 'POST only.');

$token = $_SERVER['HTTP_X_DK_TOKEN'] ?? '';
if (!hash_equals(DK_UPLOAD_TOKEN, $token)) dk_fail(403, 'Upload token rejected.');

define('DK_MAX_BATCH', 20);

// Extension + MIME whitelist.
$allowed = [
  'jpg' => ['image/jpeg'],
  'jpeg' => ['image/jpeg'],
  'png' => ['image/png'],
  'gif' => ['image/gif'],
  'webp' => ['image/webp'],
  'svg' => ['image/svg+xml', 'text/plain', 'text/xml', 'application/xml'],
  'pdf' => ['application/pdf'],
];

$dir = dirname(__DIR__) . '/uploads';
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
  dk_fail(500, 'uploads/ folder is missing.');
}
if (!is_writable($dir)) dk_fail(500, 'uploads/ is not writable.');
 // max files per batch request

/** Validate + store one upload entry; returns {path} or {error}. */
function dk_store_one($f, $original, $allowed, $dir) {
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    return array('error' => 'Upload failed (PHP error ' . (string)($f['error'] ?? -1) . ').');
  }
  if ((int)$f['size'] <= 0) return array('error' => 'Empty file.');
  if ((int)$f['size'] > DK_MAX_BYTES) return array('error' => 'File is larger than 50 MB.');
  $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
  if (!isset($allowed[$ext])) return array('error' => 'File type not allowed.');
  $mime = 'application/octet-stream';
  if (function_exists('finfo_open')) {
    $fi = finfo_open(FILEINFO_MIME_TYPE);
    if ($fi) {
      $det = finfo_file($fi, (string)$f['tmp_name']);
      if (is_string($det) && $det !== '') $mime = $det;
      finfo_close($fi);
    }
  }
  if (!in_array($mime, $allowed[$ext], true)) {
    return array('error' => 'Content type mismatch.');
  }
  $stem = strtolower(pathinfo($original, PATHINFO_FILENAME));
  $stem = preg_replace('/[^a-z0-9]+/', '-', $stem);
  $stem = trim((string)$stem, '-');
  if ($stem === '' || strlen($stem) > 40) $stem = 'media';
  $name = $stem . '-' . bin2hex(random_bytes(5)) . '.' . $ext;
  $dest = $dir . '/' . $name;
  if (!move_uploaded_file((string)$f['tmp_name'], $dest)) {
    return array('error' => 'Could not move file.');
  }
  @chmod($dest, 0644);
  return array('path' => 'uploads/' . $name);
}

// ---- batch mode: files[] ----
if (isset($_FILES['files']) && is_array($_FILES['files'])) {
  $b = $_FILES['files'];
  $names = is_array($b['name'] ?? null) ? $b['name'] : array();
  $n = count($names);
  if ($n < 1) dk_fail(400, 'No files received.');
  if ($n > DK_MAX_BATCH) dk_fail(400, 'Too many files.');
  $ok = array(); $bad = array();
  for ($k = 0; $k < $n; $k++) {
    $one = array(
      'name' => $b['name'][$k],
      'tmp_name' => $b['tmp_name'][$k],
      'error' => $b['error'][$k],
      'size' => $b['size'][$k]
    );
    $r = dk_store_one($one, (string)$one['name'], $allowed, $dir);
    if (isset($r['path'])) $ok[] = array('path' => $r['path'], 'name' => (string)$one['name']);
    else $bad[] = array('name' => (string)$one['name'], 'error' => $r['error']);
  }
  echo json_encode(array('ok' => true, 'files' => $ok, 'errors' => $bad));
  exit;
}

// ---- single-file mode (back-compat) ----
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) dk_fail(400, 'No file received.');
$f = $_FILES['file'];
$r = dk_store_one($f, (string)($f['name'] ?? ''), $allowed, $dir);
if (isset($r['path'])) echo json_encode(array('ok' => true, 'path' => $r['path']));
else dk_fail(400, $r['error']);

