<?php
/* ==========================================================================
   DK — api/config.local.php  (SERVER ONLY — NEVER COMMIT TO GIT)
   Copy this file to the Hostinger server as api/config.local.php and fill
   in the real password. It overrides environment variables. This filename
   is gitignored so it can never leak into the repository.

   1. Copy:  api/config.sample.php  →  api/config.local.php  (on server)
   2. Set the 'pass' value below to the real database password.
   3. Verify: open https://YOUR-DOMAIN/api/health.php → {"db":"ok"}.
   ========================================================================== */

declare(strict_types=1);

return [
  // Hostinger MySQL host — usually 'localhost'; some plans show a socket
  // or internal hostname in hPanel → Databases → MySQL.
  'host' => 'localhost',

  // Database + user created in hPanel → Databases → MySQL Management.
  'name' => 'u332733349_PROWEB',
  'user' => 'u332733349_PROWEB',

  // <<< PUT THE REAL PASSWORD HERE (server copy only) >>>
  'pass' => 'CHANGE-ME-ON-SERVER',
];
