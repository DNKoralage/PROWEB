// Node harness for the procedural foliage generator.
global.window = global;
require('../assets/js/common.js');
require('../assets/js/foliage.js');
const DK = global.DK;
const assert = require('assert');
const F = DK.foliage;

// --- determinism ---
assert.strictEqual(F.backdrop(1, 400, 300, {}), F.backdrop(1, 400, 300, {}), 'backdrop is deterministic');
assert.notStrictEqual(F.backdrop(1, 400, 300, {}), F.backdrop(2, 400, 300, {}), 'different seeds differ');
assert.strictEqual(F.placeholder('photo', 'abc'), F.placeholder('photo', 'abc'), 'placeholder deterministic');

// --- colour helper ---
assert.strictEqual(F.shade('#000000', 10), '#0a0a0a');
assert.strictEqual(F.shade('#ffffff', -0.5).length, 7);

// --- structural checks on generated svg ---
function checkSvg(svg, label) {
  assert.ok(svg.startsWith('<svg'), label + ': starts with <svg');
  assert.ok(svg.trim().endsWith('</svg>'), label + ': ends with </svg>');
  assert.ok(!/NaN|undefined|Infinity/.test(svg), label + ': no NaN/undefined/Infinity in output');
  // every url(#id) must have a matching id in the document
  const ids = new Set([...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) {
    assert.ok(ids.has(m[1]), label + ': url(#' + m[1] + ') has a matching id');
  }
  // tags must balance
  const open = (svg.match(/<(?!\/)(?!\?)[a-zA-Z]/g) || []).length;
  const close = (svg.match(/<\/[a-zA-Z]/g) || []).length;
  const self = (svg.match(/\/>/g) || []).length;
  assert.strictEqual(open, close + self, label + ': tags balance (' + open + ' vs ' + close + '+' + self + ')');
}

const pal = { deep: '#04160f', mid: '#062417', accent: '#31e0a1', accent2: '#6c8cff' };
checkSvg(F.backdrop(1337, 1600, 900, pal), 'backdrop');
checkSvg(F.foreground(77, 1600, 900, pal, { count: 18 }), 'foreground');
checkSvg(F.foreground(77, 1600, 900, pal, { count: 9, animate: false }), 'foreground no-anim');
for (const k of ['logo', 'video', 'photo']) checkSvg(F.placeholder(k, 'seed' + k), 'placeholder ' + k);

// --- frond geometry ---
const fr = F.frondPaths(200, 10, 90);
assert.ok(fr.spine.startsWith('M'), 'frond spine starts with M');
assert.ok(fr.leaflets.split('M').length - 1 === 20, 'frond has count*2 leaflets');
const nums = fr.spine.match(/-?\d+(\.\d+)?/g).map(Number);
assert.ok(nums.every(Number.isFinite), 'spine coords finite');

// --- layers ---
const hero = F.heroLayers(pal);
assert.strictEqual(hero.length, 4);
hero.forEach((l, i) => { assert.ok(l.html.startsWith('<svg'), 'hero layer ' + i); assert.ok(l.speed > 0); });
assert.strictEqual(F.loaderLayers(pal).length, 2);

// --- data uri round trip ---
const uri = F.placeholderUri('logo', 'x');
assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'), 'data uri prefix');
assert.ok(decodeURIComponent(uri.split(',')[1]).startsWith('<svg'), 'data uri decodes to svg');

console.log('foliage: all assertions passed');
console.log('sizes - backdrop:', F.backdrop(1337, 1600, 900, pal).length,
            'chars, foreground:', F.foreground(77, 1600, 900, pal, {}).length, 'chars');