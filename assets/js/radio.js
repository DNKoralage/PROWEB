/* ==========================================================================
   DK â€” radio.js
   Custom streaming radio player with an animated canvas visualizer.
   Falls back to a synthetic (simulated) visualizer when the stream does not
   allow Web Audio analysis, which is common with public radio streams.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});
  var esc = DK.esc;

  /**
   * Render the radio section markup.
   * @param {object} cfg { radio, site }
   */
  function markup(cfg) {
    var radio = cfg.radio || {};
    var cfgVis = radio.visualizer || {};
    var stations = (radio.stations || []).filter(function (s) { return s.enabled !== false; });

    var wrap = DK.dom.el('section', {
      id: 'radio',
      class: 'dk-section dk-radio',
      'aria-labelledby': 'radio-title'
    });

    wrap.appendChild(DK.dom.el('div', { class: 'dk-radio__aura', 'aria-hidden': 'true' }));

    var inner = DK.dom.el('div', { class: 'dk-container dk-radio__inner' });

    var head = DK.dom.el('div', { class: 'dk-radio__head' });
    head.appendChild(DK.dom.el('p', { class: 'dk-kicker' }, esc(cfg.kicker || 'On air')));
    head.appendChild(DK.dom.el('h2', { class: 'dk-section__title', id: 'radio-title' }, esc(radio.title || 'Radio')));
    if (radio.tagline) {
      head.appendChild(DK.dom.el('p', { class: 'dk-section__blurb' }, esc(radio.tagline)));
    }
    inner.appendChild(head);

    if (!stations.length) {
      inner.appendChild(DK.dom.el('p', { class: 'dk-empty' },
        'No stations yet â€” add stream URLs from the dashboard.'));
      wrap.appendChild(inner);
      return wrap;
    }

    var body = DK.dom.el('div', { class: 'dk-radio__body' });

    // ---- deck (visualizer + transport) ----
    var deck = DK.dom.el('div', { class: 'dk-radio__deck' });

    var canvasWrap = DK.dom.el('div', { class: 'dk-radio__viz' });
    var canvas = DK.dom.el('canvas', { class: 'dk-radio__canvas', 'aria-hidden': 'true' });
    canvasWrap.appendChild(canvas);

    var badge = DK.dom.el('div', { class: 'dk-radio__badge' });
    badge.appendChild(DK.dom.el('span', { class: 'dk-radio__badge-pulse', 'aria-hidden': 'true' }));
    badge.appendChild(DK.dom.el('span', { class: 'dk-radio__badge-text' }, 'Live'));
    canvasWrap.appendChild(badge);
    deck.appendChild(canvasWrap);

    var transport = DK.dom.el('div', { class: 'dk-radio__transport' });

    var playBtn = DK.dom.el('button', {
      type: 'button',
      class: 'dk-radio__play',
      'aria-label': 'Play radio',
      'data-cursor': 'play'
    }, '<span class="dk-radio__play-icon" aria-hidden="true"></span>');
    transport.appendChild(playBtn);

    var meta = DK.dom.el('div', { class: 'dk-radio__meta' });
    var nowName = DK.dom.el('span', { class: 'dk-radio__now-name' }, esc(stations[0].name));
    var nowGenre = DK.dom.el('span', { class: 'dk-radio__now-genre' }, esc(stations[0].genre || ''));
    meta.appendChild(DK.dom.el('span', { class: 'dk-radio__now-label' }, 'Now playing'));
    meta.appendChild(nowName);
    meta.appendChild(nowGenre);
    transport.appendChild(meta);

    var volWrap = DK.dom.el('label', { class: 'dk-radio__vol' });
    volWrap.appendChild(DK.dom.el('span', { class: 'dk-radio__vol-icon', 'aria-hidden': 'true', text: 'Vol' }));
    var vol = DK.dom.el('input', {
      type: 'range', min: '0', max: '100', value: '70',
      class: 'dk-radio__volume', 'aria-label': 'Volume'
    });
    volWrap.appendChild(vol);
    transport.appendChild(volWrap);

    var status = DK.dom.el('p', { class: 'dk-radio__status', role: 'status' },
      esc((cfg.settings && cfg.settings.radio && cfg.settings.radio.blockedHint) ||
          'Press play to start the stream'));
    transport.appendChild(status);

    deck.appendChild(transport);
    body.appendChild(deck);

    // ---- station list ----
    var list = DK.dom.el('ul', { class: 'dk-radio__list' });
    stations.forEach(function (st, i) {
      var li = DK.dom.el('li', { class: 'dk-radio__station' });
      var btn = DK.dom.el('button', {
        type: 'button',
        class: 'dk-radio__station-btn',
        'data-index': String(i),
        'data-cursor': 'label',
        'data-cursor-label': 'Play'
      });
      var dot = DK.dom.el('span', { class: 'dk-radio__station-dot', 'aria-hidden': 'true' });
      dot.style.background = st.color || 'var(--dk-accent)';
      btn.appendChild(dot);
      btn.appendChild(DK.dom.el('span', { class: 'dk-radio__station-name' }, esc(st.name)));
      btn.appendChild(DK.dom.el('span', { class: 'dk-radio__station-genre' }, esc(st.genre || '')));
      li.appendChild(btn);
      list.appendChild(li);
    });
    body.appendChild(list);
    inner.appendChild(body);
    wrap.appendChild(inner);

    // stash references for the controller
    wrap._radio = { stations: stations, canvas: canvas, playBtn: playBtn,
                    nowName: nowName, nowGenre: nowGenre, status: status,
                    volume: vol, list: list, vis: cfgVis };
    return wrap;
  }
/* ------------------------------------------------------------- visualizer */

  /**
   * Canvas visualiser. Supports 'wave', 'bars', 'ribbon' and 'orbit' styles.
   * Uses real analyser data when the stream allows it, and otherwise
   * synthesises a plausible spectrum so the player never looks dead.
   */
  function Visualizer(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    this.opts = opts || {};
    this.style = this.opts.style || 'wave';
    this.bars = Math.max(16, Math.min(128, Number(this.opts.bars) || 64));
    this.color = this.opts.color || '#31e0a1';
    this.color2 = this.opts.color2 || '#6c8cff';
    this.smoothing = this.opts.smoothing === undefined ? 0.82 : this.opts.smoothing;
    this.levels = new Float32Array(this.bars);
    this.analyser = null;
    this.freqData = null;
    this.timeData = null;
    this.live = false;              // true when driven by real audio data
    this.playing = false;
    this.stop = null;
    this.dpr = Math.min(2, global.devicePixelRatio || 1);
    this.resize();
  }

  Visualizer.prototype.resize = function () {
    if (!this.canvas) return;
    var rect = this.canvas.getBoundingClientRect();
    var w = rect.width || 600, h = rect.height || 220;
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
    this.w = w;
    this.h = h;
  };

  /** Attach a live analyser; falls back to simulation when absent. */
  Visualizer.prototype.attachAnalyser = function (analyser) {
    this.analyser = analyser || null;
    if (!analyser) { this.live = false; return; }
    this.freqData = new Uint8Array(analyser.frequencyBinCount || 1024);
    this.timeData = new Uint8Array(analyser.fftSize || 2048);
  };

  /** Advance the smoothing and gather the next frame of levels. */
  Visualizer.prototype.sample = function () {
    var i, j;
    if (this.live && this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      var step = Math.floor(this.freqData.length / this.bars) || 1;
      for (i = 0; i < this.bars; i++) {
        var sum = 0;
        for (j = 0; j < step; j++) sum += this.freqData[i * step + j] || 0;
        var v = (sum / step) / 255;
        // Tilt the curve so highs stay visible instead of a flat wall.
        v = Math.pow(v, 0.78) * (0.55 + 0.9 * (1 - i / this.bars));
        this.levels[i] += (v - this.levels[i]) * (1 - this.smoothing * 0.35);
      }
      return;
    }

    // Simulated spectrum: layered sines with a travelling peak.
    var t = this._t = (this._t || 0) + 0.016;
    var energy = this.playing ? 1 : 0.28;
    for (i = 0; i < this.bars; i++) {
      var x = i / this.bars;
      var base = Math.exp(-x * 2.1);
      var wob = Math.sin(t * 2.1 + i * 0.33) * 0.5 +
                Math.sin(t * 3.7 + i * 0.11) * 0.3 +
                Math.sin(t * 1.3 + i * 0.05) * 0.2;
      var v = Math.max(0.02, base * (0.45 + wob * 0.55) * energy);
      this.levels[i] += (v - this.levels[i]) * 0.2;
    }
  };

  Visualizer.prototype.draw = function () {
    var c = this.ctx;
    if (!c) return;
    var w = this.w, h = this.h;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    var g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, this.color);
    g.addColorStop(1, this.color2);
    this.grad = g;

    if (this.style === 'bars') this.drawBars();
    else if (this.style === 'ribbon') this.drawRibbon();
    else if (this.style === 'orbit') this.drawOrbit();
    else this.drawWave();
  };

  /**
   * Ribbon: a wave that grows out of the centre line. The envelope peaks at
   * the middle of the canvas and tapers to the edges, and the phase travels
   * outward from the centre, so the trace reads as two waves being emitted
   * left and right from the middle.
   */
  Visualizer.prototype.drawRibbon = function () {
    var c = this.ctx, w = this.w, h = this.h, n = this.bars;
    var mid = h / 2, cx = w / 2;
    var t = this._t = (this._t || 0) + 0.016;

    function envelope(x) {
      var d = Math.abs(x - cx) / cx;          // 0 at centre, 1 at the edges
      return Math.max(0, 1 - d * d);           // smooth falloff
    }

    var steps = Math.max(2, Math.floor(w / 4));
    var top = [], bottom = [];
    for (var i = 0; i <= steps; i++) {
      var px = (i / steps) * w;
      var idx = Math.min(n - 1, Math.floor((Math.abs(px - cx) / cx) * (n - 1) || 0));
      var amp = this.levels[idx] * mid * 0.85;
      // Phase runs outward from the centre in both directions.
      var phase = Math.abs(px - cx) * 0.045 - t * 3.2;
      var y = Math.sin(phase) * amp * envelope(px);
      top.push(px, mid - y);
      bottom.push(px, mid + y);
    }

    c.beginPath();
    for (var j = 0; j < top.length; j += 2) {
      if (j === 0) c.moveTo(top[j], top[j + 1]); else c.lineTo(top[j], top[j + 1]);
    }
    for (var k = bottom.length - 2; k >= 0; k -= 2) c.lineTo(bottom[k], bottom[k + 1]);
    c.closePath();
    c.globalAlpha = 0.22;
    c.fillStyle = this.grad;
    c.fill();
    c.globalAlpha = 1;

    c.strokeStyle = this.grad;
    c.lineWidth = 2.5;
    c.lineJoin = 'round';
    [top, bottom].forEach(function (pts) {
      c.beginPath();
      for (var i2 = 0; i2 < pts.length; i2 += 2) {
        if (i2 === 0) c.moveTo(pts[i2], pts[i2 + 1]); else c.lineTo(pts[i2], pts[i2 + 1]);
      }
      c.stroke();
    });
  };

  Visualizer.prototype.drawBars = function () {
    var c = this.ctx, w = this.w, h = this.h, n = this.bars;
    var gap = Math.max(1, (w / n) * 0.28);
    var bw = Math.max(1, (w - gap * (n - 1)) / n);
    var mid = h / 2;
    c.fillStyle = this.grad;
    for (var i = 0; i < n; i++) {
      var v = Math.min(1, Math.max(0, this.levels[i]));
      var bh = Math.max(2, v * h * 0.92);
      var x = i * (bw + gap);
      c.globalAlpha = 0.25 + v * 0.75;
      c.beginPath();
      if (c.roundRect) c.roundRect(x, mid - bh / 2, bw, bh, Math.min(3, bw / 2));
      else c.rect(x, mid - bh / 2, bw, bh);
c.fill();
    }
    c.globalAlpha = 1;
  };

  Visualizer.prototype.drawWave = function () {
    var c = this.ctx, w = this.w, h = this.h, n = this.bars;
    var mid = h / 2;

    if (this.live && this.analyser && this.timeData) {
      this.analyser.getByteTimeDomainData(this.timeData);
      c.lineWidth = 2;
      c.strokeStyle = this.grad;
      c.beginPath();
      var stepT = Math.floor(this.timeData.length / w) || 1;
      for (var x = 0, i = 0; x < w; x++, i += stepT) {
        var v = ((this.timeData[i] || 128) - 128) / 128;
        var y = mid + v * mid * 0.86;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.lineTo(w, mid); c.lineTo(0, mid); c.closePath();
      c.globalAlpha = 0.18;
      c.fillStyle = this.grad;
      c.fill();
      c.globalAlpha = 1;
      return;
    }

    // Simulated ribbon built from the smoothed levels.
    var stepX = Math.max(2, Math.floor(w / (n * 1.6)));
    c.beginPath();
    for (var px = 0; px <= w; px += stepX) {
      var idx = Math.min(n - 1, Math.floor((px / w) * n));
      var amp = this.levels[idx] * mid * 0.8;
      var y = mid - Math.abs(Math.sin(px * 0.02)) * amp;
      if (px === 0) c.moveTo(px, y); else c.lineTo(px, y);
    }
    c.strokeStyle = this.grad;
    c.lineWidth = 2.5;
    c.lineJoin = 'round';
    c.stroke();
    c.lineTo(w, mid); c.lineTo(0, mid); c.closePath();
    c.globalAlpha = 0.2;
    c.fillStyle = this.grad;
    c.fill();
    c.globalAlpha = 1;
  };

  Visualizer.prototype.drawOrbit = function () {
    var c = this.ctx, w = this.w, h = this.h, n = this.bars;
    var cx = w / 2, cy = h / 2;
    var radius = Math.min(w, h) * 0.3;

    c.strokeStyle = this.grad;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.25;
    c.beginPath(); c.arc(cx, cy, radius, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;

    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      var v = Math.min(1, Math.max(0, this.levels[i]));
      var len = radius * 0.25 + v * radius * 0.95;
      c.strokeStyle = this.grad;
      c.globalAlpha = 0.35 + v * 0.65;
      c.lineWidth = 1 + v * 3;
      c.beginPath();
      c.moveTo(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
      c.lineTo(cx + Math.cos(ang) * (radius + len), cy + Math.sin(ang) * (radius + len));
      c.stroke();
    }
    c.globalAlpha = 1;
  };

  Visualizer.prototype.start = function () {
    if (this.stop) return;
    var self = this;
    this.stop = DK.dom.raf(function () {
      self.sample();
      self.draw();
    });
  };

  Visualizer.prototype.destroy = function () {
    if (this.stop) this.stop();
    this.stop = null;
  };

  /* -------------------------------------------------------------- controller */

  /**
   * Wire up a rendered radio section.
   * @param {HTMLElement} section  element produced by markup()
   */
  function mount(section) {
    var refs = section._radio;
    if (!refs) return null;

    var viz = new Visualizer(refs.canvas, refs.vis || {});
    var audio = new Audio();
    audio.preload = 'none';

    var current = -1;
    var audioCtx = null;
    var analyserNode = null;
    var gainNode = null;
    var mediaSource = null;

    function setStatus(text, tone) {
      refs.status.textContent = text;
      refs.status.className = 'dk-radio__status' + (tone ? ' is-' + tone : '');
    }

    function setNowPlaying(station) {
      refs.nowName.textContent = station.name;
      refs.nowGenre.textContent = station.genre || '';
      DK.dom.qsa('.dk-radio__station-btn', refs.list).forEach(function (b) {
        b.classList.toggle('is-playing', current >= 0 && b.dataset.index === String(current));
      });
    }

    /**
     * Build the Web Audio analysis chain.
     * Most public radio streams do not send CORS headers, which makes the
     * graph unusable; in that case we fall back to the simulated visualiser
     * and simply play through the media element.
     */
    function setupAnalysis() {
      var Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor || mediaSource) return !!mediaSource;
      try {
        audioCtx = new Ctor();
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;
        analyserNode.smoothingTimeConstant = 0.78;
        gainNode = audioCtx.createGain();
        gainNode.gain.value = Number(refs.volume.value) / 100;
        analyserNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        mediaSource = audioCtx.createMediaElementSource(audio);
        mediaSource.connect(analyserNode);
        return true;
      } catch (e) {
        mediaSource = null;
        analyserNode = null;
        viz.attachAnalyser(null);
        return false;
      }
    }

    function playIndex(i) {
      if (!refs.stations[i]) return;
      current = i;
      var station = refs.stations[i];
      setNowPlaying(station);

      var analysed = setupAnalysis();
      audio.crossOrigin = analysed ? 'anonymous' : null;
      audio.src = station.url;

      setStatus('Connecting to ' + station.name + 'â€¦');
      var p;
      try { p = audio.play(); } catch (e) { p = Promise.reject(e); }
      if (p && p.catch) {
        p.catch(function () {
          setStatus('Could not start the stream. Check the URL or try again.', 'error');
          if (DK.sound) DK.sound.play('error');
        });
      }

      viz.playing = true;
      viz.attachAnalyser(analysed ? analyserNode : null);
      viz.live = !!analysed;
      section.classList.add('is-playing');
      refs.playBtn.setAttribute('aria-label', 'Pause radio');
      if (DK.sound) DK.sound.play('radioOn');
    }

    function pause() {
      try { audio.pause(); } catch (e) { /* ignore */ }
      viz.playing = false;
      section.classList.remove('is-playing');
      refs.playBtn.setAttribute('aria-label', 'Play radio');
      setStatus('Paused');
      if (DK.sound) DK.sound.play('radioOff');
    }

    function toggle() {
      if (audio.paused) {
        if (current < 0) {
          var preferred = refs.stations.findIndex(function (s) { return s.id === refs.defaultStation; });
          playIndex(preferred >= 0 ? preferred : 0);
        } else {
          var p;
          try { p = audio.play(); } catch (e) { p = null; }
          if (p && p.catch) p.catch(function () { playIndex(current); });
          viz.playing = true;
          section.classList.add('is-playing');
          setStatus('Playing');
        }
      } else {
        pause();
      }
    }

    refs.playBtn.addEventListener('click', toggle);

    refs.list.addEventListener('click', function (e) {
      var btn = e.target.closest('.dk-radio__station-btn');
      if (!btn) return;
      var idx = Number(btn.dataset.index);
      if (idx === current && !audio.paused) pause();
      else playIndex(idx);
    });

    refs.volume.addEventListener('input', function () {
      var v = Number(refs.volume.value) / 100;
      audio.volume = v;
      if (gainNode) gainNode.gain.value = v;
    });
    audio.volume = Number(refs.volume.value) / 100;

    audio.addEventListener('playing', function () { setStatus('Playing'); });
    audio.addEventListener('waiting', function () { setStatus('Bufferingâ€¦'); });
    audio.addEventListener('error', function () {
      setStatus('Stream unavailable. Check the station URL.', 'error');
      viz.playing = false;
      section.classList.remove('is-playing');
    });

    // Pause when the radio scrolls out of view to save bandwidth.
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          section.classList.toggle('is-offscreen', !e.isIntersecting);
          if (!e.isIntersecting && !audio.paused) audio.pause();
        });
      }, { threshold: 0.15 }).observe(section);
    }

    // Only animate the visualiser while the section is on screen.
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) viz.start();
          else if (viz.stop) { viz.stop(); viz.stop = null; }
        });
      }, { threshold: 0 }).observe(section);
    } else {
      viz.start();
    }

    var onResize = function () { viz.resize(); };
    global.addEventListener('resize', onResize);

    // Reflect the configured default station on the button.
    if (refs.defaultStation) {
      var di = refs.stations.findIndex(function (s) { return s.id === refs.defaultStation; });
      if (di >= 0) { current = di; setNowPlaying(refs.stations[di]); }
    }

    section._controller = {
      play: function () { if (current < 0) playIndex(0); else { try { audio.play(); } catch (e) { playIndex(current); } } },
      pause: pause,
      toggle: toggle,
      station: function (id) {
        var i = refs.stations.findIndex(function (s) { return s.id === id; });
        if (i >= 0) playIndex(i);
      },
      audio: audio,
      visualizer: viz,
      destroy: function () {
        global.removeEventListener('resize', onResize);
        viz.destroy();
        try { audio.pause(); } catch (e) { /* ignore */ }
      },
      get playing() { return !audio.paused; }
    };
    return section._controller;
  }

  DK.radio = { markup: markup, mount: mount, Visualizer: Visualizer };

})(typeof window !== 'undefined' ? window : this);
