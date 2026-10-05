/* ==========================================================================
   DK — parallax.js
   Multi-layer scroll parallax for the hero, plus shared reveal-on-scroll and
   section-spy behaviour used across the whole page.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});

  /**
   * Build the hero backdrop layers into a host element.
   * @param {HTMLElement} host
   * @param {Array} layers from DK.foliage.heroLayers
   */
  function mountLayers(host, layers) {
    layers.forEach(function (layer) {
      var el = DK.dom.el('div', {
        class: 'dk-layer',
        'data-layer': layer.name,
        'data-speed': String(layer.speed)
      });
      el.style.opacity = String(layer.opacity === undefined ? 1 : layer.opacity);
      el.innerHTML = layer.html;
      host.appendChild(el);
    });
  }

  /**
   * Attach scroll + pointer parallax to a container.
   * One rAF loop with eased values keeps movement smooth on every device.
   */
  function attachParallax(scope, opts) {
    opts = opts || {};
    var layers = DK.dom.qsa('.dk-layer[data-speed]', scope);
    if (!layers.length) return function () {};

    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var strength = opts.strength === undefined ? 1 : opts.strength;
    var items = layers.map(function (el) {
      return { el: el, speed: parseFloat(el.dataset.speed) || 0.1 };
    });

    var pointerX = 0, pointerY = 0, curPX = 0, curPY = 0;
    var scrollY = 0, curScroll = 0;
    var stopRaf = null;
    var bound = false;

    function onScroll() { scrollY = global.scrollY || 0; }
    function onPointer(e) {
      var w = global.innerWidth || 1, h = global.innerHeight || 1;
      pointerX = (e.clientX / w - 0.5) * 2;
      pointerY = (e.clientY / h - 0.5) * 2;
    }
    function onLeave() { pointerX = 0; pointerY = 0; }

    function unbind() {
      global.removeEventListener('scroll', onScroll);
      global.removeEventListener('pointermove', onPointer);
      document.removeEventListener('mouseleave', onLeave);
      bound = false;
    }
    function onMove() {
      if (bound || reduced) return;
      bound = true;
      global.addEventListener('scroll', onScroll, { passive: true });
      if (global.matchMedia('(pointer: fine)').matches) {
        global.addEventListener('pointermove', onPointer, { passive: true });
        document.addEventListener('mouseleave', onLeave);
      }
    }

    // Only run the loop while the hero is actually visible.
    var observer = null;
    if (global.IntersectionObserver && scope) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) onMove();
          else if (bound) unbind();
        });
      }, { threshold: 0 });
      observer.observe(scope);
    } else {
      onMove();
    }

    stopRaf = DK.dom.raf(function () {
      curPX += (pointerX - curPX) * 0.06;
      curPY += (pointerY - curPY) * 0.06;
      curScroll += (scrollY - curScroll) * 0.12;

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        // Scroll moves layers vertically at their own rate; the pointer adds
        // a small depth offset on top.
        var y = curScroll * it.speed * strength + curPY * it.speed * 26 * strength;
        var x = curPX * it.speed * 40 * strength;
        it.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
      }
    });

    return function () {
      if (stopRaf) stopRaf();
      if (observer) observer.disconnect();
      unbind();
    };
  }
/* ------------------------------------------------------- reveal on scroll */

  /** Fade/slide elements in as they enter the viewport. */
  function observeReveals(root) {
    var nodes = DK.dom.qsa('[data-reveal]:not(.is-revealed)', root);
    if (!nodes.length) return;

    if (!global.IntersectionObserver) {
      nodes.forEach(function (n) { n.classList.add('is-revealed'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var delay = parseFloat(el.dataset.revealDelay || 0);
        setTimeout(function () { el.classList.add('is-revealed'); }, delay * 1000);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    nodes.forEach(function (n) { io.observe(n); });
  }

  /** Smooth in-page scrolling that respects the reduced-motion setting. */
  function scrollTo(target, offset) {
    var el = typeof target === 'string' ? DK.dom.qs(target) : target;
    if (!el) return;
    var top = el.getBoundingClientRect().top + global.scrollY - (offset === undefined ? 80 : offset);
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    global.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------ section spy */

  /** Highlight the nav entry for the section currently in view. */
  function spySections(navLinks) {
    if (!global.IntersectionObserver || !navLinks.length) return;
    var map = {};
    navLinks.forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && href.charAt(0) === '#' && href.length > 1) map[href.slice(1)] = a;
    });
    var sections = Object.keys(map)
      .map(function (id) { return DK.dom.qs('#' + CSS.escape(id)); })
      .filter(Boolean);
    if (!sections.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var link = map[e.target.id];
        if (!link || !e.isIntersecting) return;
        navLinks.forEach(function (l) { l.classList.remove('is-active'); });
        link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (s) { io.observe(s); });
  }

  DK.parallax = {
    mountLayers: mountLayers,
    attach: attachParallax,
    observeReveals: observeReveals,
    scrollTo: scrollTo,
    spySections: spySections
  };

})(typeof window !== 'undefined' ? window : this);