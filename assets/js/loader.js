/* ==========================================================================
   DK — loader.js
   The animated intro. Foliage closes over the screen, the DK monogram draws
   itself in the centre, then the leaves part to reveal the hero. Everything
   is procedural and honours the duration configured in the dashboard.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});
  var esc = DK.esc;

  /**
   * Build the loader DOM.
   * @param {object} cfg branding + settings.preloader from the content doc
   */
  function buildLoader(cfg) {
    var pre = cfg.preloader || {};
    var branding = cfg.branding || {};
    var siteLogo = branding.siteLogo || {};
    var mark = branding.loaderMark || siteLogo.alt || 'DK';

    var wrap = DK.dom.el('div', {
      id: 'dk-loader',
      class: 'dk-loader',
      role: 'progressbar',
      'aria-label': 'Loading site',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0'
    });

    wrap.appendChild(DK.dom.el('div', { class: 'dk-loader-bg', 'aria-hidden': 'true' }));

    // The closing / opening leaf shutters.
    wrap.appendChild(DK.dom.el('div', { class: 'dk-loader-shutter dk-loader-shutter--t', 'aria-hidden': 'true' }));
    wrap.appendChild(DK.dom.el('div', { class: 'dk-loader-shutter dk-loader-shutter--b', 'aria-hidden': 'true' }));

    var centre = DK.dom.el('div', { class: 'dk-loader-centre' });

    if (siteLogo.src) {
      centre.appendChild(DK.dom.el('img', {
        class: 'dk-loader-logo',
        src: DK.mediaSrc(siteLogo.src),
        alt: esc(siteLogo.alt || mark),
        style: 'height:' + (siteLogo.height ? Math.round(siteLogo.height * 0.6) : 90) + 'px'
      }));
    } else {
      centre.appendChild(DK.dom.el('div', {
        class: 'dk-loader-mark',
        'data-mark': esc(mark),
        'aria-label': esc(mark)
      }, '<span class="dk-loader-mark__text">' + esc(mark) + '</span>'));
    }

    if (pre.tagline) {
      centre.appendChild(DK.dom.el('p', { class: 'dk-loader-tagline' }, esc(pre.tagline)));
    }

    var bar = DK.dom.el('div', { class: 'dk-loader-bar' });
    bar.appendChild(DK.dom.el('span', { class: 'dk-loader-bar__fill' }));
    centre.appendChild(bar);

    if (pre.showPercent) {
      centre.appendChild(DK.dom.el('span', { class: 'dk-loader-percent' }, '0%'));
    }
    wrap.appendChild(centre);

    if (pre.skipButton) {
      var skip = DK.dom.el('button', {
        type: 'button',
        class: 'dk-loader-skip',
        'aria-label': 'Skip intro'
      }, 'Skip intro');
      skip.addEventListener('click', function () {
        if (DK.sound) DK.sound.play('click');
        wrap.dispatchEvent(new CustomEvent('dk:skip', { bubbles: true }));
      });
      wrap.appendChild(skip);
    }

    return wrap;
  }
/* ---------------------------------------------------------------- runtime */

  /**
   * Run the intro.
   * @param {object} cfg { preloader, branding, site }
   * @returns {Promise} resolves when the loader has finished
   */
  function run(cfg) {
    cfg = cfg || {};
    var pre = cfg.preloader || {};
    var duration = Math.max(500, Number(pre.duration) || 10000);
    var doc = document;

    return new Promise(function (resolve) {
      if (pre.enabled === false) { resolve({ skipped: true }); return; }

      // Respect users who asked for less motion: a short, calm version.
      var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) duration = Math.min(duration, 1200);

      var node = buildLoader({ preloader: pre, branding: cfg.branding, site: cfg.site });
      doc.body.appendChild(node);
      doc.documentElement.classList.add('dk-loading');

      // Populate the procedural foliage behind the monogram.
      var layers = DK.foliage.loaderLayers({
        deep: '#04160f',
        accent: (cfg.site && cfg.site.accent) || '#2ef2c8',
        accent2: (cfg.site && cfg.site.accent2) || '#2b7fff'
      });
      var bg = node.querySelector('.dk-loader-bg');
      layers.forEach(function (layer, i) {
        var div = DK.dom.el('div', { class: 'dk-loader-layer', 'data-layer': layer.name });
        div.innerHTML = layer.html;
        div.style.opacity = i === 0 ? '0.9' : '1';
        bg.appendChild(div);
      });

      var fill = node.querySelector('.dk-loader-bar__fill');
      var pct = node.querySelector('.dk-loader-percent');
      var started = performance.now();
      var hiddenFor = 0;
      var finished = false;
      var rafId = null;

      function cleanup() {
        if (rafId) cancelAnimationFrame(rafId);
        node.removeEventListener('dk:skip', onSkip);
        doc.removeEventListener('visibilitychange', onVis);
        clearTimeout(hardStop);
      }

      function onSkip() { finish(true); }

      // Pause the countdown while the tab is hidden so returning doesn't
      // land the visitor on an already-finished intro.
      function onVis() {
        if (doc.hidden) hiddenFor = performance.now();
        else if (hiddenFor) { started += performance.now() - hiddenFor; hiddenFor = 0; }
      }

      var hardStop = setTimeout(function () { finish(false); }, duration + 5000);

      function finish(skipped) {
        if (finished) return;
        finished = true;
        cleanup();
        node.classList.add('is-done');
        doc.documentElement.classList.remove('dk-loading');

        setTimeout(function () {
          node.remove();
          if (DK.sound && !skipped) DK.sound.play('reveal');
          doc.documentElement.classList.add('dk-loaded');
          resolve({ skipped: !!skipped });
        }, skipped ? 260 : 900);
      }

      function tick(now) {
        if (finished) return;
        var t = Math.min(1, (now - started) / duration);
        var eased = 1 - Math.pow(1 - t, 1.8);   // decelerate near the end
        if (fill) fill.style.transform = 'scaleX(' + eased.toFixed(4) + ')';
        if (pct) pct.textContent = Math.round(eased * 100) + '%';
        node.setAttribute('aria-valuenow', String(Math.round(eased * 100)));

        // Phase classes drive the CSS choreography.
        if (t > 0.12) node.classList.add('is-marking');
        if (t > 0.45) node.classList.add('is-marked');
        if (t > 0.86) node.classList.add('is-parting');

        if (t >= 1) { finish(false); return; }
        rafId = requestAnimationFrame(tick);
      }

      node.addEventListener('dk:skip', onSkip);
      doc.addEventListener('visibilitychange', onVis);

      requestAnimationFrame(function () {
        node.classList.add('is-active');
        rafId = requestAnimationFrame(tick);
      });
    });
  }

  DK.loader = {
    run: run,
    build: buildLoader,
    /** Exposed so the dashboard can preview the intro markup. */
    markup: function (cfg) { return buildLoader(cfg).outerHTML; }
  };

})(typeof window !== 'undefined' ? window : this);