<?php
/* ==========================================================================
   DK — api/db.php
   Shared MySQL connector for the studio backend (Hostinger / any PHP host).

   SECURITY MODEL — read this before touching credentials:
   - Secrets NEVER live in git. This file reads credentials from the
     environment first (Hostinger hPanel → Advanced → PHP Configuration, or
     a per-site .user.ini / server env), then from api/config.local.php
     (gitignored, lives only on the server), then from safe built-in
     defaults that carry NO password.
   - The dashboard gate (X-DK-Token) still guards every mutating endpoint;
     the DB layer only ever sees prepared statements (no string-built SQL).
   - Connection errors are logged server-side and surfaced to callers as a
     generic "Database unavailable" — the real PDO message (which may leak
     host/user details) is never echoed.

   Usage from another endpoint:
     require_once __DIR__ . '/db.php';
     try { $pdo = dk_db(); }
     catch (RuntimeException $e) { dk_fail(503, 'Database unavailable.'); }

   Hostinger setup (one time, on the server — NOT in this repo):
   1. hPanel → Databases → MySQL: create database + user, note the host.
   2. Either set env vars (preferred) or create api/config.local.php:
        <?php
        return [
          'host' => 'localhost',
          'name' => 'u332733349_PROWEB',
          'user' => 'u332733349_PROWEB',
          'pass' => 'YOUR-STRONG-PASSWORD',
        ];
   3. Hit api/health.php to confirm {"db":"ok"} without exposing anything.
   ========================================================================== */

declare(strict_types=1);

/** Resolved credentials (host/name/user/pass). Password defaults to ''. */
function dk_db_config(): array {
  $cfg = [
    'host' => getenv('DK_DB_HOST') ?: '',
    'name' => getenv('DK_DB_NAME') ?: '',
    'user' => getenv('DK_DB_USER') ?: '',
    'pass' => getenv('DK_DB_PASS') ?: '',
  ];

  // Server-only override file — gitignored, never committed.
  $local = __DIR__ . '/config.local.php';
  if (is_file($local)) {
    try {
      $ov = include $local;
      if (is_array($ov)) {
        foreach (['host', 'name', 'user', 'pass'] as $k) {
          if (isset($ov[$k]) && is_string($ov[$k]) && $ov[$k] !== '') $cfg[$k] = $ov[$k];
        }
      }
    } catch (Throwable $e) { /* corrupt local file: fall through to defaults */ }
  }

  // Non-secret fallbacks: the database/user identity is not sensitive the
  // way the password is, so shipping them keeps first-run setup obvious.
  if ($cfg['host'] === '') $cfg['host'] = 'localhost';
  if ($cfg['name'] === '') $cfg['name'] = 'u332733349_PROWEB';
  if ($cfg['user'] === '') $cfg['user'] = 'u332733349_PROWEB';
  // $cfg['pass'] intentionally stays '' unless the server provides it.
  return $cfg;
}

/**
 * Open (and memoise) a PDO connection with secure defaults.
 * @throws RuntimeException with a generic message on any failure.
 */
function dk_db(): PDO {
  static $pdo = null;
  if ($pdo instanceof PDO) return $pdo;

  if (!extension_loaded('pdo_mysql')) {
    error_log('[dk-db] pdo_mysql extension missing');
    throw new RuntimeException('Database unavailable.');
  }

  $c = dk_db_config();
  // Tight validation: identifiers only (Hostinger names are [a-z0-9_]),
  // host may additionally be an IP or internal hostname.
  if (!preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $c['host'])) {
    throw new RuntimeException('Database unavailable.');
  }
  if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $c['name'])) {
    throw new RuntimeException('Database unavailable.');
  }
  if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $c['user'])) {
    throw new RuntimeException('Database unavailable.');
  }

  $dsn = sprintf(
    'mysql:host=%s;dbname=%s;charset=utf8mb4',
    $c['host'],
    $c['name']
  );
  try {
    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,   // real prepared statements only
      PDO::ATTR_TIMEOUT => 5,
    ]);
  } catch (Throwable $e) {
    // Log the truth, tell callers nothing sensitive.
    error_log('[dk-db] connect failed: ' . $e->getMessage());
    throw new RuntimeException('Database unavailable.');
  }
  return $pdo;
}

/** True when a live connection can be opened (used by health.php). */
function dk_db_ping(): bool {
  try {
    dk_db()->query('SELECT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}
