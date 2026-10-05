/* ==========================================================================
   DK â€” site.js
   Renders the whole front page from the content document and wires up the
   interactions: nav, filtering, lightbox, video players and the radio.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});
  var esc = DK.esc;

  /** Palette object handed to the procedural art. */
  function palette(doc) {
    var s = doc.site || {};
    return { deep: '#04160f', mid: '#062417', accent: s.accent || '#2ef2c8', accent2: s.accent2 || '#2b7fff' };
  }

  /** Placeholder image URL for an item that has no uploaded media. */
  function fallback(kind, seed, w, h, doc) {
    return DK.foliage.placeholderUri(kind, seed, w, h, palette(doc));
  }

  /** Resolve an image field, falling back to generated artwork. */
  function img(value, kind, seed, w, h, doc, cls) {
    var src = DK.mediaSrc(DK.safeMedia(value));
    if (!src) src = fallback(kind, seed, w, h, doc);
    return '<img class="' + (cls || 'dk-img') + '" src="' + esc(src) + '" alt="' + esc(seed || '') +
      '" loading="lazy" decoding="async">';
  }

  /** Section header shared by most sections. */
  function sectionHead(cfg, id) {
    return '<div class="dk-section__head" data-reveal>' +
      '<p class="dk-kicker">' + esc(cfg.kicker || '') + '</p>' +
      '<h2 class="dk-section__title" id="' + esc(id) + '-title">' + esc(cfg.title || '') + '</h2>' +
      (cfg.blurb ? '<p class="dk-section__blurb">' + esc(cfg.blurb) + '</p>' : '') +
    '</div>';
  }

  /* ------------------------------------------------------------------- hero */

  function renderHero(doc) {
    var hero = doc.hero || {};
    var branding = doc.branding || {};
    var siteLogo = branding.siteLogo || {};

    var sec = DK.dom.el('section', { id: 'top', class: 'dk-hero' });

    var backdrop = DK.dom.el('div', { class: 'dk-hero__backdrop', 'aria-hidden': 'true' });
    sec.appendChild(backdrop);
    DK.parallax.mountLayers(backdrop, DK.foliage.heroLayers(palette(doc)));

    sec.appendChild(DK.dom.el('div', { class: 'dk-hero__scrim', 'aria-hidden': 'true' }));

    var inner = DK.dom.el('div', { class: 'dk-container dk-hero__inner' });

    if (hero.eyebrow) {
      inner.appendChild(DK.dom.el('p', {
        class: 'dk-hero__eyebrow', 'data-reveal': '', 'data-reveal-delay': '0.05'
      }, esc(hero.eyebrow)));
    }

    // Site identity logo, optionally shown in the hero.
    if (siteLogo.src && siteLogo.showInHero !== false) {
      var logo = DK.dom.el('img', {
        class: 'dk-hero__logo',
        src: DK.mediaSrc(siteLogo.src),
        alt: esc(siteLogo.alt || doc.site.name),
        style: 'height:' + Math.round(siteLogo.height || 150) + 'px'
      });
      logo.setAttribute('data-reveal', '');
      logo.setAttribute('data-reveal-delay', '0.15');
      inner.appendChild(logo);
    }

    var h1 = DK.dom.el('h1', { class: 'dk-hero__title' });
    h1.innerHTML = '<span class="dk-hero__title-main" data-reveal data-reveal-delay="0.1">' +
      esc(hero.title || doc.site.name) + '</span>' +
      (hero.titleAccent ? '<span class="dk-hero__title-accent" data-reveal data-reveal-delay="0.25">' +
        esc(hero.titleAccent) + '</span>' : '');
    inner.appendChild(h1);

    if (hero.subtitle) {
      inner.appendChild(DK.dom.el('p', {
        class: 'dk-hero__subtitle', 'data-reveal': '', 'data-reveal-delay': '0.35'
      }, esc(hero.subtitle)));
    }

    var ctas = DK.dom.el('div', { class: 'dk-hero__ctas', 'data-reveal': '', 'data-reveal-delay': '0.45' });
    if (hero.ctaText) {
      ctas.appendChild(DK.dom.el('a', {
        class: 'dk-btn dk-btn--primary', href: hero.ctaHref || '#work',
        'data-cursor': 'label', 'data-cursor-label': 'Go'
      }, esc(hero.ctaText)));
    }
    if (hero.secondaryText) {
      ctas.appendChild(DK.dom.el('button', {
        type: 'button', class: 'dk-btn dk-btn--ghost',
        'data-action': 'play-radio', 'data-cursor': 'play'
      }, '<span class="dk-radio__play-icon" aria-hidden="true"></span>' + esc(hero.secondaryText)));
    }
    inner.appendChild(ctas);

    if (Array.isArray(hero.stats) && hero.stats.length) {
      var stats = DK.dom.el('ul', { class: 'dk-hero__stats', 'data-reveal': '', 'data-reveal-delay': '0.55' });
      hero.stats.forEach(function (s) {
        stats.appendChild(DK.dom.el('li', { class: 'dk-hero__stat' },
          '<strong>' + esc(s.value) + '</strong><span>' + esc(s.label) + '</span>'));
      });
      inner.appendChild(stats);
    }

    sec.appendChild(inner);

    if (doc.settings.hero.scrollHint !== false) {
      sec.appendChild(DK.dom.el('a', {
        class: 'dk-hero__scroll', href: '#about', 'aria-label': 'Scroll to content',
        'data-cursor': 'label', 'data-cursor-label': 'Scroll'
      }, '<span class="dk-hero__scroll-line" aria-hidden="true"></span>' +
         '<span class="dk-hero__scroll-text">Scroll</span>'));
    }
    return sec;
  }
/* ------------------------------------------------------------------ about */

  function renderAbout(doc) {
    var a = doc.about || {};
    var sec = DK.dom.el('section', { id: 'about', class: 'dk-section dk-about' });
    var inner = DK.dom.el('div', { class: 'dk-container dk-about__inner' });

    var text = DK.dom.el('div', { class: 'dk-about__text' });
    text.innerHTML = sectionHead({ kicker: 'About', title: a.title, blurb: a.body }, 'about');
    if (Array.isArray(a.skills) && a.skills.length) {
      var ul = DK.dom.el('ul', { class: 'dk-about__skills' });
      a.skills.forEach(function (s, i) {
        ul.appendChild(DK.dom.el('li', {
          'data-reveal': '', 'data-reveal-delay': String(0.05 * (i + 1))
        }, esc(s)));
      });
      text.appendChild(ul);
    }
    if (a.clients) {
      text.appendChild(DK.dom.el('p', { class: 'dk-about__clients', 'data-reveal': '' },
        '<span class="dk-about__clients-label">Selected clients</span>' + esc(a.clients)));
    }
    inner.appendChild(text);

    var media = DK.dom.el('div', { class: 'dk-about__media', 'data-reveal': '', 'data-reveal-delay': '0.2' });
    media.innerHTML = img(a.image, 'photo', 'about', 1200, 1500, doc, 'dk-img dk-img--tall');
    inner.appendChild(media);

    sec.appendChild(inner);
    return sec;
  }

  /* ------------------------------------------------------------ filter bar */

  /**
   * Category filter shared by the logo, graphic, photo and video sections.
   * @param {string} scope collection key, used as the filter scope
   */
  function filterBar(scope, items, label) {
    var cats = [];
    items.forEach(function (it) {
      if (it.category && cats.indexOf(it.category) === -1) cats.push(it.category);
    });
    if (!cats.length) return null;

    var bar = DK.dom.el('div', { class: 'dk-filters', role: 'group', 'aria-label': label || 'Filter' });
    bar.appendChild(DK.dom.el('button', {
      type: 'button', class: 'dk-filter is-active', 'data-filter': '*', 'data-scope': scope
    }, 'All'));
    cats.forEach(function (c) {
      bar.appendChild(DK.dom.el('button', {
        type: 'button', class: 'dk-filter', 'data-filter': esc(c), 'data-scope': scope
      }, esc(c)));
    });
    return bar;
  }

  /* ------------------------------------------------------------------ logos */

  function renderLogos(doc) {
    var cfg = doc.sections.logos || {};
    if (cfg.enabled === false) return null;
    var items = (doc.collections.logos || []).slice();
    if (cfg.limit) items = items.slice(0, Number(cfg.limit));

    var sec = DK.dom.el('section', { id: 'logos', class: 'dk-section dk-logos' });
    var inner = DK.dom.el('div', { class: 'dk-container' });
    inner.innerHTML = sectionHead(cfg, 'logos');

    var bar = filterBar('logos', items);
    if (bar) inner.appendChild(bar);

    var grid = DK.dom.el('div', { class: 'dk-logo-grid' });
    items.forEach(function (item, i) {
      var card = DK.dom.el('article', {
        class: 'dk-logo-card dk-card dk-card--logo', 'data-category': esc(item.category || ''),
        'data-id': esc(item.id), tabindex: '0', role: 'button',
        'data-cursor': 'label', 'data-cursor-label': 'Open'
      });
      card.style.setProperty('--i', String(i % 12));
      card.innerHTML =
        '<div class="dk-logo-card__frame">' +
          img(item.image, 'logo', item.id + item.title, 800, 600, doc, 'dk-logo-card__img') +
        '</div>' +
        '<div class="dk-logo-card__meta">' +
          '<h3 class="dk-card__title">' + esc(item.title) + '</h3>' +
          (item.category ? '<span class="dk-card__cat">' + esc(item.category) + '</span>' : '') +
        '</div>';
      grid.appendChild(card);
    });
    if (!items.length) grid.appendChild(DK.dom.el('p', { class: 'dk-empty' }, 'No logos yet.'));
    inner.appendChild(grid);
    sec.appendChild(inner);
    return sec;
  }

  /* --------------------------------------------------------------- graphics */

  function renderGraphics(doc) {
    var cfg = doc.sections.graphics || {};
    if (cfg.enabled === false) return null;
    var items = doc.collections.graphics || [];

    var sec = DK.dom.el('section', { id: 'work', class: 'dk-section dk-graphics' });
    var inner = DK.dom.el('div', { class: 'dk-container' });
    inner.innerHTML = sectionHead(cfg, 'work');

    var bar = filterBar('graphics', items);
    if (bar) inner.appendChild(bar);

    var grid = DK.dom.el('div', { class: 'dk-grid dk-grid--projects' });
    items.forEach(function (item, i) {
      var cover = item.images && item.images.length ? item.images[0].src : '';
      var card = DK.dom.el('article', {
        class: 'dk-card dk-card--project', 'data-category': esc(item.category || ''),
        'data-id': esc(item.id), tabindex: '0', role: 'button',
        'data-cursor': 'label', 'data-cursor-label': 'Open'
      });
      card.style.setProperty('--i', String(i % 12));
      card.innerHTML =
        '<div class="dk-card__media">' +
          img(cover, 'photo', item.id + item.title, 1200, 900, doc, 'dk-card__img') +
          '<span class="dk-card__badge">' + esc(item.category || 'Project') + '</span>' +
        '</div>' +
        '<div class="dk-card__body">' +
          '<h3 class="dk-card__title">' + esc(item.title) + '</h3>' +
          (item.description ? '<p class="dk-card__desc">' + esc(item.description) + '</p>' : '') +
          '<ul class="dk-card__tags">' +
            (item.tags || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
          '</ul>' +
          (item.year ? '<span class="dk-card__year">' + esc(item.year) + '</span>' : '') +
        '</div>';
      grid.appendChild(card);
    });
    if (!items.length) grid.appendChild(DK.dom.el('p', { class: 'dk-empty' }, 'No projects yet.'));
    inner.appendChild(grid);
    sec.appendChild(inner);
    return sec;
  }
/* ------------------------------------------------------------- photography */

  function renderPhotography(doc) {
    var cfg = doc.sections.photography || {};
    if (cfg.enabled === false) return null;
    var albums = doc.collections.photography || [];

    var sec = DK.dom.el('section', { id: 'photography', class: 'dk-section dk-photo' });
    var inner = DK.dom.el('div', { class: 'dk-container' });
    inner.innerHTML = sectionHead(cfg, 'photography');

    var bar = filterBar('photography', albums);
    if (bar) inner.appendChild(bar);

    var grid = DK.dom.el('div', { class: 'dk-grid dk-grid--albums' });
    albums.forEach(function (album, i) {
      var count = (album.photos || []).length;
      var card = DK.dom.el('article', {
        class: 'dk-card dk-card--album', 'data-category': esc(album.category || ''),
        'data-id': esc(album.id), tabindex: '0', role: 'button',
        'data-cursor': 'label', 'data-cursor-label': 'Open'
      });
      card.style.setProperty('--i', String(i % 12));
      card.innerHTML =
        '<div class="dk-card__media dk-card__media--tall">' +
          img(album.cover, 'photo', album.id + album.title, 1000, 1250, doc, 'dk-card__img') +
          '<span class="dk-card__count">' + count + ' photo' + (count === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div class="dk-card__body">' +
          '<h3 class="dk-card__title">' + esc(album.title) + '</h3>' +
          '<p class="dk-card__meta">' +
            (album.category ? '<span>' + esc(album.category) + '</span>' : '') +
            (album.date ? '<span>' + esc(DK.formatDate(album.date)) + '</span>' : '') +
            (album.location ? '<span>' + esc(album.location) + '</span>' : '') +
          '</p>' +
        '</div>';
      grid.appendChild(card);
    });
    if (!albums.length) grid.appendChild(DK.dom.el('p', { class: 'dk-empty' }, 'No albums yet.'));
    inner.appendChild(grid);
    sec.appendChild(inner);
    return sec;
  }

  /* ------------------------------------------------------------ videography */

  function renderVideography(doc) {
    var cfg = doc.sections.videography || {};
    if (cfg.enabled === false) return null;
    var items = doc.collections.videography || [];

    var sec = DK.dom.el('section', { id: 'videography', class: 'dk-section dk-video' });
    var inner = DK.dom.el('div', { class: 'dk-container' });
    inner.innerHTML = sectionHead(cfg, 'videography');

    var bar = filterBar('videography', items);
    if (bar) inner.appendChild(bar);

    var grid = DK.dom.el('div', { class: 'dk-grid dk-grid--video' });
    items.forEach(function (item, i) {
      var isUpload = item.type === 'upload' && item.url;
      var card = DK.dom.el('article', {
        class: 'dk-card dk-card--video', 'data-category': esc(item.category || ''),
        'data-id': esc(item.id), tabindex: '0', role: 'button', 'data-cursor': 'play'
      });
      card.style.setProperty('--i', String(i % 12));
      card.innerHTML =
        '<div class="dk-card__media">' +
          img(item.poster, 'video', item.id + item.title, 1280, 720, doc, 'dk-card__img') +
          '<span class="dk-card__play" aria-hidden="true"></span>' +
          (item.duration ? '<span class="dk-card__duration">' + esc(item.duration) + '</span>' : '') +
        '</div>' +
        '<div class="dk-card__body">' +
          '<h3 class="dk-card__title">' + esc(item.title) + '</h3>' +
          (item.description ? '<p class="dk-card__desc">' + esc(item.description) + '</p>' : '') +
          '<p class="dk-card__meta">' +
            '<span>' + esc(item.category || 'Film') + '</span>' +
            '<span>' + (isUpload ? 'Uploaded file' : 'External link') + '</span>' +
          '</p>' +
        '</div>';
      grid.appendChild(card);
    });
    if (!items.length) grid.appendChild(DK.dom.el('p', { class: 'dk-empty' }, 'No films yet.'));
    inner.appendChild(grid);
    sec.appendChild(inner);
    return sec;
  }

  /* ----------------------------------------------------------------- journal */

  function renderJournal(doc) {
    var cfg = doc.sections.journal || {};
    if (cfg.enabled === false) return null;
    var posts = (doc.collections.journal || []).filter(function (p) { return p.published !== false; });

    var sec = DK.dom.el('section', { id: 'journal', class: 'dk-section dk-journal' });
    var inner = DK.dom.el('div', { class: 'dk-container' });
    inner.innerHTML = sectionHead(cfg, 'journal');

    var grid = DK.dom.el('div', { class: 'dk-grid dk-grid--posts' });
    posts.forEach(function (post, i) {
      var card = DK.dom.el('article', {
        class: 'dk-card dk-card--post', 'data-id': esc(post.id),
        tabindex: '0', role: 'button', 'data-cursor': 'label', 'data-cursor-label': 'Read'
      });
      card.style.setProperty('--i', String(i % 12));
      card.innerHTML =
        (post.cover ? '<div class="dk-card__media dk-card__media--short">' +
          img(post.cover, 'photo', post.id + post.title, 1200, 700, doc, 'dk-card__img') +
          '</div>' : '') +
        '<div class="dk-card__body">' +
          '<time class="dk-card__date">' + esc(DK.formatDate(post.date)) + '</time>' +
          '<h3 class="dk-card__title">' + esc(post.title) + '</h3>' +
          (post.excerpt ? '<p class="dk-card__desc">' + esc(post.excerpt) + '</p>' : '') +
        '</div>';
      grid.appendChild(card);
    });
    if (!posts.length) grid.appendChild(DK.dom.el('p', { class: 'dk-empty' }, 'No posts yet.'));
    inner.appendChild(grid);
    sec.appendChild(inner);
    return sec;
  }

  /* --------------------------------------------------------------------- nav */

  function renderNav(doc) {
    var branding = doc.branding || {};
    var navLogo = branding.navLogo || {};
    var items = (doc.nav || []).filter(function (n) { return n.visible !== false && n.label; });

    var header = DK.dom.el('header', { class: 'dk-nav', role: 'banner' });
    var inner = DK.dom.el('div', { class: 'dk-nav__inner dk-container' });

    var left = DK.dom.el('div', { class: 'dk-nav__side dk-nav__side--left' });
    var logo = DK.dom.el('a', {
      class: 'dk-nav__logo', href: navLogo.link || '#top',
      'aria-label': esc(navLogo.alt || doc.site.name), 'data-cursor': 'label', 'data-cursor-label': 'Top'
    });
    if (navLogo.src) {
      logo.innerHTML = '<img src="' + esc(DK.mediaSrc(navLogo.src)) + '" alt="' +
        esc(navLogo.alt || doc.site.name) + '" style="height:' +
        Math.round(navLogo.height || 42) + 'px">';
    } else {
      logo.textContent = doc.site.name;
      logo.style.fontSize = Math.round((navLogo.height || 42) * 0.62) + 'px';
    }
    left.appendChild(logo);
    inner.appendChild(left);

    var mid = DK.dom.el('div', { class: 'dk-nav__side dk-nav__side--mid' });
    var list = DK.dom.el('ul', { class: 'dk-nav__list' });
    items.forEach(function (item) {
      var li = DK.dom.el('li');
      li.appendChild(DK.dom.el('a', {
        class: 'dk-nav__link', href: item.href || '#',
        'data-nav': esc(item.id || '')
      }, esc(item.label)));
      list.appendChild(li);
    });
    mid.appendChild(list);
    inner.appendChild(mid);

    var right = DK.dom.el('div', { class: 'dk-nav__side dk-nav__side--right' });
    var toggle = DK.dom.el('button', {
      type: 'button', class: 'dk-nav__sound', 'aria-label': 'Toggle sound', 'aria-pressed': 'true'
    }, '<span class="dk-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>');
    right.appendChild(toggle);
    inner.appendChild(right);

    header.appendChild(inner);

    // Mobile menu button + drawer
    var burger = DK.dom.el('button', {
      type: 'button', class: 'dk-nav__burger', 'aria-label': 'Menu', 'aria-expanded': 'false'
    }, '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>');
    header.appendChild(burger);

    var drawer = DK.dom.el('div', { class: 'dk-drawer', 'aria-hidden': 'true' });
    var drawerList = DK.dom.el('ul', { class: 'dk-drawer__list' });
    items.forEach(function (item) {
      var li = DK.dom.el('li');
      li.appendChild(DK.dom.el('a', { class: 'dk-drawer__link', href: item.href || '#' }, esc(item.label)));
      drawerList.appendChild(li);
    });
    drawer.appendChild(drawerList);
    header.appendChild(drawer);

    header._nav = { list: list, toggle: toggle, burger: burger, drawer: drawer, items: items };
    return header;
  }

  /* ------------------------------------------------------------------ footer */

  function renderFooter(doc) {
    var f = doc.footer || {};
    var s = doc.site || {};
    var branding = doc.branding || {};
    var siteLogo = branding.siteLogo || {};

    var footer = DK.dom.el('footer', { class: 'dk-footer', role: 'contentinfo' });
    var inner = DK.dom.el('div', { class: 'dk-container dk-footer__inner' });

    var brand = DK.dom.el('div', { class: 'dk-footer__brand' });
    if (siteLogo.src && siteLogo.showInFooter !== false) {
      brand.appendChild(DK.dom.el('img', {
        class: 'dk-footer__logo',
        src: DK.mediaSrc(siteLogo.src),
        alt: esc(siteLogo.alt || s.name),
        style: 'height:' + Math.round((siteLogo.height || 120) * 0.6) + 'px'
      }));
    }
    brand.appendChild(DK.dom.el('p', { class: 'dk-footer__tagline' }, esc(s.footerNote || '')));
    inner.appendChild(brand);

    if (doc.settings.footer.showSocial !== false) {
      var social = DK.dom.el('ul', { class: 'dk-footer__social' });
      Object.keys(s.social || {}).forEach(function (k) {
        var url = s.social[k];
        if (!url) return;
        social.appendChild(DK.dom.el('li', null,
          '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</a>'));
      });
      if (social.children.length) inner.appendChild(social);
    }

    var meta = DK.dom.el('div', { class: 'dk-footer__meta' });
    meta.appendChild(DK.dom.el('p', { class: 'dk-footer__copy' },
      esc(String(f.text || '').replace('{year}', String(new Date().getFullYear())))));
    if (f.credit) meta.appendChild(DK.dom.el('p', { class: 'dk-footer__credit' }, esc(f.credit)));
    if (s.availability) {
      meta.appendChild(DK.dom.el('p', { class: 'dk-footer__status' },
        '<span class="dk-dot" aria-hidden="true"></span>' + esc(s.availability)));
    }
    inner.appendChild(meta);

    footer.appendChild(inner);
    return footer;
  }

  /* ---------------------------------------------------------------- lightbox */

  /**
   * Full-screen photo viewer. Albums can hold up to 200 frames, so only a
   * window of thumbnails around the current index is rendered.
   */
  function Lightbox() {
    this.node = null;
    this.items = [];
    this.index = 0;
    this.onClose = null;
  }

  Lightbox.WINDOW = 24;

  Lightbox.prototype.open = function (items, startIndex, meta) {
    this.close(true);
    this.items = items || [];
    if (!this.items.length) return;
    this.index = Math.max(0, Math.min(this.items.length - 1, startIndex || 0));

    var node = DK.dom.el('div', {
      class: 'dk-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': (meta && meta.title) || 'Photo viewer'
    });
    this.node = node;

    var head = DK.dom.el('div', { class: 'dk-lightbox__head' });
    head.appendChild(DK.dom.el('div', { class: 'dk-lightbox__title' },
      '<strong>' + esc((meta && meta.title) || '') + '</strong>' +
      '<span class="dk-lightbox__count" aria-live="polite"></span>'));
    head.appendChild(DK.dom.el('button', {
      type: 'button', class: 'dk-lightbox__close', 'aria-label': 'Close viewer', 'data-cursor': 'label', 'data-cursor-label': 'Close'
    }, '&times;'));
    node.appendChild(head);

    var stage = DK.dom.el('div', { class: 'dk-lightbox__stage' });
    this.figure = DK.dom.el('figure', { class: 'dk-lightbox__figure' });
    this.img = DK.dom.el('img', { class: 'dk-lightbox__img', alt: '' });
    this.caption = DK.dom.el('figcaption', { class: 'dk-lightbox__caption' });
    this.figure.appendChild(this.img);
    this.figure.appendChild(this.caption);
    stage.appendChild(this.figure);

    if (this.items.length > 1) {
      stage.appendChild(DK.dom.el('button', {
        type: 'button', class: 'dk-lightbox__nav dk-lightbox__nav--prev',
        'aria-label': 'Previous photo', 'data-cursor': 'label', 'data-cursor-label': 'Prev'
      }, '<span aria-hidden="true">&#8249;</span>'));
      stage.appendChild(DK.dom.el('button', {
        type: 'button', class: 'dk-lightbox__nav dk-lightbox__nav--next',
        'aria-label': 'Next photo', 'data-cursor': 'label', 'data-cursor-label': 'Next'
      }, '<span aria-hidden="true">&#8250;</span>'));
    }
    node.appendChild(stage);

    this.strip = DK.dom.el('div', { class: 'dk-lightbox__strip' });
    node.appendChild(this.strip);

    document.body.appendChild(node);
    document.documentElement.classList.add('dk-modal-open');
    if (DK.sound) DK.sound.play('open');

    var self = this;
    node.querySelector('.dk-lightbox__close').addEventListener('click', function () { self.close(); });
    var prev = node.querySelector('.dk-lightbox__nav--prev');
    var next = node.querySelector('.dk-lightbox__nav--next');
    if (prev) prev.addEventListener('click', function () { self.go(-1); });
    if (next) next.addEventListener('click', function () { self.go(1); });
    node.addEventListener('click', function (e) {
      if (e.target === stage) self.close();
    });

    this._key = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); self.close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); self.go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); self.go(1); }
    };
    document.addEventListener('keydown', this._key);

    this.render();
  };

  Lightbox.prototype.go = function (delta) {
    var next = this.index + delta;
    if (next < 0) next = this.items.length - 1;
    if (next >= this.items.length) next = 0;
    this.index = next;
    this.render();
    if (DK.sound) DK.sound.play('hover');
  };

  Lightbox.prototype.render = function () {
    var item = this.items[this.index];
    if (!item || !this.img) return;

    this.img.src = DK.mediaSrc(item.src) || item.src;
    this.img.alt = item.caption || item.alt || '';
    this.caption.textContent = item.caption || '';

    var counter = this.node.querySelector('.dk-lightbox__count');
    if (counter) {
      counter.textContent = this.items.length > 1
        ? (this.index + 1) + ' / ' + this.items.length
        : '';
    }

    // Render only a window of thumbnails to keep large albums responsive.
    var half = Math.floor(Lightbox.WINDOW / 2);
    var start = Math.max(0, this.index - half);
    var end = Math.min(this.items.length, start + Lightbox.WINDOW);
    start = Math.max(0, Math.min(start, this.items.length - Lightbox.WINDOW));

    var html = '';
    for (var i = start; i < end; i++) {
      var it = this.items[i];
      html += '<button type="button" class="dk-lightbox__thumb' +
        (i === this.index ? ' is-active' : '') + '" data-index="' + i + '" ' +
        'aria-label="Photo ' + (i + 1) + '" data-cursor="label" data-cursor-label="Open">' +
        '<img src="' + esc(DK.mediaSrc(it.thumb || it.src)) + '" alt="" loading="lazy"></button>';
    }
    this.strip.innerHTML = html;

    var active = this.strip.querySelector('.is-active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  };

  Lightbox.prototype.close = function (silent) {
    if (!this.node) return;
    document.removeEventListener('keydown', this._key);
    this.node.remove();
    this.node = null;
    document.documentElement.classList.remove('dk-modal-open');
    if (!silent && DK.sound) DK.sound.play('close');
    if (this.onClose) this.onClose();
  };

  /* ------------------------------------------------------------ video modal */

  /**
   * Play a video item. Handles both uploaded files (HTML5 <video>) and
   * external links (YouTube / Vimeo / direct media).
   */
  function openVideo(item, doc) {
    var url = DK.mediaSrc(item.url);
    var node = DK.dom.el('div', {
      class: 'dk-videobox', role: 'dialog', 'aria-modal': 'true', 'aria-label': item.title || 'Video'
    });

    var head = DK.dom.el('div', { class: 'dk-videobox__head' });
    head.appendChild(DK.dom.el('div', { class: 'dk-videobox__title' },
      '<strong>' + esc(item.title || '') + '</strong>' +
      (item.category ? '<span>' + esc(item.category) + '</span>' : '')));
    head.appendChild(DK.dom.el('button', {
      type: 'button', class: 'dk-videobox__close', 'aria-label': 'Close video', 'data-cursor': 'label', 'data-cursor-label': 'Close'
    }, '&times;'));
    node.appendChild(head);

    var stage = DK.dom.el('div', { class: 'dk-videobox__stage' });
    var yt = /youtube\.com|youtu\.be/i.test(url);
    var vimeo = /vimeo\.com/i.test(url);
    var direct = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|$)/i.test(url);

    if (yt) {
      var m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
      if (m) {
        stage.innerHTML = '<iframe src="https://www.youtube.com/embed/' +
          esc(m[1]) + '?rel=0&modestbranding=1" title="' + esc(item.title || 'Video') +
          '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      } else {
        stage.appendChild(externalLink(url, item));
      }
    } else if (vimeo) {
      var vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
      stage.innerHTML = vm
        ? '<iframe src="https://player.vimeo.com/video/' + esc(vm[1]) + '" title="' +
          esc(item.title || 'Video') + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>'
        : '';
      if (!vm[1]) stage.appendChild(externalLink(url, item));
    } else if (direct || item.type === 'upload') {
      stage.innerHTML = '<video controls playsinline preload="metadata"' +
        (item.poster ? ' poster="' + esc(DK.mediaSrc(item.poster)) + '"' : '') + '>' +
        '<source src="' + esc(url) + '">' +
        'Your browser cannot play this file. ' +
        '<a href="' + esc(url) + '" target="_blank" rel="noopener">Download it instead</a>.' +
        '</video>';
    } else {
      stage.appendChild(externalLink(url, item));
    }
    node.appendChild(stage);

    if (item.description) {
      node.appendChild(DK.dom.el('p', { class: 'dk-videobox__desc' }, esc(item.description)));
    }

    document.body.appendChild(node);
    document.documentElement.classList.add('dk-modal-open');
    if (DK.sound) DK.sound.play('open');

    function close() {
      node.remove();
      document.documentElement.classList.remove('dk-modal-open');
      document.removeEventListener('keydown', onKey);
      if (DK.sound) DK.sound.play('close');
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    node.querySelector('.dk-videobox__close').addEventListener('click', close);
    node.addEventListener('click', function (e) { if (e.target === stage) close(); });
    document.addEventListener('keydown', onKey);

    // Autoplay the video once it is in the DOM.
    var video = node.querySelector('video');
    if (video) {
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay may be blocked */ });
    }
    return { close: close };
  }

  function externalLink(url, item) {
    var wrap = DK.dom.el('div', { class: 'dk-videobox__external' });
    wrap.innerHTML = '<p>This film is hosted elsewhere.</p>' +
      '<a class="dk-btn dk-btn--primary" href="' + esc(url) +
      '" target="_blank" rel="noopener noreferrer">Open on the host site</a>';
    return wrap;
  }

  /** Open whichever viewer a card represents. */
  function openCard(card, doc, lightbox) {
    var id = card.dataset.id;
    var kind = card.className.match(/dk-card--(\w+)/);
    kind = kind ? kind[1] : '';

    if (kind === 'album') {
      var album = (doc.collections.photography || []).filter(function (a) { return a.id === id; })[0];
      if (!album) return;
      var photos = (album.photos || []).map(function (p) {
        return { src: p.src, thumb: p.thumb, caption: p.caption, alt: p.caption };
      });
      if (!photos.length) { DK.toast('This album has no photos yet.', 'info'); return; }
      lightbox.open(photos, 0, { title: album.title });
      return;
    }

    if (kind === 'project') {
      var proj = (doc.collections.graphics || []).filter(function (g) { return g.id === id; })[0];
      if (!proj) return;
      var gallery = (proj.images || []).map(function (im) {
        return { src: im.src, thumb: im.src, caption: im.caption };
      });
      if (!gallery.length) { DK.toast('No images in this project yet.', 'info'); return; }
      lightbox.open(gallery, 0, { title: proj.title });
      return;
    }

    if (kind === 'logo') {
      var logo = (doc.collections.logos || []).filter(function (l) { return l.id === id; })[0];
      if (!logo) return;
      lightbox.open([{ src: logo.image || '', thumb: logo.image, caption: logo.title }], 0, { title: logo.title });
      return;
    }

    if (kind === 'video') {
      var vid = (doc.collections.videography || []).filter(function (v) { return v.id === id; })[0];
      if (vid) openVideo(vid, doc);
      return;
    }

    if (kind === 'post') {
      var post = (doc.collections.journal || []).filter(function (p) { return p.id === id; })[0];
      if (post) openArticle(post);
    }
  }

  /** Simple reading view for journal posts. */
  function openArticle(post) {
    var node = DK.dom.el('article', {
      class: 'dk-article', role: 'dialog', 'aria-modal': 'true', 'aria-label': post.title || 'Post'
    });
    node.innerHTML =
      '<header class="dk-article__head">' +
        '<button type="button" class="dk-article__close" aria-label="Close" data-cursor="label" data-cursor-label="Close">&times;</button>' +
        '<time>' + esc(DK.formatDate(post.date)) + '</time>' +
        '<h2>' + esc(post.title || '') + '</h2>' +
      '</header>' +
      (post.cover ? '<img class="dk-article__cover" src="' + esc(DK.mediaSrc(post.cover)) + '" alt="">' : '') +
      '<div class="dk-article__body">' + (DK.md(post.body) || '') + '</div>';

    document.body.appendChild(node);
    document.documentElement.classList.add('dk-modal-open');
    if (DK.sound) DK.sound.play('open');

    function close() {
      node.remove();
      document.documentElement.classList.remove('dk-modal-open');
      document.removeEventListener('keydown', onKey);
      if (DK.sound) DK.sound.play('close');
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    node.querySelector('.dk-article__close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    DK.parallax.scrollTo(node, 0);
  }

  /** Apply the accent colours and metadata from the content document. */
  function applyTheme(doc) {
    var s = doc.site || {};
    var root = document.documentElement;
    if (s.accent) root.style.setProperty('--dk-accent', s.accent);
    if (s.accent2) root.style.setProperty('--dk-accent-2', s.accent2);
    if (s.name) document.title = s.name + (s.tagline ? ' â€” ' + s.tagline : '');
    if (doc.branding && doc.branding.favicon) {
      var link = document.querySelector('link[rel="icon"]');
      if (link) link.href = DK.mediaSrc(doc.branding.favicon);
    }
    var meta = document.querySelector('meta[name="description"]');
    if (meta && s.description) meta.setAttribute('content', s.description);
  }

  /* ------------------------------------------------------------ interaction */

  /** Bind every delegated interaction on the page. */
  function wire(root, doc, refs) {
    var lightbox = new Lightbox();

    // Cards: click and keyboard activation.
    root.addEventListener('click', function (e) {
      var card = e.target.closest('.dk-card, .dk-logo-card');
      if (card) { openCard(card, doc, lightbox); return; }

      var filter = e.target.closest('.dk-filter');
      if (filter) {
        var scope = filter.dataset.scope;
        var value = filter.dataset.filter;
        DK.dom.qsa('.dk-filter[data-scope="' + CSS.escape(scope) + '"]').forEach(function (b) {
          b.classList.toggle('is-active', b === filter);
        });
        var container = filter.closest('.dk-container');
        if (container) {
          DK.dom.qsa(container.querySelectorAll('[data-category]')).forEach(function (c) {
            var show = value === '*' || (c.dataset.category || '') === value;
            c.classList.toggle('is-hidden', !show);
          });
        }
        if (DK.sound) DK.sound.play('toggleOn');
        return;
      }

      if (e.target.closest('[data-action="play-radio"]')) {
        var section = document.getElementById('radio');
        if (section && refs.radio) {
          DK.parallax.scrollTo(section, 40);
          setTimeout(function () { refs.radio.toggle(); }, 650);
        }
      }
    });

    // Keyboard activation for the card grid.
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.dk-card, .dk-logo-card');
      if (!card) return;
      e.preventDefault();
      openCard(card, doc, lightbox);
    });

    // Lightbox thumbnail clicks + swipe.
    document.addEventListener('click', function (e) {
      var thumb = e.target.closest('.dk-lightbox__thumb');
      if (thumb && lightbox.node) {
        lightbox.index = Number(thumb.dataset.index);
        lightbox.render();
      }
    });

    var touchX = null;
    document.addEventListener('touchstart', function (e) {
      if (lightbox.node && e.touches.length === 1) touchX = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!lightbox.node || touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 45) lightbox.go(dx < 0 ? 1 : -1);
    }, { passive: true });

    // Smooth in-page anchors.
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var target = a.getAttribute('href');
      if (!target || target === '#' || !DK.dom.qs(target)) return;
      e.preventDefault();
      DK.parallax.scrollTo(target, 90);
      if (DK.sound) DK.sound.play('navigate');
      history.replaceState(null, '', target);
    });

    // Sound toggle.
    if (refs.nav) {
      refs.nav.toggle.addEventListener('click', function () {
        var on = refs.nav.toggle.getAttribute('aria-pressed') === 'true';
        refs.nav.toggle.setAttribute('aria-pressed', String(!on));
        DK.sound.setEnabled(!on);
        DK.sound.play(on ? 'toggleOff' : 'toggleOn');
      });

      // Mobile drawer.
      refs.nav.burger.addEventListener('click', function () {
        var open = refs.nav.header.classList.toggle('is-open');
        refs.nav.burger.setAttribute('aria-expanded', String(open));
        refs.nav.drawer.setAttribute('aria-hidden', String(!open));
        document.documentElement.classList.toggle('dk-drawer-open', open);
        DK.sound.play(open ? 'open' : 'close');
      });
      DK.dom.qsa('.dk-drawer__link', refs.nav.drawer).forEach(function (a) {
        a.addEventListener('click', function () {
          refs.nav.header.classList.remove('is-open');
          refs.nav.burger.setAttribute('aria-expanded', 'false');
          refs.nav.drawer.setAttribute('aria-hidden', 'true');
          document.documentElement.classList.remove('dk-drawer-open');
        });
      });
    }

    DK.parallax.spySections(DK.dom.qsa('.dk-nav__link', refs.nav ? refs.nav.list : document));
    return lightbox;
  }

  /* -------------------------------------------------------------- bootstrap */

  /**
   * Build the entire page from the content document.
   * @param {object} doc normalised content
   * @returns {object} references to the live pieces
   */
  function render(doc) {
    applyTheme(doc);

    var app = DK.dom.qs('#dk-app');
    app.innerHTML = '';

    var nav = renderNav(doc);
    app.appendChild(nav);

    var main = DK.dom.el('main', { class: 'dk-main', id: 'dk-main' });
    var refs = {};

    [renderHero(doc), renderAbout(doc), renderLogos(doc), renderGraphics(doc),
     renderPhotography(doc), renderVideography(doc), renderJournal(doc)]
      .forEach(function (sec) { if (sec) main.appendChild(sec); });

    // Custom pages flagged to appear in the nav sit after the journal.
    (doc.pages || []).filter(function (p) { return p.published !== false && p.inNav; })
      .forEach(function (page) { main.appendChild(pageSection(page)); });

    // My Servers sits at the very bottom of the page: an animated radio
    // player whose stations double as placeholders for running servers.
    main.appendChild(contactSection(doc));

    if (doc.sections.radio && doc.sections.radio.enabled !== false) {
      var radio = DK.radio.markup({
        radio: doc.radio,
        settings: doc.settings,
        kicker: doc.sections.radio.kicker
      });
      if (radio._radio) {
        radio._radio.defaultStation = (doc.settings.radio && doc.settings.radio.defaultStation) || '';
      }
      main.appendChild(radio);
    }
    app.appendChild(main);
    app.appendChild(renderFooter(doc));

    refs.nav = Object.assign({ header: nav }, nav._nav);
    wire(app, doc, refs);

    var radioNode = document.getElementById('radio');
    refs.radio = (radioNode && radioNode._radio) ? DK.radio.mount(radioNode) : null;

    DK.parallax.observeReveals(app);
    if (doc.settings.hero.parallax !== false) {
      var hero = DK.dom.qs('.dk-hero');
      if (hero) DK.parallax.attach(hero, { strength: 1 });
    }

    return refs;
  }

  /** Custom page block for pages flagged to appear in the nav. */
  function pageSection(page) {
    var sec = DK.dom.el('section', { id: 'page-' + page.slug, class: 'dk-section dk-page' });
    var inner = DK.dom.el('div', { class: 'dk-container dk-page__inner' });
    inner.innerHTML = '<div class="dk-section__head" data-reveal>' +
      '<h2 class="dk-section__title">' + esc(page.title || '') + '</h2></div>' +
      '<div class="dk-page__body" data-reveal>' + (DK.md(page.body) || '') + '</div>';
    sec.appendChild(inner);
    return sec;
  }

  /* ---------------------------------------------------------------- contact */

  function contactSection(doc) {
    var c = doc.contact || {};
    var s = doc.site || {};
    var sec = DK.dom.el('section', { id: 'contact', class: 'dk-section dk-contact' });
    var inner = DK.dom.el('div', { class: 'dk-container dk-contact__inner' });

    inner.innerHTML = '<div class="dk-section__head" data-reveal>' +
      '<p class="dk-kicker">Contact</p>' +
      '<h2 class="dk-section__title">' + esc(c.title || 'Get in touch') + '</h2>' +
      (c.body ? '<p class="dk-section__blurb">' + esc(c.body) + '</p>' : '') + '</div>';

    var links = DK.dom.el('div', { class: 'dk-contact__links', 'data-reveal': '', 'data-reveal-delay': '0.1' });
    if (s.contactEmail) {
      links.appendChild(DK.dom.el('a', {
        class: 'dk-contact__email', href: 'mailto:' + s.contactEmail,
        'data-cursor': 'label', 'data-cursor-label': 'Mail'
      }, esc(s.contactEmail)));
    }
    if (s.phone) {
      links.appendChild(DK.dom.el('a', { class: 'dk-contact__phone', href: 'tel:' + s.phone }, esc(s.phone)));
    }
    if (c.locationLine) {
      links.appendChild(DK.dom.el('p', { class: 'dk-contact__location' }, esc(c.locationLine)));
    }
    inner.appendChild(links);

    if (c.showForm) {
      var form = DK.dom.el('form', { class: 'dk-form', novalidate: 'novalidate' });
      form.setAttribute('data-reveal', '');
      form.setAttribute('data-reveal-delay', '0.2');
      form.innerHTML =
        '<div class="dk-form__row">' +
          '<label class="dk-field"><span>Name</span>' +
          '<input type="text" name="name" autocomplete="name" required></label>' +
          '<label class="dk-field"><span>Email</span>' +
          '<input type="email" name="email" autocomplete="email" required></label>' +
        '</div>' +
        '<label class="dk-field"><span>Message</span>' +
        '<textarea name="message" rows="4" required></textarea></label>' +
        '<button type="submit" class="dk-btn dk-btn--primary">Send message</button>' +
        '<p class="dk-form__note">' + esc(c.formNote || '') + '</p>' +
        '<p class="dk-form__status" role="status"></p>';

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var status = form.querySelector('.dk-form__status');
        var data = new FormData(form);
        if (!data.get('name') || !data.get('email') || !data.get('message')) {
          status.textContent = 'Please fill in every field.';
          status.className = 'dk-form__status is-error';
          if (DK.sound) DK.sound.play('error');
          return;
        }
        // Static hosting has no mail transport, so hand off to the mail client.
        var subject = encodeURIComponent('Portfolio enquiry from ' + data.get('name'));
        var body = encodeURIComponent(data.get('message') + '\n\nFrom: ' +
          data.get('name') + ' <' + data.get('email') + '>');
        status.textContent = 'Opening your mail app...';
        status.className = 'dk-form__status is-ok';
        if (DK.sound) DK.sound.play('success');
        global.location.href = 'mailto:' + (s.contactEmail || '') +
          '?subject=' + subject + '&body=' + body;
      });
      inner.appendChild(form);
    }

    sec.appendChild(inner);
    return sec;
  }

  /* ------------------------------------------------------------------ init */

  /**
   * Boot the site: show the intro, render, then start the ambient effects.
   */
  function init() {
    var app = DK.dom.qs('#dk-app');
    if (!app) return Promise.resolve();

    return DK.loadContent().then(function (doc) {
      DK.site = {
        doc: doc,
        render: function () { return render(doc); },
        get current() { return doc; }
      };

      // Render behind the intro so the reveal lands on finished content.
      var refs = render(doc);
      DK.site.refs = refs;

      DK.sound.configure(doc.settings);
      DK.sound.attach(document);
      if (doc.settings.cursor && doc.settings.cursor.enabled !== false) {
        DK.cursor.init({});
      }

      var loaderCfg = {
        preloader: doc.settings.preloader,
        branding: doc.branding,
        site: doc.site
      };
      return DK.loader.run(loaderCfg).then(function () {
        // Re-trigger reveals that were already in view behind the intro.
        DK.parallax.observeReveals(app);
        document.documentElement.classList.add('dk-ready');
        return refs;
      });
    }).catch(function (err) {
      // Never leave the visitor staring at a blank page.
      app.innerHTML = '<div class="dk-container dk-error">' +
        '<h1>Something went wrong</h1>' +
        '<p>' + esc(err && err.message ? err.message : 'Could not load the site content.') + '</p></div>';
      document.documentElement.classList.remove('dk-loading');
      throw err;
    });
  }

  DK.site = Object.assign(DK.site || {}, {
    init: init,
    render: render,
    applyTheme: applyTheme,
    openVideo: openVideo,
    Lightbox: Lightbox
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { DK.site.init(); });
  } else {
    DK.site.init();
  }

})(typeof window !== 'undefined' ? window : this);
