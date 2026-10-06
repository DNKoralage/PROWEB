/* ==========================================================================
   DK — common.js
   Shared helpers used by the public site and the admin dashboard.
   No dependencies, no build step. Plain ES5+ so it runs from file:// too.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});

  /* ---------------------------------------------------------------- utils */

  /** Merge defaults into a target object (deep for plain objects). */
  function mergeDefaults(target, defaults) {
    if (!target || typeof target !== 'object') target = {};
    Object.keys(defaults).forEach(function (key) {
      var d = defaults[key];
      if (target[key] === undefined || target[key] === null) {
        target[key] = Array.isArray(d) ? d.slice() : (d && typeof d === 'object' ? mergeDefaults({}, d) : d);
      } else if (d && typeof d === 'object' && !Array.isArray(d) &&
                 typeof target[key] === 'object' && !Array.isArray(target[key])) {
        mergeDefaults(target[key], d);
      }
    });
    return target;
  }

  /** Escape a value for safe interpolation into HTML text/attributes. */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Very small markdown subset used for admin text fields. */
  function inline(t) {
    return esc(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function miniMarkdown(src) {
    if (!src) return '';
    return String(src).replace(/\r\n/g, '\n').split(/\n{2,}/).map(function (block) {
      var t = block.trim();
      if (!t) return '';
      if (/^###\s+/.test(t)) return '<h4>' + inline(t.replace(/^###\s+/, '')) + '</h4>';
      if (/^##\s+/.test(t)) return '<h3>' + inline(t.replace(/^##\s+/, '')) + '</h3>';
      if (/^#\s+/.test(t)) return '<h2>' + inline(t.replace(/^#\s+/, '')) + '</h2>';
      if (/^>\s?/.test(t)) return '<blockquote>' + inline(t.replace(/^>\s?/gm, '')) + '</blockquote>';
      if (t.split('\n').every(function (l) { return /^\s*[-*]\s+/.test(l); })) {
        return '<ul>' + t.split('\n').map(function (l) {
          return '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>';
        }).join('') + '</ul>';
      }
      return '<p>' + inline(t).replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
      .trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  /** Safe media URL: same-origin paths, http(s), data or blob only. */
  function safeMedia(value) {
    var v = String(value || '').trim();
    if (!v) return '';
    if (/^(data:|blob:)/i.test(v)) return v;
    if (/^(https?:)?\/\//i.test(v)) return v;
    if (/^\/?[\w\-./]+$/.test(v)) return v.replace(/^\/+/, '');
    return '';
  }
/* ------------------------------------------------------------ exports */

  // The helpers above are module-local for speed; expose the ones the rest of
  // the codebase (and the dashboard) rely on.
  DK.esc = esc;
  DK.inline = inline;
  DK.md = miniMarkdown;
  DK.slugify = slugify;
  DK.safeMedia = safeMedia;
  DK.mergeDefaults = mergeDefaults;

  /* --------------------------------------------------------------- storage */

  /** LocalStorage wrapper that never throws (private mode, quota, ...). */
  DK.store = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem('dk:' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { global.localStorage.setItem('dk:' + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    del: function (key) {
      try { global.localStorage.removeItem('dk:' + key); } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------- DOM */

  DK.dom = {
    qs: function (sel, root) { return (root || document).querySelector(sel); },
    /**
     * Query elements. Accepts a selector string (searched within `root`) or an
     * existing array/NodeList, which is returned as a plain array.
     */
    qsa: function (sel, root) {
      if (sel && typeof sel !== 'string') {
        return Array.prototype.slice.call(sel);
      }
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    },
    el: function (tag, attrs, html) {
      var node = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (d) { node.dataset[d] = attrs[k][d]; });
        else node.setAttribute(k, attrs[k]);
      });
      if (html !== undefined) node.innerHTML = html;
      return node;
    },
    on: function (node, type, handler, opts) {
      if (!node) return function () {};
      node.addEventListener(type, handler, opts);
      return function () { node.removeEventListener(type, handler, opts); };
    },
    /** requestAnimationFrame loop passing delta seconds. */
    raf: function (fn) {
      var last = performance.now(), running = true;
      function step(now) {
        if (!running) return;
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        fn(dt, now);
        global.requestAnimationFrame(step);
      }
      global.requestAnimationFrame(step);
      return function () { running = false; };
    },
    /** Resolves when the image decodes (or fails), so layout can be measured. */
    imgReady: function (src) {
      return new Promise(function (resolve) {
        if (!src) return resolve();
        var img = new Image();
        img.onload = img.onerror = function () { resolve(); };
        img.src = src;
      });
    }
  };

  DK.uid = function (prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8) +
           Date.now().toString(36).slice(-4);
  };

  /* ------------------------------------------------------------- base path */

  /** Base path of the site root relative to the current page. */
  DK.basePath = function () {
    if (global.DK_BASE) return global.DK_BASE;
    var path = global.location.pathname;
    var dir = path.replace(/[^/]*$/, '');
    if (/\/(admin|api)\//i.test(path)) dir = dir.replace(/(admin|api)\/$/i, '');
    return dir || './';
  };

  /** Resolve a stored media value to a URL usable by the current page. */
  DK.mediaSrc = function (value) {
    var v = String(value || '').trim();
    if (!v) return '';
    if (/^(data:|blob:)/i.test(v)) return v;
    if (/^(https?:)?\/\//i.test(v)) return v;
    return DK.basePath() + v.replace(/^\.?\//, '');
  };

  DK.asset = DK.mediaSrc;

  /** Human readable file size. */
  DK.bytes = function (n) {
    if (!n && n !== 0) return '';
    var units = ['B', 'KB', 'MB', 'GB'], i = 0, v = Number(n);
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
  };

  DK.formatDate = function (value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

/* --------------------------------------------------------- content model */

  /** Canonical shape + defaults for the whole site document. */
  DK.defaults = function () {
    return {
      version: 1,
      site: {
        name: 'DK',
        fullName: 'Devnith Koralage',
        tagline: 'Full-Stack Web Developer & Systems Engineer | Multimedia Producer',
        browserTitle: 'Devnith Koralage — Full-Stack Web Developer & Systems Engineer',
        description: 'Devnith Koralage — full-stack web developer, systems engineer and multimedia producer with hands-on experience running broadcast infrastructure, streaming servers and 20+ active web platforms.',
        accent: '#31e0a1',
        accent2: '#6c8cff',
        contactEmail: 'dnkoralage@gmail.com',
        phone: '+94 78 798 4875',
        location: 'Dehiwala, Sri Lanka',
        availability: 'Available for commissions',
        social: {
          linkedin: 'https://linkedin.com/in/dnkoralage1',
          facebook: 'https://facebook.com/DNKoralage1',
          instagram: 'https://instagram.com/DNKoralage1',
          behance: '', dribbble: '', youtube: '', vimeo: ''
        },
        socialLinks: [
          { id: 'sl1', name: 'LinkedIn', url: 'https://linkedin.com/in/dnkoralage1', icon: 'linkedin' },
          { id: 'sl2', name: 'Facebook', url: 'https://facebook.com/DNKoralage1', icon: 'facebook' },
          { id: 'sl3', name: 'Instagram', url: 'https://instagram.com/DNKoralage1', icon: 'instagram' }
        ],
        footerNote: 'Turning ideas into reality.'
      },
      settings: {
        preloader: { enabled: true, duration: 6500, showPercent: true, skipButton: true, tagline: 'Creative Studio' },
        sounds: { enabled: true, hover: true, click: true, volume: 0.35 },
        cursor: { enabled: true },
        hero: { parallax: true, scrollHint: true, ctaText: 'Explore the work', ctaHref: '#work' },
        radio: { defaultStation: '', blockedHint: 'Press play to start the node' },
        footer: { showSocial: true }
      },
      branding: {
        navLogo: { src: '', height: 42, position: 'left', link: '#top', alt: 'DK logo' },
        siteLogo: { src: '', height: 150, showInHero: true, showInFooter: true, alt: 'DK' },
        favicon: '',
        loaderMark: 'Devnith Koralage'
      },
      nav: [
        { id: 'nav-1', label: 'Work', href: '#work', visible: true },
        { id: 'nav-2', label: 'Logos', href: '#logos', visible: true },
        { id: 'nav-3', label: 'Albums', href: '#photography', visible: true },
        { id: 'nav-4', label: 'Film', href: '#videography', visible: true },
        { id: 'nav-7', label: 'Showcase', href: '#showcase', visible: true },
        { id: 'nav-5', label: 'Servers', href: '#radio', visible: true },
        { id: 'nav-6', label: 'Contact', href: '#contact', visible: true }
      ],
      hero: {
        eyebrow: 'Full-stack web developer · Systems engineer · Multimedia producer',
        title: 'Devnith Koralage',
        titleAccent: 'Full-Stack Web Developer & Systems Engineer',
        subtitle: 'Multimedia producer running enterprise-grade broadcast infrastructure, streaming servers and 20+ active web platforms — software engineering with a producer’s eye.',
        image: '',
        ctaText: 'Explore the work',
        ctaHref: '#work',
        secondaryText: 'Tune in',
        secondaryHref: '#radio',
        stats: [
          { id: 's1', value: '20+', label: 'Active web platforms' },
          { id: 's2', value: '24/7', label: 'Live radio broadcast pioneer' },
          { id: 's3', value: '2nd', label: 'All-island media award' }
        ]
      },
      about: {
        title: 'Professional summary',
        cv: 'uploads/Devnith_Koralage_Professional_CV.pdf',
        body: 'Results-driven Full-Stack Web Developer, Systems Engineer, and Multimedia Producer with extensive hands-on experience managing enterprise-grade broadcast infrastructure, streaming servers, and 20+ active web platforms. Proven leadership track record managing technical operations for pioneer digital media networks, combining robust software engineering capabilities with advanced digital content production.',
        image: '',
        skills: [
          'Web development — full-stack design, frontend/backend architecture & CMS',
          'Systems & broadcasting — streaming server architecture, 24/7 YouTube automation',
          'Multimedia & production — After Effects, Filmora, CapCut, cinematography, directing, scriptwriting',
          'Audio engineering — FL Studio, Cubase, composition & production',
          'Leadership & management — strategic planning, technical project management'
        ],
        clients: 'Indusara Media Network · Indusara TV · Nysco TV · Nysco Radio · Luminex',
        experience: [
          {
            id: 'e1', role: 'Systems Engineer & Technical Producer',
            org: 'Indusara Media Network / Indusara TV', period: '2021 – 2025',
            detail: 'Managed the complete technical back-end infrastructure, web development and high-performance streaming servers for Sri Lanka’s pioneer Web TV network (indusara.lk). Maintained technical infrastructure, uptime and database management for 20+ active websites and platforms, including radioeka.lk.',
            order: 1
          },
          {
            id: 'e2', role: 'Software Engineer & Tech Operations',
            org: 'Nysco TV & Nysco Radio', period: 'April 2022 – Present',
            detail: 'Directing software development initiatives, broadcast systems engineering and technical network operations. Collaborating with cross-functional teams to integrate automated web systems with broadcast streams.',
            order: 2
          },
          {
            id: 'e3', role: 'Founder & Lead Creative',
            org: 'Luminex', period: 'Present',
            detail: 'Leading an independent creative venture delivering full-stack web solutions, digital infrastructure and high-impact multimedia content.',
            order: 3
          }
        ]
      },
      sections: {
        logos: { enabled: true, title: 'Logos portfolio', kicker: 'Identity', blurb: 'Marks built to survive small sizes and big walls.', limit: 24 },
        graphics: { enabled: true, title: 'Graphic design projects', kicker: 'Campaigns', blurb: 'Print, social and out-of-home systems.', featured: 'g1' },
        photography: { enabled: true, title: 'Photography albums', kicker: 'Albums', blurb: 'Up to 200 frames per album.', perPage: 24, layout: 'masonry' },
        videography: { enabled: true, title: 'Videography', kicker: 'Film', blurb: 'Direct uploads or hosted links.' },
        showcase: { enabled: true, title: 'Website showcase', kicker: 'Showcase', blurb: 'Portfolio websites I have designed, built and maintain — preview and visit them live.' },
        journal: { enabled: true, title: 'Journal', kicker: 'Notes', blurb: 'Occasional writing from the field.' },
        radio: { enabled: true, title: 'My Servers', kicker: 'Live nodes', blurb: 'Placeholder nodes streaming live while the studio servers come online.' }
      },
      categories: {
        logos: ['Monogram', 'Wordmark', 'Emblem', 'Lettering'],
        graphics: ['Campaign', 'Poster', 'Brand system', 'Social', 'Packaging', 'Editorial'],
        photography: ['Wildlife', 'Portraits', 'Street', 'Nature', 'Travel'],
        videography: ['Documentary', 'Commercial', 'Motion', 'Short film']
      },
      collections: {
        logos: [
          { id: 'l1', title: 'Verde Market', client: 'Verde Market', category: 'Emblem', year: '2024', image: '', alt: 'Verde Market logo', description: 'Leaf-built emblem for an organic grocer.', tags: ['identity'], featured: true, order: 1 }
        ],
        graphics: [
          {
            id: 'g1', title: 'Johnian School Walk', client: 'Johnian Schools', category: 'Campaign',
            year: '2025', description: 'End-to-end campaign for the annual school walk: identity, route signage, print, social and stage graphics.',
            tags: ['campaign', 'print', 'social'], featured: true, order: 1,
            images: [
              { id: 'gi1', src: '', caption: 'Campaign key visual' },
              { id: 'gi2', src: '', caption: 'Poster series' },
              { id: 'gi3', src: '', caption: 'Social templates' }
            ],
            body: 'A walking event needed a visual system that could hold up on a banner, a handbill and a phone screen. The palette pulls from monsoon greens with a single electric highlight for calls to action.'
          }
        ],
        photography: [
          {
            id: 'p1', title: 'Jungle mornings', category: 'Nature', cover: '', description: 'Mist, light and leaf litter.',
            date: '2025-03-14', location: 'Sinharaja, Sri Lanka', order: 1, photos: []
          }
        ],
        videography: [
          { id: 'v1', title: 'Rainforest Sessions', category: 'Documentary', type: 'link', url: '', poster: '', description: 'Short documentary.', duration: '08:24', order: 1 }
        ],
        showcase: [
          {
            id: 'w1', title: 'Indusara.lk platform', category: 'Broadcast web',
            image: '', url: '', description: 'Long-form web platform for a pioneer Web TV network — part of the 20+ active sites maintained day to day.',
            order: 1
          }
        ],
        journal: [
          { id: 'j1', title: 'Notes on a green palette', date: '2025-05-02', excerpt: 'Why jungle greens read better at low luminance.', body: 'Body copy goes here.', tags: ['colour'], cover: '', published: true, order: 1 }
        ]
      },
      radio: {
        title: 'My Servers',
        tagline: 'A custom animated radio player — placeholder channels for the studio servers while they spin up.',
        visualizer: { style: 'neon', color: '#31e0a1', color2: '#7b5cff', color3: '#ff5ce1',
          bars: 96, smoothing: 0.82, glow: true, glowColor: '#31e0a1', speed: 1 },
        artwork: '', neon: { enabled: true, color: '#31e0a1', color2: '#7b5cff', speed: 1.2 },
        nowPlaying: { station: '', track: '', artist: '' },
        stations: [
          { id: 'r1', logo: '', showTitle: '', showSubtitle: '', name: 'Server 01 · Aurora', url: 'https://ice2.somafm.com/groovesalad-128-mp3', genre: 'Downtempo', color: '#31e0a1', enabled: true },
          { id: 'r2', logo: '', showTitle: '', showSubtitle: '', name: 'Server 02 · Monsoon', url: 'https://ice2.somafm.com/dronezone-128-mp3', genre: 'Ambient', color: '#6c8cff', enabled: true },
          { id: 'r3', logo: '', showTitle: '', showSubtitle: '', name: 'Server 03 · Firefly', url: 'https://ice2.somafm.com/deepspaceone-128-mp3', genre: 'Atmospheric', color: '#7b5cff', enabled: true }
        ]
      },
      pages: [
        { id: 'pg1', title: 'Privacy', slug: 'privacy', body: '## Privacy\n\nThis page is editable from the dashboard.', published: false, inNav: false, order: 1 }
      ],
      contact: {
        title: 'Let’s work together',
        body: 'Open to full-stack development, systems engineering and multimedia production work — the inbox is always open.',
        showForm: true, formNote: 'Or email directly.', locationLine: 'Dehiwala, Sri Lanka'
      },
      footer: {
        text: '© {year} Devnith Koralage. All rights reserved.',
        credit: 'Turning ideas into reality.'
      }
    };
  };

/* --------------------------------------------------------- normalising */

  /**
   * Normalise any stored document into the canonical shape.
   * Repairs missing/garbage fields so the renderer never has to guess.
   */
  DK.normalise = function (doc) {
    var base = DK.defaults();
    var out = mergeDefaults(doc && typeof doc === 'object' ? doc : {}, base);

    ['logos', 'graphics', 'photography', 'videography', 'showcase', 'journal'].forEach(function (key) {
      if (!Array.isArray(out.collections[key])) out.collections[key] = [];
      out.collections[key].forEach(function (item, i) {
        if (!item || typeof item !== 'object') { out.collections[key][i] = { id: DK.uid(key.charAt(0)), order: i + 1 }; item = out.collections[key][i]; }
        if (!item.id) item.id = key.charAt(0) + Date.now().toString(36) + i;
        if (typeof item.order !== 'number') item.order = i + 1;
      });
      out.collections[key].sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      out.collections[key].forEach(function (item, i) { item.order = i + 1; });
    });

    // Footer social list: keep ids stable, and migrate the legacy fixed-key
    // social object when a stored document predates socialLinks.
    if (!Array.isArray(out.site.socialLinks)) out.site.socialLinks = [];
    if (!out.site.socialLinks.length && out.site.social) {
      Object.keys(out.site.social).forEach(function (k) {
        var u = out.site.social[k];
        if (!u) return;
        out.site.socialLinks.push({ id: DK.uid('sl'), name: k.charAt(0).toUpperCase() + k.slice(1), url: u, icon: k });
      });
    }
    out.site.socialLinks.forEach(function (l, i) {
      if (!l || typeof l !== 'object') { out.site.socialLinks[i] = l = { id: DK.uid('sl') }; }
      if (!l.id) l.id = DK.uid('sl');
      if (typeof l.icon !== 'string') l.icon = '';
      if (typeof l.name !== 'string') l.name = '';
      if (typeof l.url !== 'string') l.url = '';
    });

    // Experience timeline entries.
    if (!Array.isArray(out.about.experience)) out.about.experience = [];
    out.about.experience.forEach(function (r, i) {
      if (!r || typeof r !== 'object') { out.about.experience[i] = r = { id: DK.uid('exp') }; }
      if (!r.id) r.id = DK.uid('exp');
      if (typeof r.order !== 'number') r.order = i + 1;
    });

    // Graphics items hold an image set; albums hold photos.
    out.collections.graphics.forEach(function (item) {
      if (!Array.isArray(item.images)) item.images = [];
      item.images.forEach(function (img, i) { if (!img.id) img.id = DK.uid('img'); img.order = i; });
    });
    out.collections.photography.forEach(function (album) {
      if (!Array.isArray(album.photos)) album.photos = [];
      album.photos.forEach(function (p, i) {
        if (!p.id) p.id = DK.uid('ph');
        if (typeof p.order !== 'number') p.order = i;
      });
    });

    // Radio stations need stable unique ids.
    var seen = {};
    if (!out.radio.visualizer) out.radio.visualizer = {};
    if (!out.radio.visualizer.style) out.radio.visualizer.style = 'neon';
    if (typeof out.radio.visualizer.glow !== 'boolean') out.radio.visualizer.glow = true;
    if (!out.radio.artwork) out.radio.artwork = ((out.radio.stations[0] || {}).logo || '');
    if (!out.radio.neon) out.radio.neon = {};
    if (typeof out.radio.neon.enabled !== 'boolean') out.radio.neon.enabled = true;
    if (!out.radio.nowPlaying) out.radio.nowPlaying = { station: '', track: '', artist: '' };
    out.radio.stations.forEach(function (st, i) {
      if (!st.id || seen[st.id]) st.id = DK.uid('st');
      seen[st.id] = true;
      if (typeof st.enabled !== 'boolean') st.enabled = true;
      if (!st.color) st.color = base.site.accent;
    });

    if (!Array.isArray(out.nav)) out.nav = [];
    out.nav.forEach(function (item, i) {
      if (!item.id) item.id = DK.uid('nav');
      item.order = i;
      if (typeof item.visible !== 'boolean') item.visible = true;
    });

    if (!Array.isArray(out.pages)) out.pages = [];
    out.pages.forEach(function (p, i) {
      if (!p.id) p.id = DK.uid('pg');
      if (!p.slug) p.slug = slugify(p.title || ('page-' + (i + 1)));
      if (typeof p.order !== 'number') p.order = i;
    });
    out.pages.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    if (!Array.isArray(out.hero.stats)) out.hero.stats = base.hero.stats;
    if (!Array.isArray(out.about.skills)) out.about.skills = [];

    out.version = base.version;
    return out;
  };

  /* -------------------------------------------------------------- zip writer */

  /**
   * Minimal ZIP (stored, no compression) writer.
   * Lets the dashboard export a ready-to-upload site folder without tooling.
   * @param {Array<{name:string,data:Uint8Array|string}>} files
   * @returns {Blob}
   */
  DK.zip = function (files) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;

    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    function crc32(buf) {
      var c = 0xFFFFFFFF;
      for (var i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function w16(v, o, val) { v.setUint16(o, val, true); }
    function w32(v, o, val) { v.setUint32(o, val >>> 0, true); }

    files.forEach(function (file) {
      var nameBytes = enc.encode(file.name);
      var data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      w32(lv, 0, 0x04034b50); w16(lv, 4, 20); w16(lv, 6, 0x0800);
      w16(lv, 8, 0); w16(lv, 10, 0); w16(lv, 12, 0x21);
      w32(lv, 14, crc); w32(lv, 18, data.length); w32(lv, 22, data.length);
      w16(lv, 26, nameBytes.length); w16(lv, 28, 0);
      local.set(nameBytes, 30);
      chunks.push(local, data);

      var cen = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cen.buffer);
      w32(cv, 0, 0x02014b50); w16(cv, 4, 20); w16(cv, 6, 20);
      w16(cv, 8, 0x0800); w16(cv, 10, 0); w16(cv, 12, 0); w16(cv, 14, 0x21);
      w32(cv, 16, crc); w32(cv, 20, data.length); w32(cv, 24, data.length);
      w16(cv, 28, nameBytes.length); w32(cv, 42, offset);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + data.length;
    });

    var centralSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    w32(ev, 0, 0x06054b50); w16(ev, 8, files.length); w16(ev, 10, files.length);
    w32(ev, 12, centralSize); w32(ev, 16, offset);

    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  };

  /* ----------------------------------------------------------- small ui bits */

  DK.toast = function (message, type) {
    var host = DK.dom.qs('#dk-toasts');
    if (!host) {
      host = DK.dom.el('div', { id: 'dk-toasts', class: 'dk-toasts', 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    var node = DK.dom.el('div', { class: 'dk-toast dk-toast--' + (type || 'info') }, esc(message));
    host.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-in'); });
    setTimeout(function () {
      node.classList.remove('is-in');
      setTimeout(function () { node.remove(); }, 400);
    }, 3400);
  };

  DK.copy = function (text) {
    if (global.navigator.clipboard && global.isSecureContext) {
      return global.navigator.clipboard.writeText(text)
        .then(function () { return true; }, function () { return false; });
    }
    return new Promise(function (resolve) {
      var ta = DK.dom.el('textarea', { style: 'position:fixed;top:0;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      resolve(ok);
    });
  };

  /** Trigger a browser download for a Blob. */
  DK.download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = DK.dom.el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  };

  /* --------------------------------------------------------- file content */

  /**
   * Apply the locally published draft (written by admin.html) over the
   * stored document. The draft wins when present, so edits made in the
   * dashboard show up on the public site on the next load.
   */
  function withDraft(doc) {
    var draft = DK.store.get('content', null);
    if (draft && typeof draft === 'object' && draft.__updatedAt) {
      try { return DK.normalise(draft); }
      catch (e) { /* fall back to the fetched document */ }
    }
    return doc;
  }

  /**
   * Load the content document.
   * Cloud-first: when firebase-bridge.js is present, the live Firestore
   * document wins so dashboard edits persist across devices and hosts.
   * Otherwise — or when Firestore is unreachable — fall back to
   * data/content.json (hosted), then data/content.js (works from file:// and
   * before any JSON upload), then built-in defaults, with a locally
   * published draft (DK.store key 'content') applied on top.
   * Pass localOnly = true to skip the cloud (used by the dashboard Reset).
   */
  DK.loadContent = function (base, localOnly) {
    base = base || DK.basePath();
    var seed = fetch(base + 'data/content.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (doc) { return withDraft(DK.normalise(doc)); })
      .catch(function () {
        return new Promise(function (resolve) {
          var s = document.createElement('script');
          s.src = base + 'data/content.js?v=' + Date.now();
          s.onload = function () {
            resolve(withDraft(DK.normalise(global.DK_CONTENT || {})));
            s.remove();
          };
          s.onerror = function () { resolve(DK.normalise({})); };
          document.head.appendChild(s);
        });
      });

    if (localOnly || !DK.cloud || typeof DK.cloud.fetch !== 'function') return seed;

    // Seed and Firestore resolve in parallel; the bridge bounds the cloud
    // call, so the worst case only adds FETCH_BUDGET to the local load.
    // Last-write-wins: the newer __updatedAt wins so a fresh local publish
    // is never clobbered by a stale Firestore doc after a refresh, and a
    // newer Firestore publish from another device still wins. The winner is
    // mirrored back to localStorage so refreshes are stable offline.
    var cloud = DK.cloud.fetch().then(function (remote) {
      if (remote && typeof remote === 'object' && remote.__updatedAt) return remote;
      return null;
    });
    return Promise.all([seed, cloud]).then(function (pair) {
      var localDoc = pair[0] || null;
      var remoteDoc = pair[1] || null;
      if (!remoteDoc) return localDoc;
      if (!localDoc) {
        try { DK.store.set('content', remoteDoc); } catch (e) { /* ignore */ }
        return remoteDoc;
      }
      var localAt = Number(localDoc.__updatedAt) || 0;
      var remoteAt = Number(remoteDoc.__updatedAt) || 0;
      if (remoteAt > localAt) {
        try { DK.store.set('content', remoteDoc); } catch (e) { /* ignore */ }
        return remoteDoc;
      }
      return localDoc;
    });
  };

  /**
   * Publish a content document from the dashboard. The draft is stored in
   * localStorage so the public page picks it up on the next load; export the
   * JSON from the dashboard to make the change permanent on the server.
   */
  DK.saveContent = function (doc) {
    var payload = DK.normalise(doc);
    payload.__updatedAt = Date.now();
    return DK.store.set('content', payload) ? payload : null;
  };

  /** Discard the published draft and fall back to the shipped seed. */
  DK.clearContent = function () { DK.store.del('content'); };

  /** True when a dashboard draft currently overrides the shipped seed. */
  DK.hasDraft = function () {
    var draft = DK.store.get('content', null);
    return !!(draft && typeof draft === 'object' && draft.__updatedAt);
  };

})(typeof window !== 'undefined' ? window : this);
