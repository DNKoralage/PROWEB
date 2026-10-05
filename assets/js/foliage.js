/* ==========================================================================
   DK â€” foliage.js
   Procedural jungle artwork. Every leaf, frond and treeline layer is generated
   from a seed, so the site ships without any binary assets and the artwork
   can be re-tuned from the dashboard colour controls.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});

  /* --------------------------------------------------- deterministic random */

  /** Mulberry32 - small, fast, seedable PRNG. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Value in [min,max). */
  function between(r, min, max) { return min + r() * (max - min); }
  /** Integer in [min,max]. */
  function intBetween(r, min, max) { return Math.floor(between(r, min, max + 1)); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  /* --------------------------------------------------------------- palettes */

  /** Deep-to-bright jungle greens, dark enough for white text on top. */
  var GREENS = ['#04160f', '#062417', '#08351f', '#0b4a2b', '#0f6036', '#137a44'];
  var ACCENTS = ['#31e0a1', '#6c8cff', '#7b5cff', '#22d3ee'];

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function adj(c) {
      return Math.max(0, Math.min(255, amt >= 0 ? c + amt : c * (1 + amt)));
    }
    return '#' + [adj(r), adj(g), adj(b)]
      .map(function (c) { return ('0' + Math.round(c).toString(16)).slice(-2); })
      .join('');
  }

  /* ------------------------------------------------------------ leaf shapes */

  /**
   * A single leaf as an SVG path string.
   * @param {number} len   leaf length
   * @param {number} wid   max width across the leaf
   * @param {number} bend  sideways curvature of the tip
   */
  function leafPath(len, wid, bend) {
    var w = wid;
    var tipX = len, tipY = bend;
    var c1x = len * 0.28, c1y = -w;
    var c2x = len * 0.78, c2y = -w * 0.55 + bend * 0.5;
    var c3x = len * 0.82, c3y = w * 0.55 + bend * 0.5;
    var c4x = len * 0.3, c4y = w;
    return 'M0 0' +
      'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ',' +
           c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ',' +
           tipX.toFixed(1) + ' ' + tipY.toFixed(1) +
      'C' + c3x.toFixed(1) + ' ' + c3y.toFixed(1) + ',' +
           c4x.toFixed(1) + ' ' + c4y.toFixed(1) + ',0 0Z';
  }

  /**
   * A palm frond: a spine with leaflets fanning off both sides.
   * @param {number} len      overall length
   * @param {number} count    leaflet pairs
   * @param {number} sweep    total arc in degrees
   */
  function frondPaths(len, count, sweep) {
    var out = { spine: '', leaflets: '' };
    var pts = [];
    for (var i = 0; i <= 20; i++) {
      var t = i / 20;
      // quadratic-ish arc so the frond curves like a real palm
      var ang = (sweep * t * t) / 2;
      var r = len * t;
      pts.push([Math.cos(ang * Math.PI / 180) * r, Math.sin(ang * Math.PI / 180) * r]);
    }
    out.spine = 'M' + pts.map(function (p) {
      return p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join('L');

    for (var j = 1; j <= count; j++) {
      var tt = j / (count + 1);
      var idx = Math.min(pts.length - 1, Math.round(tt * 20));
      var p = pts[idx];
      // leaflets are longest in the middle third, tapering at both ends
      var size = len * 0.3 * Math.sin(Math.PI * Math.pow(tt, 0.75));
      var next = pts[Math.min(pts.length - 1, idx + 1)];
      var base = Math.atan2(next[1] - p[1], next[0] - p[0]) * 180 / Math.PI;
      [-1, 1].forEach(function (side) {
        var a = (base + side * (38 + 14 * Math.sin(tt * Math.PI))) * Math.PI / 180;
        var ex = p[0] + Math.cos(a) * size;
        var ey = p[1] + Math.sin(a) * size;
        var mid = (base + side * 16) * Math.PI / 180;
        var mx = p[0] + Math.cos(mid) * size * 0.55;
        var my = p[1] + Math.sin(mid) * size * 0.55;
        out.leaflets += 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) +
          'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ',' +
                ex.toFixed(1) + ' ' + ey.toFixed(1);
      });
    }

    return out;
  }

  /* --------------------------------------------------------- svg assemblies */

  function wrap(w, h, body, preserve) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
           '" preserveAspectRatio="' + (preserve || 'xMidYMax slice') +
           '" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /**
   * Background layer: haze, light shafts and distant treeline silhouettes.
   */
  function backdrop(seed, w, h, palette) {
    w = w || 1600; h = h || 900;
    var pal = palette || {};
    var r = rng(seed);
    var deep = pal.deep || '#04160f';
    var mid = pal.mid || '#062417';
    var accent = pal.accent || '#31e0a1';

    var body = '<defs>' +
      '<linearGradient id="sky' + seed + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + shade(deep, 0.06) + '"/>' +
        '<stop offset="55%" stop-color="' + shade(deep, -0.15) + '"/>' +
        '<stop offset="100%" stop-color="#010805"/>' +
      '</linearGradient>' +
      '<radialGradient id="glow' + seed + '" cx="50%" cy="18%" r="62%">' +
        '<stop offset="0%" stop-color="' + accent + '" stop-opacity="0.20"/>' +
        '<stop offset="100%" stop-color="' + accent + '" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<linearGradient id="shaft' + seed + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>' +
        '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>' +
      '</linearGradient>' +
    '</defs>';

    body += '<rect width="' + w + '" height="' + h + '" fill="url(#sky' + seed + ')"/>';
    body += '<rect width="' + w + '" height="' + h + '" fill="url(#glow' + seed + ')"/>';

    // light shafts falling through the treetops
    for (var i = 0; i < 7; i++) {
      var x = between(r, -0.1, 1.1) * w;
      var top = between(r, -0.05, 0.2) * h;
      var sw = between(r, 0.02, 0.09) * w;
      var drift = between(r, -0.18, 0.18) * w;
      body += '<path d="M' + x.toFixed(0) + ' ' + top.toFixed(0) +
              ' L' + (x + sw).toFixed(0) + ' ' + top.toFixed(0) +
              ' L' + (x + sw + drift).toFixed(0) + ' ' + h +
              ' L' + (x + drift).toFixed(0) + ' ' + h + 'Z" fill="url(#shaft' + seed + ')"/>';
    }

    // rolling jungle ridges, far to near
    [
      { y: 0.60, amp: 0.05, fill: shade(mid, 0.05), op: 0.55 },
      { y: 0.72, amp: 0.07, fill: shade(mid, -0.10), op: 0.75 },
      { y: 0.86, amp: 0.06, fill: shade(deep, -0.25), op: 1 }
    ].forEach(function (ridge, ri) {
      var d = 'M0 ' + h + ' L0 ' + (ridge.y * h).toFixed(0);
      for (var s = 1; s <= 26; s++) {
        var px = (s / 26) * w;
        var py = ridge.y * h +
                 Math.sin(s * 0.7 + ri * 2 + seed % 7) * ridge.amp * h * 0.6 +
                 Math.sin(s * 1.9 + ri) * ridge.amp * h * 0.25;
        d += ' L' + px.toFixed(0) + ' ' + py.toFixed(0);
      }
      d += ' L' + w + ' ' + h + 'Z';
      body += '<path d="' + d + '" fill="' + ridge.fill + '" opacity="' + ridge.op + '"/>';
    });

    // scattered tree crowns along the ridges
    for (var t = 0; t < 26; t++) {
      var rad = between(r, 0.02, 0.055) * w;
      body += '<path d="' + leafPath(rad, rad * 0.5, between(r, -rad * 0.2, rad * 0.2)) +
              '" fill="' + shade(r() > 0.5 ? mid : deep, between(r, -0.3, 0.1)) +
              '" opacity="0.8" transform="translate(' +
              (r() * w).toFixed(0) + ',' + ((0.62 + r() * 0.24) * h).toFixed(0) +
              ') rotate(' + between(r, -40, 40).toFixed(0) + ')"/>';
    }

    return wrap(w, h, body);
  }

  /**
   * Foreground layer: big leaves and fronds framing the edges of the frame.
   */
  function foreground(seed, w, h, palette, opts) {
    w = w || 1600; h = h || 900;
    opts = opts || {};
    var pal = palette || {};
    var r = rng(seed + 991);
    var accent = pal.accent || '#31e0a1';
    var body = '<defs><linearGradient id="fg' + seed + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + shade(pal.deep || '#04160f', 0.10) + '"/>' +
      '<stop offset="100%" stop-color="#010705"/>' +
    '</linearGradient></defs>';

    var count = opts.count || 22;
    for (var i = 0; i < count; i++) {
      var edge = i % 4;
      var x, y, rot;
      if (edge === 0)      { x = between(r, -0.06, 0.22) * w;  y = between(r, -0.1, 0.5) * h;  rot = between(r, -60, 60); }
      else if (edge === 1) { x = between(r, 0.78, 1.06) * w;  y = between(r, -0.1, 0.5) * h;  rot = between(r, 120, 240); }
      else if (edge === 2) { x = between(r, -0.05, 1.05) * w; y = between(r, -0.18, 0.06) * h; rot = between(r, 20, 160); }
      else                 { x = between(r, -0.05, 1.05) * w; y = between(r, 0.72, 1.08) * h; rot = between(r, 200, 340); }

      var col = shade(pick(r, GREENS), between(r, -0.25, 0.12));
      var op = between(r, 0.55, 0.95).toFixed(2);
      var anim = opts.animate === false ? '' :
        '<animateTransform attributeName="transform" type="rotate" ' +
        'values="-1.5;1.5;-1.5" dur="' + between(r, 7, 14).toFixed(1) +
        's" repeatCount="indefinite" additive="sum"/>';

      if (r() > 0.45) {
        var f = frondPaths(between(r, 0.18, 0.42) * w, intBetween(r, 8, 14), between(r, 50, 120));
        body += '<g transform="translate(' + x.toFixed(0) + ',' + y.toFixed(0) +
                ') rotate(' + rot.toFixed(0) + ')" opacity="' + op + '">' +
                '<path d="' + f.spine + '" stroke="' + shade(col, 0.1) + '" stroke-width="' +
                between(r, 2, 5).toFixed(1) + '" fill="none"/>' +
                '<path d="' + f.leaflets + '" stroke="' + col + '" stroke-width="' +
                between(r, 7, 16).toFixed(1) + '" stroke-linecap="round" fill="none" ' +
                'opacity="0.95">' + anim + '</path></g>';
      } else {
        var len = between(r, 0.16, 0.38) * w;
        body += '<g transform="translate(' + x.toFixed(0) + ',' + y.toFixed(0) +
                ') rotate(' + rot.toFixed(0) + ')" opacity="' + op + '">' +
                '<path d="' + leafPath(len, len * between(r, 0.24, 0.4), between(r, -len * 0.25, len * 0.25)) +
                '" fill="' + col + '">' + anim + '</path>' +
                '<path d="M0 0 L' + (len * 0.9).toFixed(0) + ' ' + (len * 0.08).toFixed(0) +
                '" stroke="' + shade(col, 0.22) + '" stroke-width="1.6" fill="none" opacity="0.5"/></g>';
      }
    }

    // glowing spores for depth
    for (var s = 0; s < 18; s++) {
      body += '<circle cx="' + (r() * w).toFixed(0) + '" cy="' + (r() * h).toFixed(0) +
              '" r="' + between(r, 1.2, 3.4).toFixed(1) + '" fill="' + accent +
              '" opacity="' + between(r, 0.15, 0.5).toFixed(2) + '">' +
              '<animate attributeName="opacity" values="0.05;0.6;0.05" dur="' +
              between(r, 3, 9).toFixed(1) + 's" repeatCount="indefinite"/></circle>';
    }
    return wrap(w, h, body);
  }

  /* ------------------------------------------------------- placeholder art */

  /**
   * Deterministic placeholder artwork for items without an uploaded image.
   * @param {string} kind logo | video | photo
   */
  function placeholder(kind, seed, w, h, palette) {
    w = w || 1200; h = h || 900;
    var pal = palette || {};
    var s = hashStr(kind + ':' + (seed || 'dk'));
    var r = rng(s);
    var accent = pal.accent || '#31e0a1';
    var accent2 = pal.accent2 || '#6c8cff';
    var deep = pal.deep || '#04160f';
    var uid = 'p' + s.toString(36);

    if (kind === 'logo') {
      // abstract mark: concentric arcs plus a palm frond, meet-cropped
      var cx = w / 2, cy = h / 2;
      var g = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="' + accent + '"/>' +
        '<stop offset="100%" stop-color="' + accent2 + '"/></linearGradient></defs>' +
        '<rect width="' + w + '" height="' + h + '" fill="' + shade(deep, 0.02) + '"/>';
      for (var i = 5; i >= 1; i--) {
        g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (w * 0.07 * i) +
             '" fill="none" stroke="url(#' + uid + ')" stroke-width="' + (w * 0.012) +
             '" opacity="' + (0.16 + 0.14 * i).toFixed(2) + '"/>';
      }
      var f = frondPaths(w * 0.3, 9, 100);
      g += '<g transform="translate(' + (cx - w * 0.15) + ',' + cy + ') rotate(-20)">' +
           '<path d="' + f.leaflets + '" stroke="' + accent +
           '" stroke-width="' + (w * 0.018) + '" stroke-linecap="round" fill="none"/></g>';
      return wrap(w, h, g, 'xMidYMid meet');
    }

    if (kind === 'video') {
      // poster frame: glow, treeline silhouettes, play badge
      var gy = h * 0.62;
      var v = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + shade(deep, 0.04) + '"/>' +
        '<stop offset="100%" stop-color="#010705"/></linearGradient>' +
        '<radialGradient id="' + uid + 'g" cx="50%" cy="' + (gy / h * 100).toFixed(0) + '%" r="40%">' +
        '<stop offset="0%" stop-color="' + accent + '" stop-opacity="0.5"/>' +
        '<stop offset="100%" stop-color="' + accent + '" stop-opacity="0"/></radialGradient></defs>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#' + uid + ')"/>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#' + uid + 'g)"/>';
      for (var k = 0; k < 9; k++) {
        var lx = r() * w, ll = between(r, 0.1, 0.3) * h;
        v += '<path d="' + leafPath(ll, ll * 0.3, between(r, -20, 20)) + '" fill="' +
             shade(pick(r, GREENS), between(r, -0.2, 0.1)) + '" opacity="0.9" transform="translate(' +
             lx.toFixed(0) + ',' + (h - between(r, 0, 0.15) * h).toFixed(0) + ') rotate(' +
             between(r, -35, 35).toFixed(0) + ')"/>';
      }
      v += '<path d="M' + (w * 0.44) + ' ' + (h * 0.44) + ' L' + (w * 0.56) + ' ' + (h * 0.44) +
           ' L' + (w * 0.56) + ' ' + (h * 0.58) + ' L' + (w * 0.44) + ' ' + (h * 0.58) +
           'Z" fill="#ffffff" opacity="0.85"/>' +
           '<path d="M' + (w * 0.485) + ' ' + (h * 0.485) + ' L' + (w * 0.485) + ' ' + (h * 0.535) +
           ' L' + (w * 0.535) + ' ' + (h * 0.5) + 'Z" fill="' + shade(deep, 0.05) + '"/>';
      return wrap(w, h, v);
    }

    // photo / generic: scattered leaves over a deep gradient
    var art = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0.6" y2="1">' +
      '<stop offset="0%" stop-color="' + shade(deep, 0.07) + '"/>' +
      '<stop offset="100%" stop-color="' + shade(deep, -0.3) + '"/></linearGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#' + uid + ')"/>';
    for (var q = 0; q < 16; q++) {
      var ln = between(r, 0.15, 0.5) * w;
      art += '<path d="' + leafPath(ln, ln * between(r, 0.2, 0.36), between(r, -ln * 0.3, ln * 0.3)) +
           '" fill="' + shade(pick(r, GREENS), between(r, -0.2, 0.15)) +
           '" opacity="' + between(r, 0.25, 0.7).toFixed(2) + '" transform="translate(' +
           (r() * w).toFixed(0) + ',' + (r() * h).toFixed(0) + ') rotate(' +
           between(r, 0, 360).toFixed(0) + ')"/>';
    }
    art += '<circle cx="' + (w * between(r, 0.2, 0.8)).toFixed(0) + '" cy="' +
         (h * between(r, 0.15, 0.5)).toFixed(0) + '" r="' + (w * 0.05).toFixed(0) +
         '" fill="' + accent + '" opacity="0.35"/>';
    return wrap(w, h, art);
  }

  /* ----------------------------------------------------------------- public */

  DK.foliage = {
    rng: rng,
    hashStr: hashStr,
    shade: shade,
    leafPath: leafPath,
    frondPaths: frondPaths,
    backdrop: backdrop,
    foreground: foreground,
    placeholder: placeholder,
    GREENS: GREENS,
    ACCENTS: ACCENTS,

    /** data-URI form, for CSS backgrounds and <img> fallbacks. */
    toDataUri: function (svg) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },

    /** Placeholder helper used by the renderer. */
    placeholderUri: function (kind, seed, w, h, palette) {
      return this.toDataUri(placeholder(kind, seed, w, h, palette));
    },

    /**
     * Build the parallax backdrop for the hero.
     * Returns far -> near layers ready for the renderer.
     */
    heroLayers: function (palette) {
      var p = palette || {};
      return [
        { name: 'far', html: backdrop(1337, 1600, 900, p), speed: 0.06, opacity: 0.85 },
        { name: 'mid', html: backdrop(4242, 1600, 900,
            { deep: p.mid || '#062417', accent: p.accent2 || '#6c8cff' }), speed: 0.14, opacity: 0.9 },
        { name: 'near', html: foreground(77, 1600, 900, p, { count: 18 }), speed: 0.3, opacity: 1 },
        { name: 'fore', html: foreground(808, 1600, 900,
            { deep: '#010705', accent: p.accent }, { count: 9 }), speed: 0.48, opacity: 1 }
      ];
    },

    /** Denser foliage used behind the pre-loader. */
    loaderLayers: function (palette) {
      var p = palette || {};
      return [
        { name: 'back', html: backdrop(5150, 1600, 900, p), speed: 0.1 },
        { name: 'frond', html: foreground(2468, 1600, 900, p, { count: 26 }), speed: 0.24 }
      ];
    }
  };

})(typeof window !== 'undefined' ? window : this);
