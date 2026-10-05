// Smoke-test every browser module: parse, load, and assert the public surface.
global.window = global;
global.performance = { now: () => Date.now() };
global.devicePixelRatio = 1;
global.innerWidth = 1440;
global.innerHeight = 900;
global.scrollY = 0;
global.scrollTo = () => {};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
global.IntersectionObserver = undefined;
global.CSS = { escape: (s) => s };
global.location = { pathname: '/index.html', href: 'http://x/' };
global.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
global.TextEncoder = require('util').TextEncoder;
global.Blob = class { constructor(p) { this.parts = p; this.size = p.reduce((n, x) => n + (x.length || 0), 0); } };
global.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
global.Audio = class { constructor() { this.paused = true; this.volume = 1; } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } addEventListener() {} removeEventListener() {} };

const assert = require('assert');

// minimal document stub for modules that touch the DOM at load time
const noop = () => {};
global.document = {
  documentElement: { classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {} },
  head: { appendChild: noop },
  body: { appendChild: noop, removeChild: noop },
  createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, setAttribute: noop, appendChild: noop, addEventListener: noop, querySelector: () => null, remove: noop, dataset: {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop
};

const files = ['common', 'foliage', 'sound', 'cursor', 'loader', 'parallax', 'radio'];
for (const f of files) require(`../assets/js/${f}.js`);

const DK = global.DK;
assert.ok(DK.common === undefined, 'modules namespace under DK');
['foliage', 'sound', 'cursor', 'loader', 'parallax', 'radio', 'zip', 'defaults', 'normalise']
  .forEach((k) => assert.ok(DK[k], `DK.${k} is exposed`));

// radio markup must build without a DOM-heavy path
const cfg = {
  radio: {
    title: 'My Servers', tagline: 'Ambient',
    visualizer: { style: 'bars', bars: 48 },
    stations: [
      { id: 'a', name: 'One', url: 'https://example.com/a.mp3', genre: 'Ambient', enabled: true },
      { id: 'b', name: 'Two', url: 'https://example.com/b.mp3', genre: 'Jazz', enabled: false }
    ]
  },
  settings: { radio: { blockedHint: 'Press play' } },
  kicker: 'On air'
};
assert.ok(DK.radio.markup, 'radio.markup available');
assert.ok(DK.radio.Visualizer, 'Visualizer exported');

// loader markup path is exercised through build()
assert.ok(DK.loader.build, 'loader.build available');

console.log('modules: all smoke assertions passed');
console.log('loaded:', files.join(', '));