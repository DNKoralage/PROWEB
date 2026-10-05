<?php
/* ==========================================================================
   DK - api/upload.php
   Media upload endpoint for the studio dashboard (admin.html).

   Auth: dashboard gate hash as X-DK-Token (stops naive drive-by posts;
   NOT real auth - never rely on it for anything non-public). Files land
   in ../uploads/ (.htaccess refuses code execution and dir listing).
   Whitelist by extension AND detected MIME; random names; 50 MB per
   file, 20 files per batch. Anything else is a 4xx JSON error.

   SERVER CAPS - READ FIRST: the PHP constants below only apply INSIDE
   this script. Every upload must first survive the server PHP limits
   (upload_max_filesize, post_max_size, max_file_uploads). This repo ships
   api/.user.ini (55M / 256M / 20) which Hostinger reads per-directory -
   deploy api/ WITH that file, or large uploads die before this script
   runs (PHP aborts the body, $_FILES arrives empty). Worst case one
   batch posts 20 x 50 MB, hence post_max_size >> 50M.

   Single-file: POST field `file` -> {ok, path} or {ok:false,error,code}.
   Batch: POST field `files[]` -> {ok, files:[{path,name}],
     errors:[{name,error,code}]}.
   Failure codes: NO_FILE, TOO_MANY, EMPTY, TOO_LARGE, BAD_TYPE,
   MIME_MISMATCH, MOVE_FAILED, PHP_ERR_<n>, SERVER_LIMIT, AUTH, METHOD.
   ========================================================================== */

declare(strict_types=1);

// Same FNV-1a gate as assets/js/admin.js: fnv('dk|' + PASSCODE + '|studio').
define('DK_UPLOAD_TOKEN', '017cfc8b');
define('DK_MAX_BYTES', 50 * 1024 * 1024); // 50 MB per file
define('DK_MAX_BATCH', 20); // max files per batch request

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function dk_fail(int $code, string $msg, string $why = ""): void {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg, 'code' => ($why !== '' ? $why : 'FAIL')]);
  exit;
}

/** Human text for a PHP $_FILES error number. */
function dk_php_err(int $n): string {
  switch ($n) {
    case UPLOAD_ERR_INI_SIZE: return 'exceeds server upload_max_filesize (is api/.user.ini deployed?)';
    case UPLOAD_ERR_FORM_SIZE: return 'exceeds the form MAX_FILE_SIZE';
    case UPLOAD_ERR_PARTIAL: return 'connection dropped mid-upload - retry';
    case UPLOAD_ERR_NO_FILE: return 'no file arrived - server may have killed an oversize body';
    case UPLOAD_ERR_NO_TMP_DIR: return 'server temp folder missing (host issue)';
    case UPLOAD_ERR_CANT_WRITE: return 'server could not write temp file (disk full?)';
    case UPLOAD_ERR_EXTENSION: return 'blocked by a server PHP extension';
    default: return 'unknown upload error';
  }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') dk_fail(405, 'POST only.', 'METHOD');

$token = $_SERVER['HTTP_X_DK_TOKEN'] ?? '';
if (!hash_equals(DK_UPLOAD_TOKEN, $token)) dk_fail(403, 'Upload token rejected.', 'AUTH');

// Extension + MIME whitelist.
$allowed = [
  'jpg'  => ['image/jpeg'],
  'jpeg' => ['image/jpeg'],
  'png'  => ['image/png'],
  'gif'  => ['image/gif'],
  'webp' => ['image/webp'],
  'svg'  => ['image/svg+xml', 'text/plain', 'text/xml', 'application/xml'],
  'pdf'  => ['application/pdf'],
];

$dir = dirname(__DIR__) . '/uploads';
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
  dk_fail(500, 'uploads/ folder is missing and could not be created.', 'NO_DIR');
}
if (!is_writable($dir)) dk_fail(500, 'uploads/ is not writable by PHP.', 'NOT_WRITABLE');
/** Validate + store one upload entry; returns [path] or [error, code]. */
function dk_store_one($f, $original, $allowed, $dir) {
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $n = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
    return ['error' => ('Upload failed: ' . dk_php_err($n)), 'code' => ('PHP_ERR_' . $n)];
  }
  if ((int)$f['size'] <= 0) return ['error' => 'Empty file.', 'code' => 'EMPTY'];
  if ((int)$f['size'] > DK_MAX_BYTES) return ['error' => 'File is larger than 50 MB.', 'code' => 'TOO_LARGE'];
  $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
  if (!isset($allowed[$ext])) return ['error' => 'File type not allowed (jpg, png, gif, webp, svg, pdf).', 'code' => 'BAD_TYPE'];
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
    return ['error' => ('Content is ' . $mime . ', not .' . $ext . ' - renamed files are rejected.'), 'code' => 'MIME_MISMATCH'];
  }
  $stem = strtolower(pathinfo($original, PATHINFO_FILENAME));
  $stem = preg_replace('/[^a-z0-9]+/', '-', $stem);
  $stem = trim((string)$stem, '-');
  if ($stem === '' || strlen($stem) > 40) $stem = 'media';
  $name = ($stem . '-' . bin2hex(random_bytes(5)) . '.' . $ext);
  $dest = ($dir . '/' . $name);
  if (!is_uploaded_file((string)$f['tmp_name'])) return ['error' => 'Not an HTTP upload.', 'code' => 'NO_FILE'];
  if (!move_uploaded_file((string)$f['tmp_name'], $dest)) {
    return ['error' => 'Could not move file into uploads/ (permissions/disk).', 'code' => 'MOVE_FAILED'];
  }
  @chmod($dest, 0644);
  return ['path' => ('uploads/' . $name)];
}

/** True when PHP killed the body before this script ran (post_max_size). */
function dk_body_killed(): bool {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') return false;
  if (!empty($_FILES)) return false;
  return ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)) > 0;
}

// ---- batch mode: files[] ----
if (isset($_FILES['files']) && is_array($_FILES['files'])) {
  $b = $_FILES['files'];
  $names = (is_array($b['name'] ?? null) ? $b['name'] : []);
  $n = count($names);
  if ($n < 1) dk_fail(400, 'No files received.', 'NO_FILE');
  if ($n > DK_MAX_BATCH) dk_fail(400, 'Too many files (max 20).', 'TOO_MANY');
  $ok = []; $bad = [];
  for ($k = 0; $k < $n; $k++) {
    $one = [
      'name' => $b['name'][$k],
      'tmp_name' => $b['tmp_name'][$k],
      'error' => $b['error'][$k],
      'size' => $b['size'][$k],
    ];
    $r = dk_store_one($one, (string)$one['name'], $allowed, $dir);
    if (isset($r['path'])) $ok[] = ['path' => $r['path'], 'name' => (string)$one['name']];
    else $bad[] = ['name' => (string)$one['name'], 'error' => $r['error'], 'code' => $r['code']];
  }
  echo json_encode(['ok' => true, 'files' => $ok, 'errors' => $bad]);
  exit;
}

// ---- single-file mode (back-compat) ----
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
  if (dk_body_killed()) {
    dk_fail(413, 'Server rejected the upload before the app saw it: file exceeds ' .
      'server post_max_size/upload_max_filesize. Deploy api/.user.ini and allow 55M+.', 'SERVER_LIMIT');
  }
  dk_fail(400, 'No file received.', 'NO_FILE');
}
$f = $_FILES['file'];
$r = dk_store_one($f, (string)($f['name'] ?? ''), $allowed, $dir);
if (isset($r['path'])) echo json_encode(['ok' => true, 'path' => $r['path']]);
else dk_fail(400, $r['error'], $r['code']);
