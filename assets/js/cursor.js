/* ==========================================================================
   DK — cursor.js
   Custom smooth cursor for pointer-precise devices. The native cursor is
   hidden and replaced by a trailing ring + dot pair that reacts to what is
   underneath it. Touch and coarse pointers are left completely alone.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});

  var LABELS = {
    link: '',
    view: 'View',
    open: 'Open',
    play: 'Play',
    drag: 'Drag',
    next: 'Next',
    prev: 'Prev',
    zoom: 'Zoom'
  };

  function Cursor(root) {
    this.root = root || document;
    this.ring = null;
    this.dot = null;
    this.label = null;
    this.enabled = false;
    this.stop = null;

    // target = pointer position; ring and dot chase it with easing
    this.tx = 0; this.ty = 0;
    this.rx = 0; this.ry = 0;
    this.dx = 0; this.dy = 0;
    this.state = '';
    this.labelText = '';
    this.pressed = false;
  }

  /** Only build this on devices with a fine pointer that can hover. */
  Cursor.supported = function () {
    return !!(global.matchMedia && global.matchMedia('(pointer: fine)').matches &&
              global.matchMedia('(hover: hover)').matches);
  };

  Cursor.prototype.build = function () {
    this.ring = DK.dom.el('div', { class: 'dk-cursor-ring', 'aria-hidden': 'true' });
    this.dot = DK.dom.el('div', { class: 'dk-cursor-dot', 'aria-hidden': 'true' });
    this.label = DK.dom.el('span', { class: 'dk-cursor-label', 'aria-hidden': 'true' });
    this.ring.appendChild(this.label);
    this.root.body.appendChild(this.ring);
    this.root.body.appendChild(this.dot);
    this.root.documentElement.classList.add('dk-cursor-active');
  };

  Cursor.prototype.setState = function (state, labelText) {
    if (this.state === state && this.labelText === (labelText || '')) return;
    this.state = state || '';
    this.labelText = labelText || '';

    ['is-link', 'is-view', 'is-play', 'is-drag', 'is-text'].forEach(function (c) {
      this.ring.classList.remove(c);
      this.dot.classList.remove(c);
    }, this);

    if (this.state === 'link') { this.ring.classList.add('is-link'); this.dot.classList.add('is-link'); }
    if (this.state === 'view') { this.ring.classList.add('is-view'); this.dot.classList.add('is-view'); }
    if (this.state === 'play') { this.ring.classList.add('is-play'); this.dot.classList.add('is-play'); }
    if (this.state === 'drag') { this.ring.classList.add('is-drag'); this.dot.classList.add('is-drag'); }
    if (this.state === 'text')  { this.ring.classList.add('is-text');  this.dot.classList.add('is-text'); }

    this.label.textContent = this.labelText || LABELS[this.state] || '';
    this.ring.classList.toggle('has-label', !!this.label.textContent);
  };

  /** Work out what the pointer is over, from data attributes and tag names. */
  Cursor.prototype.resolve = function (target) {
    if (!target || !target.closest) return this.setState('');
    var el = target.closest('[data-cursor], a, button, input, textarea, select, video, [role="button"]');
    if (!el) return this.setState('');

    var explicit = el.getAttribute('data-cursor');
    if (explicit) {
      var text = el.getAttribute('data-cursor-label');
      return this.setState(explicit === 'label' ? 'view' : explicit, text);
    }
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return this.setState('text');
    if (tag === 'VIDEO') return this.setState('play', 'Play');
    if (tag === 'A' || tag === 'BUTTON' || el.getAttribute('role') === 'button') return this.setState('link');
    return this.setState('');
  };
Cursor.prototype.start = function (opts) {
    if (this.enabled) return this;
    opts = opts || {};
    if (!Cursor.supported()) return this;

    var self = this;
    this.build();
    this.enabled = true;

    var move = function (e) {
      self.tx = e.clientX;
      self.ty = e.clientY;
      if (self.rx === 0 && self.ry === 0) {
        self.rx = self.tx; self.ry = self.ty; self.dx = self.tx; self.dy = self.ty;
      }
      self.ring.classList.add('is-visible');
      self.dot.classList.add('is-visible');
    };
    var over = function (e) { self.resolve(e.target); };
    var down = function () { self.pressed = true; self.ring.classList.add('is-down'); self.dot.classList.add('is-down'); };
    var up = function () { self.pressed = false; self.ring.classList.remove('is-down'); self.dot.classList.remove('is-down'); };
    var leave = function () {
      self.ring.classList.remove('is-visible');
      self.dot.classList.remove('is-visible');
    };
    var enter = function () {
      self.ring.classList.add('is-visible');
      self.dot.classList.add('is-visible');
    };

    this._off = [
      [this.root, 'pointermove', move],
      [this.root, 'pointerover', over],
      [this.root, 'pointerdown', down],
      [this.root, 'pointerup', up],
      [this.root, 'mouseleave', leave],
      [this.root, 'mouseenter', enter]
    ];
    this._off.forEach(function (b) { b[0].addEventListener(b[1], b[2], { passive: true }); });

    // Two speeds: the dot tracks tightly, the ring lags for a soft trailing feel.
    this.stop = DK.dom.raf(function () {
      self.dx += (self.tx - self.dx) * 0.55;
      self.dy += (self.ty - self.dy) * 0.55;
      self.rx += (self.tx - self.rx) * 0.16;
      self.ry += (self.ty - self.ry) * 0.16;
      self.dot.style.transform = 'translate3d(' + self.dx.toFixed(2) + 'px,' + self.dy.toFixed(2) + 'px,0)';
      self.ring.style.transform = 'translate3d(' + self.rx.toFixed(2) + 'px,' + self.ry.toFixed(2) + 'px,0)';
    });

    return this;
  };

  Cursor.prototype.destroy = function () {
    if (!this.enabled) return;
    if (this.stop) this.stop();
    (this._off || []).forEach(function (b) { b[0].removeEventListener(b[1], b[2]); });
    if (this.ring) this.ring.remove();
    if (this.dot) this.dot.remove();
    this.root.documentElement.classList.remove('dk-cursor-active');
    this.enabled = false;
  };

  DK.cursor = {
    labels: LABELS,

    /** Create (or return) the singleton cursor. */
    init: function (opts) {
      if (!this._instance) this._instance = new Cursor(document);
      if (!opts || opts.enabled !== false) this._instance.start(opts);
      return this._instance;
    },

    get instance() { return this._instance; },

    supported: Cursor.supported
  };

})(typeof window !== 'undefined' ? window : this);