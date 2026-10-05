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
define('DK_MAX_BYTES', 8 * 1024 * 1024); // CV PDFs are ~3 MB

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

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) dk_fail(400, 'No file received.');
$f = $_FILES['file'];
if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
  dk_fail(400, 'Upload failed (PHP error ' . (string)($f['error'] ?? -1) . ').');
}
if ((int)$f['size'] <= 0) dk_fail(400, 'Empty file.');
if ((int)$f['size'] > DK_MAX_BYTES) dk_fail(413, 'File is larger than 8 MB.');

// Extension + MIME whitelist.
$allowed = [
  'jpg'  => ['image/jpeg'],
  'jpeg' => ['image/jpeg'],
  'png'  => ['image/png'],
  'gif'  => ['image/gif'],
  'webp' => ['image/webp'],
  'svg'  => ['image/svg+xml', 'text/plain', 'text/xml', 'application/xml'],
  'pdf'  => ['application/pdf'],
  'doc'  => ['application/msword',
             'application/vnd.ms-office',
             'application/octet-stream'],
  'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/octet-stream'],
];

$original = (string)($f['name'] ?? '');
$ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
if (!isset($allowed[$ext])) dk_fail(415, 'File type .' . ($ext ?: '?') . ' is not allowed.');

// Detect the real MIME from the bytes, never from what the client claims.
$mime = 'application/octet-stream';
if (function_exists('finfo_open')) {
  $fi = finfo_open(FILEINFO_MIME_TYPE);
  if ($fi) {
    $detected = finfo_file($fi, (string)$f['tmp_name']);
    if (is_string($detected) && $detected !== '') $mime = $detected;
    finfo_close($fi);
  }
}
if (!in_array($mime, $allowed[$ext], true)) {
  dk_fail(415, 'Content type ' . $mime . ' does not match .' . $ext . '.');
}

$dir = dirname(__DIR__) . '/uploads';
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
  dk_fail(500, 'uploads/ folder is missing and could not be created.');
}
if (!is_writable($dir)) dk_fail(500, 'uploads/ is not writable by PHP.');

// Random name: original stem is kept (sanitised) so files stay recognisable.
$stem = strtolower(pathinfo($original, PATHINFO_FILENAME));
$stem = preg_replace('/[^a-z0-9]+/', '-', $stem) ?? '';
$stem = trim($stem, '-');
if ($stem === '' || strlen($stem) > 40) $stem = 'media';

$name = $stem . '-' . bin2hex(random_bytes(5)) . '.' . $ext;
$dest = $dir . '/' . $name;

if (!move_uploaded_file((string)$f['tmp_name'], $dest)) {
  dk_fail(500, 'Could not move the file into uploads/.');
}
@chmod($dest, 0644);

echo json_encode(['ok' => true, 'path' => 'uploads/' . $name]);
