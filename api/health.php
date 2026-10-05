<?php
/* ==========================================================================
   DK — api/health.php
   Readiness probe for the studio backend (Hostinger / any PHP host).

   GET api/health.php  →  {"ok":true,"db":"ok"|"unreachable","time":...}
   Never leaks credentials, hosts, or driver errors — the db flag is a
   boolean-style string only. Safe to leave deployed.
   ========================================================================== */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/db.php';

$up = dk_db_ping();

echo json_encode([
  'ok' => true,
  'db' => $up ? 'ok' : 'unreachable',
  'time' => time(),
]);
