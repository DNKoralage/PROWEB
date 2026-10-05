/**
 * Generate the default favicon, Open Graph image and uploads placeholder
 * folder contents from the procedural art, so the shipped site has real
 * files rather than 404s.
 *   node tools/build-assets.js
 */
global.window = global;
require('../assets/js/common.js');
require('../assets/js/foliage.js');

const fs = require('fs');
const path = require('path');
const F = global.DK.foliage;
const pal = { deep: '#04160f', mid: '#062417', accent: '#31e0a1', accent2: '#6c8cff' };

const up = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(up, { recursive: true });

// Favicon: a compact version of the loader mark.
const favicon = F.placeholder('logo', 'dk-favicon', 64, 64, pal);
fs.writeFileSync(path.join(up, 'favicon.svg'), favicon, 'utf8');
fs.writeFileSync(path.join(up, 'favicon.png'),
  'data:image/svg+xml;base64,' + Buffer.from(favicon, 'utf8').toString('base64'), 'utf8');

// Open Graph card: wide banner.
const og = F.backdrop(9182, 1200, 630, pal);
fs.writeFileSync(path.join(up, 'og.svg'), og, 'utf8');

// Keep .htaccess so the uploads folder is safe on Apache/Hostinger.
fs.writeFileSync(path.join(up, '.htaccess'), [
  '# Uploads: never execute code, never list the directory.',
  'Options -Indexes -ExecCGI',
  '<FilesMatch "\\.(php|phtml|php3|php4|php5|php7|phps|pl|py|cgi|asp|aspx|sh|exe)$">',
  '  Require all denied',
  '</FilesMatch>',
  '<IfModule mod_headers.c>',
  '  Header set X-Content-Type-Options "nosniff"',
  '</IfModule>',
  ''
].join('\n'), 'utf8');

console.log('uploads/ written:');
fs.readdirSync(up).forEach((f) => console.log('  ' + f));
console.log('favicon.svg chars:', favicon.length);