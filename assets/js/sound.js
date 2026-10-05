/* ==========================================================================
   DK â€” sound.js
   Opera GX-style interface sounds, synthesised in the browser with Web Audio.
   No sample files: every click, hover and toggle is generated from
   oscillators, so the site stays a pure static deployment.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});

  /** Lazily created AudioContext, created on the first user gesture. */
  var ctx = null;
  var master = null;
  var convolver = null;
  var enabled = true;
  var hoverEnabled = true;
  var volume = 0.35;
  var unlocked = false;

  function makeContext() {
    if (ctx) return ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch (e) { return null; }

    master = ctx.createGain();
    master.gain.value = volume;

    // Gentle bus compression keeps rapid hover stacks from clipping.
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    master.connect(comp);
    comp.connect(ctx.destination);
    return ctx;
  }

  /**
   * Small synthetic reverb so clicks sit in a "room".
   * The impulse response is generated rather than downloaded.
   */
  function impulse(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function reverbSend(node, amount, seconds) {
    if (!convolver && ctx) convolver = ctx.createConvolver();
    if (!convolver) return null;
    if (!convolver.buffer) convolver.buffer = impulse(seconds || 1.2, 2.6);
    var wet = ctx.createGain();
    wet.gain.value = amount;
    node.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);
    return wet;
  }

  /**
   * Core tone builder.
   * @param {object} o freq, toFreq, type, dur, gain, attack, filter, delay
   */
  function tone(o) {
    if (!enabled) return;
    var c = makeContext();
    if (!c) return;
    var t0 = c.currentTime + (o.delay || 0);
    var dur = o.dur || 0.12;

    var osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.toFreq && o.toFreq !== o.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.toFreq), t0 + dur);
    }

    var g = c.createGain();
    var peak = o.gain === undefined ? 0.25 : o.gain;
    var atk = o.attack === undefined ? 0.005 : o.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var tail = g;
    if (o.filter) {
      var f = c.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.cutoff || 1200, t0);
      if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoffTo), t0 + dur);
      f.Q.value = o.q || 1;
      g.connect(f);
      tail = f;
    }
    osc.connect(g);
    tail.connect(master);
    if (o.reverb) reverbSend(tail, o.reverb, o.reverbTime);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Filtered noise burst - used for tactile "thock" transients. */
  function noise(o) {
    if (!enabled) return;
    var c = makeContext();
    if (!c) return;
    o = o || {};
    var dur = o.dur || 0.08;
    var t0 = c.currentTime + (o.delay || 0);

    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);

    var src = c.createBufferSource();
    src.buffer = buf;

    var f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1800, t0);
    if (o.toFreq) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.toFreq), t0 + dur);
    f.Q.value = o.q || 1.2;

    var g = c.createGain();
    var peak = o.gain === undefined ? 0.12 : o.gain;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(g); g.connect(master);
    if (o.reverb) reverbSend(g, o.reverb, o.reverbTime);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* -------------------------------------------------------------- palette */

  var lastHover = 0;

  var SFX = {
    /** Soft tick when a link or button is hovered. */
    hover: function () {
      if (!hoverEnabled || !enabled) return;
      var now = (global.performance && performance.now()) || Date.now();
      if (now - lastHover < 70) return;          // avoid machine-gun ticking
      lastHover = now;
      tone({ freq: 1180, toFreq: 1620, type: 'triangle', dur: 0.07, gain: 0.055, reverb: 0.12 });
      noise({ freq: 3400, toFreq: 5200, dur: 0.035, gain: 0.02 });
    },

    /** Crisp primary click - two detuned blips plus a body thump. */
    click: function () {
      tone({ freq: 660, toFreq: 880, type: 'square', dur: 0.055, gain: 0.07, filter: 'lowpass', cutoff: 2600 });
      tone({ freq: 1320, toFreq: 1760, type: 'sine', dur: 0.09, gain: 0.05, delay: 0.012, reverb: 0.2 });
      tone({ freq: 160, toFreq: 90, type: 'sine', dur: 0.12, gain: 0.1 });
      noise({ freq: 2200, toFreq: 700, dur: 0.06, gain: 0.05 });
    },

    /** Nav / section change - a short rising arpeggio. */
    navigate: function () {
      [523.25, 659.25, 783.99].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.06, delay: i * 0.055, reverb: 0.28 });
      });
      noise({ freq: 900, toFreq: 3000, dur: 0.12, gain: 0.03 });
    },

    /** Toggle on. */
    toggleOn: function () {
      tone({ freq: 420, toFreq: 780, type: 'triangle', dur: 0.11, gain: 0.07 });
      tone({ freq: 1046, type: 'sine', dur: 0.16, gain: 0.045, delay: 0.05, reverb: 0.25 });
    },

    /** Toggle off. */
    toggleOff: function () {
      tone({ freq: 700, toFreq: 330, type: 'triangle', dur: 0.11, gain: 0.06 });
      tone({ freq: 330, toFreq: 196, type: 'sine', dur: 0.14, gain: 0.04, delay: 0.04 });
    },

    /** Success / saved. */
    success: function () {
      [659.25, 830.61, 987.77, 1318.5].forEach(function (f, i) {
        tone({ freq: f, type: 'sine', dur: 0.2, gain: 0.05, delay: i * 0.06, reverb: 0.35 });
      });
    },

    /** Error / rejected. */
    error: function () {
      tone({ freq: 300, toFreq: 150, type: 'sawtooth', dur: 0.2, gain: 0.07, filter: 'lowpass', cutoff: 1200 });
      noise({ freq: 500, toFreq: 180, dur: 0.18, gain: 0.04 });
    },

    /** Opening a lightbox / album viewer. */
    open: function () {
      tone({ freq: 260, toFreq: 620, type: 'sine', dur: 0.18, gain: 0.06, reverb: 0.3 });
      noise({ freq: 1200, toFreq: 4200, dur: 0.16, gain: 0.025 });
    },

    /** Closing a viewer. */
    close: function () {
      tone({ freq: 620, toFreq: 240, type: 'sine', dur: 0.16, gain: 0.05, reverb: 0.25 });
    },

    /** Loader finished - a wide, cinematic resolve. */
    reveal: function () {
      [261.63, 392, 523.25, 659.25].forEach(function (f, i) {
        tone({ freq: f, type: 'sine', dur: 1.1, gain: 0.05, delay: i * 0.11, reverb: 0.5, reverbTime: 2 });
      });
      noise({ freq: 400, toFreq: 2600, dur: 0.7, gain: 0.03 });
    },

    /** Radio stream starting. */
    radioOn: function () {
      tone({ freq: 180, toFreq: 720, type: 'sawtooth', dur: 0.42, gain: 0.05, filter: 'lowpass', cutoff: 400, cutoffTo: 2800 });
      noise({ freq: 600, toFreq: 4000, dur: 0.4, gain: 0.02 });
    },

    /** Radio stream stopping. */
    radioOff: function () {
      tone({ freq: 720, toFreq: 160, type: 'sawtooth', dur: 0.3, gain: 0.05, filter: 'lowpass', cutoff: 2400, cutoffTo: 300 });
    }
  };

  /* ------------------------------------------------------------------ api */

  DK.sound = {
    /** Play a named effect. Unknown names are ignored. */
    play: function (name) {
      var fn = SFX[name];
      if (fn) { try { fn(); } catch (e) { /* audio must never break the UI */ } }
      return !!fn;
    },

    /** Unlock audio on first gesture (browser autoplay policy). */
    unlock: function () {
      var c = makeContext();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      unlocked = true;
    },

    setEnabled: function (on) {
      enabled = !!on;
      if (enabled) DK.sound.unlock();
    },

    setHover: function (on) { hoverEnabled = !!on; },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master) master.gain.value = volume;
    },

    /** Configure from the content document. */
    configure: function (settings) {
      var s = (settings && settings.sounds) || {};
      if (s.enabled !== undefined) enabled = !!s.enabled;
      if (s.hover !== undefined) hoverEnabled = !!s.hover;
      if (s.volume !== undefined) {
        volume = Math.max(0, Math.min(1, Number(s.volume) || 0));
        if (master) master.gain.value = volume;
      }
    },

    /**
     * Wire hover/click sounds to the page using event delegation.
     * Safe to call repeatedly - only one pair of listeners is ever bound.
     */
    attach: function (root) {
      root = root || document;
      if (root.__dkSoundBound) return;
      root.__dkSoundBound = true;

      var HOVER_SEL = 'a, button, [role="button"], input[type="submit"], .dk-hover';

      root.addEventListener('pointerover', function (e) {
        if (e.pointerType === 'touch') return;
        var t = e.target.closest ? e.target.closest(HOVER_SEL) : null;
        if (t && !t.disabled) SFX.hover();
      }, true);

      root.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest(HOVER_SEL) : null;
        if (!t || t.disabled) return;
        SFX.click();
      }, true);

      // Unlock on the first genuine interaction with the page.
      var once = function () {
        DK.sound.unlock();
        document.removeEventListener('pointerdown', once);
        document.removeEventListener('keydown', once);
      };
      document.addEventListener('pointerdown', once);
      document.addEventListener('keydown', once);
    },

    /** Exposed for tests and custom UI wiring. */
    _tones: SFX,
    get context() { return ctx; },
    get unlocked() { return unlocked; },
    get isEnabled() { return enabled; }
  };

})(typeof window !== 'undefined' ? window : this);
