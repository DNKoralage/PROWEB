/* ==========================================================================
   DK — admin.js
   The secure CMS dashboard behind admin.html.
   A passcode gate guards a schema-driven editor for every collection and
   setting in data/content.json. Edits publish to Firestore (live across
   devices) with a localStorage backup, so the public site always has a
   copy; export writes the JSON for static-server fallback.
   No dependencies. Plain ES5+ like the rest of the codebase.
   ========================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK;
  var esc = DK.esc;
  var root = document.getElementById('admin-root');

  /* ------------------------------------------------------------------ auth */

  // Demo passcode for the static build. Real authentication needs a server;
  // everything past the gate is client-side by design (the JSON is public).
  var PASSCODE = 'dk-admin';

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function gate() { return fnv('dk|' + PASSCODE + '|studio'); }

  function session() {
    try { return global.sessionStorage.getItem('dk:admin-session'); }
    catch (e) { return null; }
  }
  function setSession(v) {
    try {
      if (v) global.sessionStorage.setItem('dk:admin-session', v);
      else global.sessionStorage.removeItem('dk:admin-session');
    } catch (e) { /* private mode */ }
  }
  function isAuthed() { return session() === gate(); }

  /* ----------------------------------------------------------------- state */

  var doc = null;        // working copy of the content document
  var panel = 'overview';
  var dirty = false;
  var openItem = null;   // list path of the expanded collection item
  var lastSyncedAt = 0;  // __updatedAt we last pushed to Firestore

  /** Read a dotted path ('collections.logos.0.title') from the doc. */
  function getPath(path) {
    return String(path).split('.').reduce(function (o, k) {
      return (o === undefined || o === null) ? undefined : o[k];
    }, doc);
  }

  /** Write a dotted path on the doc, creating plain objects as needed. */
  function setPath(path, value) {
    var keys = String(path).split('.');
    var o = doc;
    for (var i = 0; i < keys.length - 1; i++) {
      var k = keys[i];
      if (o[k] === undefined || o[k] === null || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = value;
    dirty = true;
    paintStatus();
  }

  function markDirty() { dirty = true; paintStatus(); }

  /* ------------------------------------------------------------- login ui */

  function renderLogin() {
    root.innerHTML = '';

    var wrap = DK.dom.el('div', { class: 'adm-login', id: 'adm-login' });

    var bg = DK.dom.el('div', { class: 'adm-login__bg', 'aria-hidden': 'true' });
    if (DK.foliage && DK.foliage.loaderLayers) {
      DK.foliage.loaderLayers({ deep: '#04160f', accent: '#31e0a1', accent2: '#6c8cff' })
        .forEach(function (layer) {
          var div = DK.dom.el('div', { class: 'dk-loader-layer', 'data-layer': layer.name });
          div.innerHTML = layer.html;
          bg.appendChild(div);
        });
    }
    wrap.appendChild(bg);

    var card = DK.dom.el('form', { class: 'adm-login__card', id: 'adm-login-form', autocomplete: 'off' });
    card.innerHTML =
      '<p class="adm-login__eyebrow">Devnith Koralage Creative Studio</p>' +
      '<h1 class="adm-login__title">Studio <em>Admin</em></h1>' +
      '<p class="adm-login__hint">Enter the studio passcode to manage collections, pages and settings.</p>' +
      '<label class="adm-field"><span>Passcode</span>' +
      '<input type="password" name="passcode" id="adm-pass" autocomplete="current-password" ' +
      'placeholder="••••••••" required></label>' +
      '<p class="adm-login__error" id="adm-login-error" role="alert"></p>' +
      '<button type="submit" class="adm-btn adm-btn--primary" style="justify-content:center">Unlock dashboard</button>' +
      '<div class="adm-login__foot">' +
      '<a href="index.html">&larr; Back to site</a></div>';
    wrap.appendChild(card);
    root.appendChild(wrap);

    var error = card.querySelector('#adm-login-error');
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = card.querySelector('#adm-pass');
      if (fnv(input.value || '') === fnv(PASSCODE)) {
        setSession(gate());
        if (DK.sound) DK.sound.play('success');
        boot();
      } else {
        error.textContent = 'Wrong passcode. Try again.';
        card.classList.remove('is-shake');
        void card.offsetWidth;             // restart the shake animation
        card.classList.add('is-shake');
        input.select();
        if (DK.sound) DK.sound.play('error');
      }
    });

    var pass = card.querySelector('#adm-pass');
    if (pass) pass.focus();
  }

  function lock() {
    setSession(null);
    if (DK.sound) DK.sound.play('close');
    renderLogin();
  }

  /* --------------------------------------------------------------- fields */

  var uidCounters = {};
  function uid(prefix) {
    uidCounters[prefix] = (uidCounters[prefix] || 0) + 1;
    return prefix + '-' + Date.now().toString(36) + uidCounters[prefix];
  }

  /* ---------------------------------------------------------------- upload */

  /**
   * POST a file to api/upload.php (Hostinger/PHP hosts) and return the stored
   * relative path. Falls back to data-URL embedding when no endpoint answers,
   * so the dashboard still works on hosts without PHP (small files only).
   */
  function uploadFile(file, onOk, onErr) {
    var endpoint = DK.basePath() + 'api/upload.php';
    var fd = new FormData();
    fd.append('file', file);

    fetch(endpoint, {
      method: 'POST',
      body: fd,
      // Same gate value the dashboard session uses; stops naive drive-by
      // posts without pretending to be real authentication.
      headers: { 'X-DK-Token': gate() }
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.path) onOk(j.path);
        else if (j && j.error) {
          // Endpoint replied but refused — surface it, no silent fallback.
          onErr(j.error);
        } else {
          onErr('Upload rejected.');
        }
      })
      .catch(function () {
        // No PHP endpoint (file:// or static-only host): embed as a data URL
        // so the edit still works. Warn for large files.
        if (file.size > 2 * 1024 * 1024) {
          onErr('Upload endpoint unavailable and file is over 2 MB — set a URL instead.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () { onOk(String(reader.result)); };
        reader.onerror = function () { onErr('Could not read the file.'); };
        reader.readAsDataURL(file);
      });
  }

  /**
   * Text input for an image/media path plus an Upload button.
   * @param {object} o field options (path, label, hint, accept)
   */
  // Dashboard media cap: 50 MB per file (api/upload.php enforces it too).
  var DK_UPLOAD_LIMIT = 50 * 1024 * 1024;
  var DK_UPLOAD_BATCH = 20;

  function fmtSize(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes) return '';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
  }

  /** XHR single upload with progress (fraction 0..1). */
  function uploadOne(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', DK.basePath() + 'api/upload.php', true);
      xhr.setRequestHeader('X-DK-Token', gate());
      if (xhr.upload && onProgress) {
        xhr.upload.addEventListener('progress', function (e) {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        });
      }
      xhr.onload = function () {
        var body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.ok && body.path) resolve(body.path);
        else reject(new Error((body && body.error) || ('Upload failed (HTTP ' + xhr.status + ').')));
      };
      xhr.onerror = function () { reject(new Error('Network error during upload.')); };
      var fd = new FormData();
      fd.append('file', file, file.name);
      xhr.send(fd);
    });
  }

  /** POST a files[] batch; resolves { files:[], errors:[] }. */
  function uploadBatch(files, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', DK.basePath() + 'api/upload.php', true);
      xhr.setRequestHeader('X-DK-Token', gate());
      if (xhr.upload && onProgress) {
        xhr.upload.addEventListener('progress', function (e) {
          if (e.lengthComputable) onProgress(e.loaded / Math.max(1, e.total));
        });
      }
      xhr.onload = function () {
        var body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.ok) {
          resolve({ files: body.files || [], errors: body.errors || [] });
        } else {
          reject(new Error((body && body.error) || ('Batch upload failed (HTTP ' + xhr.status + ').')));
        }
      };
      xhr.onerror = function () { reject(new Error('Network error during upload.')); };
      var fd = new FormData();
      files.forEach(function (f) { fd.append('files[]', f, f.name); });
      xhr.send(fd);
    });
  }

  function uploadField(o, value) {
    var multi = !!o.multi;
    var wrap = DK.dom.el('div', { class: 'adm-field adm-field--upload' + (multi ? ' is-multi' : '') });
    wrap.appendChild(DK.dom.el('span', null, esc(o.label)));

    var row = DK.dom.el('div', { class: 'adm-field__row' });
    var input = DK.dom.el('input', { type: 'text' });
    input.value = value === undefined || value === null ? '' : String(value);
    input.addEventListener('input', function () { setPath(o.path, input.value); });

    // Progress bar shared by single + batch uploads.
    var bar = DK.dom.el('div', { class: 'adm-up__bar', hidden: '' });
    var fill = DK.dom.el('div', { class: 'adm-up__fill' });
    bar.appendChild(fill);
    var msg = DK.dom.el('p', { class: 'adm-up__msg' });

    var btn = DK.dom.el('button', { type: 'button', class: 'adm-btn adm-btn--sm' },
      multi ? 'Upload images' : 'Upload');

    function busy(b, label, frac) {
      btn.disabled = !!b;
      btn.textContent = b ? (label || 'Uploading...') : (multi ? 'Upload images' : 'Upload');
      if (b) bar.removeAttribute('hidden'); else bar.setAttribute('hidden', '');
      fill.style.width = Math.round((frac || 0) * 100) + '%';
      if (!b && !label) msg.textContent = '';
      else if (label) msg.textContent = label;
    }

    function finish(paths, errs) {
      busy(false);
      if (paths.length && !multi) {
        input.value = paths[0];
        setPath(o.path, paths[0]);
      }
      if (paths.length && multi && typeof o.onPaths === 'function') o.onPaths(paths);
      if (DK.sound) DK.sound.play(errs.length ? 'error' : 'success');
      if (paths.length && !errs.length) {
        DK.toast(multi ? ('Uploaded ' + paths.length + ' images') : ('Uploaded ' + paths[0]), 'success');
      } else if (paths.length && errs.length) {
        DK.toast('Uploaded ' + paths.length + ', ' + errs.length + ' failed', 'error');
      } else if (errs.length) {
        DK.toast(errs[0].error || 'Upload failed', 'error');
      }
      renderPanel();
    }

    function precheck(files) {
      for (var q = 0; q < files.length; q++) {
        if ((o.accept || 'image/*').indexOf('image') >= 0 && !/^image\//i.test(files[q].type || '')) {
          return files[q].name + ' is not an image.';
        }
        if (files[q].size > DK_UPLOAD_LIMIT) return files[q].name + ' is over 50 MB.';
      }
      return '';
    }

    function send(files) {
      files = Array.prototype.slice.call(files || []);
      if (!files.length) return;
      if (!multi) files = files.slice(0, 1);
      if (files.length > DK_UPLOAD_BATCH) files = files.slice(0, DK_UPLOAD_BATCH);
      var bad = precheck(files);
      if (bad) { DK.toast(bad, 'error'); return; }
      busy(true, 'Uploading 0/' + files.length, 0);
      var paths = []; var errs = [];
      if (files.length > 1) {
        uploadBatch(files, function (f) { busy(true, 'Uploading...', f); }).then(function (res) {
          (res.files || []).forEach(function (f) { paths.push(f.path); });
          (res.errors || []).forEach(function (e) { errs.push(e); });
          finish(paths, errs);
        }, function (err) { busy(false); DK.toast(err.message || 'Upload failed', 'error'); });
      } else {
        uploadOne(files[0], function (f) { busy(true, 'Uploading...', f); }).then(function (p) {
          finish([p], []);
        }, function (err) { busy(false); DK.toast(err.message || 'Upload failed', 'error'); });
      }
    }

    btn.addEventListener('click', function () {
      var picker = DK.dom.el('input', { type: 'file', accept: o.accept || 'image/*' });
      if (multi) picker.setAttribute('multiple', 'multiple');
      picker.addEventListener('change', function () { send(picker.files); });
      picker.click();
    });

    row.appendChild(input);
    row.appendChild(btn);
    wrap.appendChild(row);
    wrap.appendChild(bar);
    wrap.appendChild(msg);

    // Drag-and-drop straight onto the field.
    wrap.addEventListener('dragover', function (e) { e.preventDefault(); wrap.classList.add('is-drop'); });
    wrap.addEventListener('dragleave', function () { wrap.classList.remove('is-drop'); });
    wrap.addEventListener('drop', function (e) {
      e.preventDefault(); wrap.classList.remove('is-drop');
      if (e.dataTransfer && e.dataTransfer.files) send(e.dataTransfer.files);
    });
    if (o.hint) wrap.appendChild(DK.dom.el('small', { class: 'adm-field__note' }, esc(o.hint)));
    return wrap;
  }

  /**
   * Build one labelled control bound to a dotted path.
   * @param {object} o { path, label, type, options, rows, hint, min, max }
   *   type: text | textarea | number | url | color | check | select | csv |
   *         image (text input + Upload button → api/upload.php)
   */
  function field(o) {
    var type = o.type || 'text';
    var value = getPath(o.path);

    if (type === 'check') {
      var lab = DK.dom.el('label', { class: 'adm-field adm-field--check' });
      var box = DK.dom.el('input', { type: 'checkbox' });
      box.checked = !(value === false || value === undefined || value === null);
      box.addEventListener('change', function () { setPath(o.path, box.checked); });
      lab.appendChild(box);
      lab.appendChild(DK.dom.el('span', null, esc(o.label)));
      return lab;
    }

    if (type === 'image') return uploadField(o, value);

    var wrap = DK.dom.el('label', { class: 'adm-field' + (type === 'color' ? ' adm-field--color' : '') });
    wrap.appendChild(DK.dom.el('span', null, esc(o.label)));

    var el;
    if (type === 'textarea') {
      el = DK.dom.el('textarea', { rows: String(o.rows || 4) });
      el.value = value === undefined || value === null ? '' : String(value);
      el.addEventListener('input', function () { setPath(o.path, el.value); });
    } else if (type === 'select') {
      el = DK.dom.el('select');
      (o.options || []).forEach(function (opt) {
        el.appendChild(DK.dom.el('option', { value: esc(opt) }, esc(opt)));
      });
      el.value = value === undefined || value === null ? '' : String(value);
      el.addEventListener('change', function () { setPath(o.path, el.value); });
    } else if (type === 'csv') {
      el = DK.dom.el('input', { type: 'text' });
      el.value = Array.isArray(value) ? value.join(', ') : (value || '');
      el.addEventListener('input', function () {
        setPath(o.path, el.value.split(',').map(function (s) { return s.trim(); })
          .filter(function (s) { return !!s; }));
      });
    } else {
      el = DK.dom.el('input', {
        type: type === 'number' ? 'number' : (type === 'color' ? 'color' : (type === 'url' ? 'url' : 'text'))
      });
      if (o.min !== undefined) el.min = String(o.min);
      if (o.max !== undefined) el.max = String(o.max);
      el.value = value === undefined || value === null ? '' : String(value);
      el.addEventListener(type === 'color' || type === 'number' ? 'change' : 'input', function () {
        setPath(o.path, type === 'number' ? Number(el.value) : el.value);
      });
    }
    wrap.appendChild(el);
    if (o.hint) wrap.appendChild(DK.dom.el('small', { class: 'adm-field__note' }, esc(o.hint)));
    return wrap;
  }

  /** Grid of fields. */
  function fields(list, wide) {
    var grid = DK.dom.el('div', { class: 'adm-fields' + (wide ? ' adm-fields--wide' : '') });
    list.forEach(function (o) { grid.appendChild(field(o)); });
    return grid;
  }

  /** Card wrapper with heading + optional tool buttons. */
  function card(title, hint) {
    var c = DK.dom.el('section', { class: 'adm-card' });
    var head = DK.dom.el('div', { class: 'adm-card__head' });
    head.appendChild(DK.dom.el('h3', { class: 'adm-card__title' }, esc(title)));
    if (hint) head.appendChild(DK.dom.el('p', { class: 'adm-card__hint' }, esc(hint)));
    c.appendChild(head);
    c._head = head;
    return c;
  }

  function toolBtn(label, cls, title) {
    return DK.dom.el('button', {
      type: 'button', class: 'adm-btn adm-btn--sm ' + (cls || ''), title: esc(title || label)
    }, esc(label));
  }

  /* ------------------------------------------------------------ list editor */

  /** Repeatable list: add / remove / reorder / duplicate / inline edit. */
  function listEditor(o) {
    var c = card(o.title, o.hint);
    var list = getPath(o.path);
    if (!Array.isArray(list)) list = [];

    function reindex(path) {
      var arr = getPath(path);
      if (Array.isArray(arr)) arr.forEach(function (it, n) {
        if (it && typeof it === 'object' && 'order' in it) it.order = n + 1;
      });
      markDirty();
    }

    var addBtn = toolBtn('+ ' + (o.addLabel || 'Add'), 'adm-btn--primary', 'Add entry');
    addBtn.style.marginLeft = 'auto';
    addBtn.addEventListener('click', function () {
      var arr = getPath(o.path);
      if (!Array.isArray(arr)) arr = [];
      arr.push(o.makeNew());
      setPath(o.path, arr);
      reindex(o.path);
      openItem = o.path + '.' + (arr.length - 1);
      if (DK.sound) DK.sound.play('click');
      renderPanel();
    });
    c._head.appendChild(addBtn);

    var wrap = DK.dom.el('div', { class: 'adm-list' });
    if (!list.length) {
      wrap.appendChild(DK.dom.el('p', { class: 'adm-card__hint' }, 'Nothing here yet — add the first entry.'));
    }

    list.forEach(function (item, i) {
      var base = o.path + '.' + i;
      var isOpen = openItem === base;
      var node = DK.dom.el('article', { class: 'adm-item' + (isOpen ? ' is-open' : '') });

      var name = (item && (item[o.nameKey || 'title'] || item.name || item.label)) || 'Untitled';
      var meta = (item && item.category) || '';

      var bar = DK.dom.el('button', { type: 'button', class: 'adm-item__bar' });
      bar.innerHTML =
        '<span class="adm-item__index">' + (i + 1) + '</span>' +
        '<span class="adm-item__name">' + esc(String(name)) +
        (meta ? ' <em>· ' + esc(String(meta)) + '</em>' : '') + '</span>';
      var tools = DK.dom.el('span', { class: 'adm-item__tools' });

      function move(delta) {
        var arr = getPath(o.path);
        var j = i + delta;
        if (j < 0 || j >= arr.length) return;
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        openItem = o.path + '.' + j;
        reindex(o.path);
        if (DK.sound) DK.sound.play('toggleOn');
        renderPanel();
      }

      var up = toolBtn('↑', 'adm-btn--sm', 'Move up');
      var down = toolBtn('↓', 'adm-btn--sm', 'Move down');
      var dup = toolBtn('⧉', 'adm-btn--sm', 'Duplicate');
      var del = toolBtn('✕', 'adm-btn--sm adm-btn--danger', 'Delete');
      up.addEventListener('click', function (e) { e.stopPropagation(); move(-1); });
      down.addEventListener('click', function (e) { e.stopPropagation(); move(1); });
      dup.addEventListener('click', function (e) {
        e.stopPropagation();
        var arr = getPath(o.path);
        var copy = JSON.parse(JSON.stringify(item || {}));
        copy.id = uid('c');
        arr.splice(i + 1, 0, copy);
        openItem = o.path + '.' + (i + 1);
        reindex(o.path);
        if (DK.sound) DK.sound.play('click');
        renderPanel();
      });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!global.confirm('Delete "' + name + '"?')) return;
        getPath(o.path).splice(i, 1);
        if (openItem === base) openItem = null;
        reindex(o.path);
        if (DK.sound) DK.sound.play('error');
        renderPanel();
      });
      [up, down, dup, del].forEach(function (b) { tools.appendChild(b); });
      bar.appendChild(tools);

      bar.addEventListener('click', function () {
        openItem = isOpen ? null : base;
        if (DK.sound) DK.sound.play(isOpen ? 'close' : 'open');
        renderPanel();
      });
      node.appendChild(bar);

      if (isOpen) {
        var body = DK.dom.el('div', { class: 'adm-item__body' });
        (o.schema || []).forEach(function (f) {
          if (f.gallery) {
            body.appendChild(galleryEditor({
              path: base + '.' + f.gallery, label: f.label,
              uploadLabel: 'Add to ' + f.label
            }));
          } else if (f.list) {
            body.appendChild(subList({
              path: base + '.' + f.key, label: f.label,
              schema: f.list.schema, makeNew: f.list.makeNew
            }));
          } else {
            body.appendChild(field({
              path: base + '.' + f.key, label: f.label, type: f.type,
              options: f.options, rows: f.rows, hint: f.hint, accept: f.accept
            }));
          }
        });
        node.appendChild(body);
      }

      wrap.appendChild(node);
    });

    c.appendChild(wrap);
    return c;
  }

  /**
   * Reorderable gallery editor: drag-and-drop thumbnails (HTML5 DnD +
   * keyboard arrows), per-image remove, and a bulk upload dropzone.
   * Items are { src, caption, order }; onChange fires with the new order.
   */
  function galleryEditor(o) {
    var wrap = DK.dom.el('div', { class: 'adm-gallery' });
    wrap.appendChild(DK.dom.el('span', { class: 'adm-field__note' }, esc(o.label || 'Images')));

    var items = getPath(o.path);
    if (!Array.isArray(items)) items = [];

    var strip = DK.dom.el('div', { class: 'adm-order', role: 'list', 'aria-label': 'Image order' });
    var dragFrom = -1;

    function commit() {
      items.forEach(function (it, n) { if (it) it.order = n + 1; });
      setPath(o.path, items);
      paint();
    }

    function paint() {
      strip.innerHTML = '';
      if (!items.length) {
        strip.appendChild(DK.dom.el('p', { class: 'adm-order__empty' }, 'No images yet - upload below.'));
        return;
      }
      items.forEach(function (it, n) {
        var tile = DK.dom.el('div', { class: 'adm-order__tile', role: 'listitem', tabindex: '0',
          draggable: 'true', 'aria-label': 'Image ' + (n + 1) + ' of ' + items.length });
        var src = DK.mediaSrc(DK.safeMedia(it && it.src));
        if (src) tile.appendChild(DK.dom.el('img', { src: src, alt: (it && it.caption) || ('Image ' + (n + 1)) }));
        tile.appendChild(DK.dom.el('span', { class: 'adm-order__num' }, String(n + 1)));
        var rm = DK.dom.el('button', { type: 'button', class: 'adm-order__rm', 'aria-label': 'Remove' }, 'x');
        rm.addEventListener('click', function (e) {
          e.stopPropagation();
          items.splice(n, 1);
          commit();
          if (DK.sound) DK.sound.play('error');
        });
        tile.appendChild(rm);
        tile.addEventListener('dragstart', function (e) {
          dragFrom = n;
          tile.classList.add('is-drag');
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(n)); } catch (x) {}
        });
        tile.addEventListener('dragend', function () { tile.classList.remove('is-drag'); dragFrom = -1; });
        tile.addEventListener('dragover', function (e) { e.preventDefault(); tile.classList.add('is-over'); });
        tile.addEventListener('dragleave', function () { tile.classList.remove('is-over'); });
        tile.addEventListener('drop', function (e) {
          e.preventDefault(); tile.classList.remove('is-over');
          var from = dragFrom >= 0 ? dragFrom : parseInt((e.dataTransfer.getData('text/plain') || '-1'), 10);
          if (from >= 0 && from < items.length && from !== n) {
            var mv = items.splice(from, 1)[0];
            items.splice(n, 0, mv);
            commit();
            if (DK.sound) DK.sound.play('toggleOn');
          }
          dragFrom = -1;
        });
        tile.addEventListener('keydown', function (e) {
          var j = -1;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = n - 1;
          else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = n + 1;
          else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault(); items.splice(n, 1); commit(); return;
          } else return;
          e.preventDefault();
          if (j < 0 || j >= items.length) return;
          var mv = items.splice(n, 1)[0];
          items.splice(j, 0, mv);
          commit();
        });
        strip.appendChild(tile);
      });
    }

    paint();
    wrap.appendChild(strip);

    // Bulk upload straight into this gallery.
    var up = uploadField({
      path: o.path + '.__bulk', label: (o.uploadLabel || 'Add images'), hint: 'Select many or drop files - 50 MB each.',
      accept: 'image/*', multi: true,
      onPaths: function (paths) {
        paths.forEach(function (p, k) {
          items.push({ id: uid('im'), src: p, caption: '', order: items.length + 1 + k });
        });
        commit();
      }
    });
    // The bulk row has no text path to edit; hide its text input.
    var junk = up.querySelector('input[type=text]');
    if (junk && junk.parentNode) junk.parentNode.removeChild(junk);
    var lbl = up.querySelector(':scope > span');
    if (lbl && lbl.parentNode) lbl.parentNode.removeChild(lbl);
    wrap.appendChild(up);

    // Caption editing for each image.
    items.forEach(function (it, n) {
      wrap.appendChild(field({ path: o.path + '.' + n + '.caption', label: 'Caption ' + (n + 1) }));
    });

    return wrap;
  }

  /** Nested sub-list (photos, images) shown inside an open item. */
  function subList(o) {
    var wrap = DK.dom.el('div', { class: 'adm-sublist' });
    wrap.appendChild(DK.dom.el('span', { class: 'adm-field__note' }, esc(o.label)));

    var arr = getPath(o.path);
    if (!Array.isArray(arr)) arr = [];

    var addBtn = toolBtn('+ Add', 'adm-btn--sm adm-btn--primary', 'Add entry');
    addBtn.addEventListener('click', function () {
      var a = getPath(o.path);
      if (!Array.isArray(a)) a = [];
      a.push(o.makeNew());
      setPath(o.path, a);
      renderPanel();
    });
    wrap.appendChild(addBtn);

    arr.forEach(function (item, i) {
      var base = o.path + '.' + i;
      var row = DK.dom.el('div', { class: 'adm-sublist__item' });
      var grid = DK.dom.el('div', { class: 'adm-fields' });
      (o.schema || []).forEach(function (f) {
        grid.appendChild(field({
          path: base + '.' + f.key, label: f.label,
          type: f.type, rows: f.rows, options: f.options, hint: f.hint
        }));
      });
      row.appendChild(grid);

      var tools = DK.dom.el('div', { class: 'adm-sublist__tools' });
      var del = toolBtn('✕', 'adm-btn--sm adm-btn--danger', 'Remove');
      del.addEventListener('click', function () {
        getPath(o.path).splice(i, 1);
        renderPanel();
      });
      tools.appendChild(del);
      row.appendChild(tools);
      wrap.appendChild(row);
    });

    if (!arr.length) wrap.appendChild(DK.dom.el('p', { class: 'adm-card__hint' }, 'No entries.'));
    return wrap;
  }

  /* --------------------------------------------------------------- schemas */

  var IMG_SUB = { schema: [{ key: 'src', label: 'Image src', type: 'image' }, { key: 'caption', label: 'Caption' }] };

  function newId(p) { return uid(p); }

  function makeNew(kind) {
    var year = String(new Date().getFullYear());
    if (kind === 'logos') return { id: newId('l'), title: 'New logo', client: '', category: 'Wordmark', year: year, image: '', alt: '', description: '', tags: [], featured: false, order: 0 };
    if (kind === 'graphics') return { id: newId('g'), title: 'New project', client: '', category: 'Campaign', year: year, description: '', tags: [], featured: false, order: 0, images: [], body: '' };
    if (kind === 'photography') return { id: newId('p'), title: 'New album', category: 'Nature', cover: '', description: '', date: '', location: '', order: 0, photos: [] };
    if (kind === 'videography') return { id: newId('v'), title: 'New film', category: 'Documentary', type: 'link', url: '', poster: '', description: '', duration: '', order: 0 };
    if (kind === 'journal') return { id: newId('j'), title: 'New post', date: '', excerpt: '', body: '', tags: [], cover: '', published: true, order: 0 };
    if (kind === 'showcase') return { id: newId('w'), title: 'New site', category: 'Website', image: '', url: '', description: '', order: 0 };
    if (kind === 'experience') return { id: newId('exp'), role: 'New role', org: '', period: '', detail: '', order: 0 };
    if (kind === 'social') return { id: newId('sl'), name: 'New network', url: '', icon: '' };
    if (kind === 'nav') return { id: newId('nav'), label: 'New link', href: '#top', visible: true };
    if (kind === 'pages') return { id: newId('pg'), title: 'New page', slug: 'new-page', body: '', published: false, inNav: false, order: 0 };
    if (kind === 'stats') return { id: newId('s'), value: '0', label: 'New stat' };
    if (kind === 'stations') return { id: newId('r'), logo: '', name: 'New server', showTitle: '', showSubtitle: '', url: '', genre: 'Ambient', color: '#31e0a1', enabled: true };
    if (kind === 'photo') return { id: newId('ph'), src: '', caption: '', order: 0 };
    return { id: newId('x') };
  }

  var SCHEMAS = {
    logos: [
      { key: 'title', label: 'Title' }, { key: 'client', label: 'Client' },
      { key: 'category', label: 'Category' }, { key: 'year', label: 'Year' },
      { key: 'image', label: 'Image', type: 'image' }, { key: 'alt', label: 'Alt text' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { key: 'tags', label: 'Tags (comma separated)', type: 'csv' },
      { key: 'featured', label: 'Featured', type: 'check' }
    ],
    graphics: [
      { key: 'title', label: 'Title' }, { key: 'client', label: 'Client' },
      { key: 'category', label: 'Category' }, { key: 'year', label: 'Year' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { key: 'tags', label: 'Tags (comma separated)', type: 'csv' },
      { key: 'featured', label: 'Featured', type: 'check' },
      { key: 'body', label: 'Case study body', type: 'textarea', rows: 6 },
      { key: 'images', label: 'Project images', gallery: 'images', list: { schema: IMG_SUB.schema, makeNew: function () { return makeNew('photo'); } } }
    ],
    photography: [
      { key: 'title', label: 'Album title' }, { key: 'category', label: 'Category' },
      { key: 'cover', label: 'Cover', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { key: 'date', label: 'Date', hint: 'YYYY-MM-DD' },
      { key: 'location', label: 'Location' },
      { key: 'photos', label: 'Photos (max 200)', gallery: 'photos', list: { schema: IMG_SUB.schema, makeNew: function () { return makeNew('photo'); } } }
    ],
    videography: [
      { key: 'title', label: 'Title' }, { key: 'category', label: 'Category' },
      { key: 'type', label: 'Source', type: 'select', options: ['link', 'upload'] },
      { key: 'url', label: 'Video URL', type: 'url' },
      { key: 'poster', label: 'Poster', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { key: 'duration', label: 'Duration', hint: 'MM:SS' }
    ],
    journal: [
      { key: 'title', label: 'Title' }, { key: 'date', label: 'Date', hint: 'YYYY-MM-DD' },
      { key: 'excerpt', label: 'Excerpt', type: 'textarea', rows: 3 },
      { key: 'body', label: 'Body (markdown)', type: 'textarea', rows: 8 },
      { key: 'tags', label: 'Tags (comma separated)', type: 'csv' },
      { key: 'cover', label: 'Cover', type: 'image' },
      { key: 'published', label: 'Published', type: 'check' }
    ],
    showcase: [
      { key: 'title', label: 'Site title' },
      { key: 'category', label: 'Category' },
      { key: 'image', label: 'Preview image', type: 'image' },
      { key: 'url', label: 'Live URL', type: 'url', hint: 'Opens in a new tab' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3 }
    ],
    experience: [
      { key: 'role', label: 'Role' },
      { key: 'org', label: 'Organisation' },
      { key: 'period', label: 'Period', hint: 'e.g. 2021 – 2025' },
      { key: 'detail', label: 'Detail', type: 'textarea', rows: 3 }
    ],
    social: [
      { key: 'name', label: 'Name' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'icon', label: 'Icon key', hint: 'linkedin, facebook, instagram...' }
    ],
    nav: [
      { key: 'label', label: 'Label' }, { key: 'href', label: 'Href', hint: '#section id' },
      { key: 'visible', label: 'Visible', type: 'check' }
    ],
    pages: [
      { key: 'title', label: 'Title' }, { key: 'slug', label: 'Slug' },
      { key: 'body', label: 'Body (markdown)', type: 'textarea', rows: 8 },
      { key: 'published', label: 'Published', type: 'check' },
      { key: 'inNav', label: 'Show in navigation', type: 'check' }
    ],
    stats: [
      { key: 'value', label: 'Value' }, { key: 'label', label: 'Label' }
    ],
    stations: [
      { key: 'logo', label: 'Station logo / artwork', type: 'image' },
      { key: 'name', label: 'Server / station name' },
      { key: 'showTitle', label: 'Current song / show title' },
      { key: 'showSubtitle', label: 'Subtitle / artist' },
      { key: 'url', label: 'Stream URL', type: 'url' },
      { key: 'genre', label: 'Genre' },
      { key: 'color', label: 'Colour', type: 'color' },
      { key: 'enabled', label: 'Enabled', type: 'check' }
    ]
  };

  /* --------------------------------------------------------------- panels */

  function count(kind) {
    var col = doc.collections || {};
    if (kind === 'logos') return (col.logos || []).length;
    if (kind === 'graphics') return (col.graphics || []).length;
    if (kind === 'albums') return (col.photography || []).length;
    if (kind === 'videos') return (col.videography || []).length;
    if (kind === 'posts') return (col.journal || []).length;
    if (kind === 'showcase') return (col.showcase || []).length;
    if (kind === 'pages') return (doc.pages || []).length;
    if (kind === 'nav') return (doc.nav || []).length;
    if (kind === 'frames') return (col.photography || []).reduce(function (n, a) {
      return n + ((a.photos || []).length);
    }, 0);
    if (kind === 'stations') return ((doc.radio || {}).stations || []).length;
    if (kind === 'server') {
      return ((doc.radio || {}).stations || []).filter(function (s) { return s.enabled !== false; }).length;
    }
    return 0;
  }

  function statTile(value, label, target) {
    var tile = DK.dom.el('a', {
      class: 'dk-dashboard__tile', href: '#', 'data-goto': target
    },
      '<span class="dk-dashboard__value">' + esc(String(value)) + '</span>' +
      '<span class="dk-dashboard__label">' + esc(label) + '</span>');
    tile.addEventListener('click', function (e) { e.preventDefault(); go(target); });
    return tile;
  }

  var renderers = {
    overview: function () {
      var out = [];

      var note = DK.dom.el('div', { class: 'adm-note' });
      note.innerHTML = '<strong>Studio dashboard.</strong> Every edit lives in this browser until you press ' +
        '<strong>Publish</strong> — it then syncs to <strong>Firestore</strong> (live on every device) ' +
        'and keeps a local backup. Export the JSON for a static-server fallback.';
      out.push(note);

      var stats = DK.dom.el('div', { class: 'adm-stats' });
      stats.appendChild(statTile(count('logos'), 'Logos', 'logos'));
      stats.appendChild(statTile(count('graphics'), 'Graphic projects', 'graphics'));
      stats.appendChild(statTile(count('albums'), 'Photo albums', 'photography'));
      stats.appendChild(statTile(count('videos'), 'Films', 'videography'));
      stats.appendChild(statTile(count('posts'), 'Journal posts', 'journal'));
      stats.appendChild(statTile(count('pages'), 'Pages', 'pages'));
      stats.appendChild(statTile(count('server'), 'Live server nodes', 'servers'));
      stats.appendChild(statTile(count('nav'), 'Nav links', 'nav'));
      out.push(stats);

      var cols = card('Featured campaign', 'Graphic design');
      cols.appendChild(fields([
        { path: 'sections.graphics.title', label: 'Section title' },
        { path: 'sections.graphics.blurb', label: 'Section blurb' },
        { path: 'hero.title', label: 'Hero title' },
        { path: 'hero.titleAccent', label: 'Hero accent line' }
      ]));
      out.push(cols);

      return out;
    },

    site: function () {
      var identity = card('Identity', 'Branding shown across the site');
      identity.appendChild(fields([
        { path: 'site.name', label: 'Short name (nav + title)' },
        { path: 'site.fullName', label: 'Full name' },
        { path: 'site.tagline', label: 'Tagline' },
        { path: 'site.browserTitle', label: 'Browser tab title', hint: 'Shown in the tab / history' },
        { path: 'site.accent', label: 'Accent', type: 'color' },
        { path: 'site.accent2', label: 'Accent 2', type: 'color' }
      ]));
      identity.appendChild(fields([
        { path: 'site.description', label: 'Meta description', type: 'textarea', rows: 2 }
      ], true));

      var contact = card('Contact & availability');
      contact.appendChild(fields([
        { path: 'site.contactEmail', label: 'Email' },
        { path: 'site.phone', label: 'Phone' },
        { path: 'site.location', label: 'Location' },
        { path: 'site.availability', label: 'Availability line' },
        { path: 'site.footerNote', label: 'Footer note' }
      ]));

      // Editable social list (site.socialLinks). The legacy fixed-key
      // site.social object is migrated into it by DK.normalise on load.
      var social = listEditor({
        path: 'site.socialLinks', title: 'Social links',
        hint: 'Shown in the footer. Leave the URL blank to hide an entry.',
        schema: SCHEMAS.social, addLabel: 'Add link',
        makeNew: function () { return makeNew('social'); }, nameKey: 'name'
      });

      return [identity, contact, social];
    },

    nav: function () {
      return [listEditor({
        path: 'nav', title: 'Navigation links',
        hint: 'Shown in the header and the mobile drawer. Order = display order.',
        schema: SCHEMAS.nav, addLabel: 'Add link',
        makeNew: function () { return makeNew('nav'); }, nameKey: 'label'
      })];
    },

    hero: function () {
      var hero = card('Hero');
      hero.appendChild(fields([
        { path: 'hero.eyebrow', label: 'Eyebrow' },
        { path: 'hero.image', label: 'Background image', type: 'image' },
        { path: 'hero.title', label: 'Title' },
        { path: 'hero.titleAccent', label: 'Accent line' },
        { path: 'hero.subtitle', label: 'Subtitle', type: 'textarea', rows: 3 }
      ], true));
      hero.appendChild(fields([
        { path: 'hero.ctaText', label: 'Primary CTA' },
        { path: 'hero.ctaHref', label: 'Primary href' },
        { path: 'hero.secondaryText', label: 'Secondary CTA' },
        { path: 'hero.secondaryHref', label: 'Secondary href' }
      ]));

      var stats = listEditor({
        path: 'hero.stats', title: 'Hero stats',
        schema: SCHEMAS.stats, addLabel: 'Add stat',
        makeNew: function () { return makeNew('stats'); }, nameKey: 'label'
      });

      return [hero, stats];
    },

    about: function () {
      var about = card('About');
      about.appendChild(fields([
        { path: 'about.title', label: 'Title' },
        { path: 'about.image', label: 'Portrait', type: 'image' },
        { path: 'about.clients', label: 'Selected clients' },
        { path: 'about.skills', label: 'Skills (comma separated)', type: 'csv' },
        { path: 'about.cv', label: 'CV / résumé', type: 'image', accept: '.pdf,.doc,.docx', hint: 'PDF or DOC, shown as a Download CV button' }
      ]));
      about.appendChild(fields([
        { path: 'about.body', label: 'Body', type: 'textarea', rows: 5 }
      ], true));

      var exp = listEditor({
        path: 'about.experience', title: 'Experience timeline',
        hint: 'Entries from the CV, shown under the About summary.',
        schema: SCHEMAS.experience, addLabel: 'Add role',
        makeNew: function () { return makeNew('experience'); }, nameKey: 'role'
      });

      return [about, exp];
    },

    sections: function () {
      var out = [];
      Object.keys(doc.sections || {}).forEach(function (key) {
        var s = doc.sections[key];
        var c = card(s.title || key, key);
        c.appendChild(fields([
          { path: 'sections.' + key + '.enabled', label: 'Enabled', type: 'check' },
          { path: 'sections.' + key + '.title', label: 'Title' },
          { path: 'sections.' + key + '.kicker', label: 'Kicker' }
        ]));
        c.appendChild(fields([
          { path: 'sections.' + key + '.blurb', label: 'Blurb', type: 'textarea', rows: 2 }
        ], true));
        out.push(c);
      });
      return out;
    }
  };

  /* Collection panels: a list editor per collection. */
  renderers.logos = function () {
    return [listEditor({
      path: 'collections.logos', title: 'Logos portfolio',
      hint: 'Marks, monograms and wordmarks.',
      schema: SCHEMAS.logos, addLabel: 'Add logo',
      makeNew: function () { return makeNew('logos'); }, nameKey: 'title'
    })];
  };

  renderers.graphics = function () {
    return [listEditor({
      path: 'collections.graphics', title: 'Graphic design projects',
      hint: 'Campaigns such as the Johnian School Walk.',
      schema: SCHEMAS.graphics, addLabel: 'Add project',
      makeNew: function () { return makeNew('graphics'); }, nameKey: 'title'
    })];
  };

  renderers.photography = function () {
    return [listEditor({
      path: 'collections.photography', title: 'Photography albums',
      hint: 'Up to 200 frames per album.',
      schema: SCHEMAS.photography, addLabel: 'Add album',
      makeNew: function () { return makeNew('photography'); }, nameKey: 'title'
    })];
  };

  renderers.videography = function () {
    return [listEditor({
      path: 'collections.videography', title: 'Videography',
      hint: 'Direct uploads or hosted links.',
      schema: SCHEMAS.videography, addLabel: 'Add film',
      makeNew: function () { return makeNew('videography'); }, nameKey: 'title'
    })];
  };

  renderers.showcase = function () {
    return [listEditor({
      path: 'collections.showcase', title: 'Website showcase',
      hint: 'Portfolio websites you design, build and maintain.',
      schema: SCHEMAS.showcase, addLabel: 'Add site',
      makeNew: function () { return makeNew('showcase'); }, nameKey: 'title'
    })];
  };

  renderers.journal = function () {
    return [listEditor({
      path: 'collections.journal', title: 'Journal',
      hint: 'Markdown posts shown in the Journal section.',
      schema: SCHEMAS.journal, addLabel: 'Add post',
      makeNew: function () { return makeNew('journal'); }, nameKey: 'title'
    })];
  };

  renderers.pages = function () {
    return [listEditor({
      path: 'pages', title: 'Pages',
      hint: 'Standalone pages; tick "Show in navigation" to surface them.',
      schema: SCHEMAS.pages, addLabel: 'Add page',
      makeNew: function () { return makeNew('pages'); }, nameKey: 'title'
    })];
  };

  renderers.contact = function () {
    var c = card('Contact section');
    c.appendChild(fields([
      { path: 'contact.title', label: 'Title' },
      { path: 'contact.locationLine', label: 'Location line' },
      { path: 'contact.showForm', label: 'Show form', type: 'check' },
      { path: 'contact.formNote', label: 'Form note' }
    ]));
    c.appendChild(fields([
      { path: 'contact.body', label: 'Body', type: 'textarea', rows: 3 }
    ], true));
    return [c];
  };

  renderers.servers = function () {
    var head = card('My Servers', 'Neon radio player - artwork, glow and wave are editable below');
    head.appendChild(fields([
      { path: 'radio.title', label: 'Section title' },
      { path: 'radio.tagline', label: 'Tagline', type: 'textarea', rows: 2 },
      { path: 'radio.artwork', label: 'Default station logo / artwork', type: 'image',
        hint: 'Shown in the circular player window. Each station can override it.' },
      { path: 'settings.radio.blockedHint', label: 'Blocked hint' },
      { path: 'settings.radio.defaultStation', label: 'Default station id' }
    ], true));

    var now = card('Now playing', 'Editable station info shown on the live player');
    now.appendChild(fields([
      { path: 'radio.nowPlaying.station', label: 'Station name override' },
      { path: 'radio.nowPlaying.track', label: 'Current song / show title' },
      { path: 'radio.nowPlaying.artist', label: 'Subtitle / artist' }
    ]));

    var neon = card('Neon glow', 'Circular logo ring + ambient glow');
    neon.appendChild(fields([
      { path: 'radio.neon.enabled', label: 'Neon glow enabled', type: 'check' },
      { path: 'radio.neon.color', label: 'Glow colour 1', type: 'color' },
      { path: 'radio.neon.color2', label: 'Glow colour 2', type: 'color' },
      { path: 'radio.neon.speed', label: 'Animation speed 0-3', type: 'number', min: 0, max: 3 }
    ]));

    var viz = card('Wave visualizer', 'Fluid multi-colour neon wave below the logo');
    viz.appendChild(fields([
      { path: 'radio.visualizer.style', label: 'Style', type: 'select',
        options: ['neon', 'wave', 'bars', 'ribbon', 'orbit'] },
      { path: 'radio.visualizer.color', label: 'Wave colour 1', type: 'color' },
      { path: 'radio.visualizer.color2', label: 'Wave colour 2', type: 'color' },
      { path: 'radio.visualizer.color3', label: 'Wave colour 3', type: 'color' },
      { path: 'radio.visualizer.glow', label: 'Wave glow', type: 'check' },
      { path: 'radio.visualizer.glowColor', label: 'Wave glow colour', type: 'color' },
      { path: 'radio.visualizer.speed', label: 'Animation speed 0-3', type: 'number', min: 0, max: 3 },
      { path: 'radio.visualizer.bars', label: 'Resolution', type: 'number', min: 16, max: 256 },
      { path: 'radio.visualizer.smoothing', label: 'Smoothing 0-1', type: 'number', min: 0, max: 1 }
    ]));

    var stations = listEditor({
      path: 'radio.stations', title: 'Server nodes',
      hint: 'Each node powers the player: logo, stream URL, titles and accent colour.',
      schema: SCHEMAS.stations, addLabel: 'Add server',
      makeNew: function () { return makeNew('stations'); }, nameKey: 'name'
    });

    return [head, now, neon, viz, stations];
  };

  renderers.footer = function () {
    var c = card('Footer');
    c.appendChild(fields([
      { path: 'footer.text', label: 'Copyright line', hint: '{year} is replaced at runtime' },
      { path: 'footer.credit', label: 'Credit line' },
      { path: 'settings.footer.showSocial', label: 'Show social links', type: 'check' }
    ], true));
    return [c];
  };

  renderers.settings = function () {
    var pre = card('Pre-loader', 'Animated intro');
    pre.appendChild(fields([
      { path: 'settings.preloader.enabled', label: 'Enabled', type: 'check' },
      { path: 'settings.preloader.duration', label: 'Duration (ms)', type: 'number', min: 500, max: 30000 },
      { path: 'settings.preloader.showPercent', label: 'Show percent', type: 'check' },
      { path: 'settings.preloader.skipButton', label: 'Skip button', type: 'check' },
      { path: 'settings.preloader.tagline', label: 'Tagline' },
      { path: 'branding.loaderMark', label: 'Loader mark (revealed name)' }
    ]));

    var fx = card('Desktop effects');
    fx.appendChild(fields([
      { path: 'settings.sounds.enabled', label: 'UI sounds', type: 'check' },
      { path: 'settings.sounds.hover', label: 'Hover ticks', type: 'check' },
      { path: 'settings.sounds.click', label: 'Click sounds', type: 'check' },
      { path: 'settings.sounds.volume', label: 'Volume 0–1', type: 'number', min: 0, max: 1 },
      { path: 'settings.cursor.enabled', label: 'Custom cursor', type: 'check' },
      { path: 'settings.hero.parallax', label: 'Hero parallax', type: 'check' },
      { path: 'settings.hero.scrollHint', label: 'Scroll hint', type: 'check' }
    ]));

    var danger = card('Draft management');
    var note = DK.dom.el('div', { class: 'adm-note' });
    note.innerHTML = '<strong>' + (DK.hasDraft() ? 'A published draft is active.' : 'Running on the shipped seed.') +
      '</strong> Reset clears local edits and reloads the shipped content.';
    danger.appendChild(note);
    danger.appendChild(DK.dom.el('p', { class: 'adm-card__hint' },
      'Passcode for this panel: <strong>dk-admin</strong> (change PASSCODE in assets/js/admin.js).'));
    return [pre, fx, danger];
  };

  /* ---------------------------------------------------------------- shell */

  var PANEL_DEFS = [
    { id: 'overview', label: 'Overview' },
    { id: 'site', label: 'Site & identity', group: 'Content' },
    { id: 'nav', label: 'Navigation', group: 'Content', count: 'nav' },
    { id: 'hero', label: 'Hero', group: 'Content' },
    { id: 'about', label: 'About', group: 'Content' },
    { id: 'sections', label: 'Sections', group: 'Content' },
    { id: 'contact', label: 'Contact', group: 'Content' },
    { id: 'footer', label: 'Footer', group: 'Content' },
    { id: 'logos', label: 'Logos portfolio', group: 'Collections', count: 'logos' },
    { id: 'graphics', label: 'Graphic design', group: 'Collections', count: 'graphics' },
    { id: 'photography', label: 'Photography albums', group: 'Collections', count: 'albums' },
    { id: 'videography', label: 'Videography', group: 'Collections', count: 'videos' },
    { id: 'showcase', label: 'Website showcase', group: 'Collections', count: 'showcase' },
    { id: 'journal', label: 'Journal', group: 'Collections', count: 'posts' },
    { id: 'pages', label: 'Pages', group: 'Collections', count: 'pages' },
    { id: 'servers', label: 'My Servers', group: 'Infrastructure', count: 'server' },
    { id: 'settings', label: 'Settings', group: 'Infrastructure' }
  ];

  function panelDef(id) {
    for (var i = 0; i < PANEL_DEFS.length; i++) if (PANEL_DEFS[i].id === id) return PANEL_DEFS[i];
    return PANEL_DEFS[0];
  }

  function paintStatus() {
    var el = document.getElementById('adm-top-status');
    if (!el) return;
    var text = dirty ? 'Unpublished changes'
      : (DK.hasDraft() ? 'Draft published' : 'Shipped content');
    el.innerHTML = '<span class="dk-dot" aria-hidden="true"></span>' + esc(text);
  }

  function renderPanel() {
    var host = document.getElementById('adm-panel');
    if (!host) return;
    host.innerHTML = '';
    var fn = renderers[panel] || renderers.overview;
    (fn() || []).forEach(function (node) { host.appendChild(node); });

    var title = document.getElementById('adm-top-title');
    if (title) title.textContent = panelDef(panel).label;

    DK.dom.qsa('.adm-nav__btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.panel === panel);
      var countEl = b.querySelector('.adm-nav__count');
      var def = panelDef(b.dataset.panel);
      if (countEl && def.count) countEl.textContent = String(count(def.count));
    });

    paintStatus();
  }

  function go(id) {
    if (!renderers[id]) id = 'overview';
    panel = id;
    openItem = null;
    renderPanel();
    var main = document.querySelector('.adm-main');
    if (main) main.scrollTop = 0;
    global.scrollTo(0, 0);
    if (DK.sound) DK.sound.play('navigate');
  }

  /* --------------------------------------------------------------- actions */

  /** Reflect the Firestore bridge state in the toolbar pill. */
  function paintCloud() {
    var el = document.getElementById('adm-cloud');
    if (!el) return;
    var s = (DK.cloud && DK.cloud.status) || 'none';
    var on = s === 'online';
    var wait = s === 'connecting' || s === 'init';
    el.textContent = on ? 'Firestore live' : (wait ? 'Cloud connecting…'
      : (s === 'none' ? 'Local only' : 'Offline mode'));
    el.className = 'adm-cloud adm-cloud--' + (on ? 'on' : (wait ? 'wait' : 'off'));
  }

  function publish() {
    var saved = DK.saveContent(doc);
    if (!saved) {
      if (DK.sound) DK.sound.play('error');
      DK.toast('Could not publish (storage unavailable). Export instead.', 'error');
      return;
    }
    doc.__updatedAt = saved.__updatedAt;
    dirty = false;
    paintStatus();
    if (DK.sound) DK.sound.play('success');

    if (DK.cloud && typeof DK.cloud.save === 'function') {
      // Push the same timestamp so our own snapshot echo is never mistaken
      // for a change coming from another device.
      lastSyncedAt = saved.__updatedAt;
      DK.cloud.save(doc, saved.__updatedAt).then(function (r) {
        DK.toast(r
          ? 'Draft published to Firestore — live on every device.'
          : 'Draft published locally — Firestore unreachable (check rules or network).',
          r ? 'success' : 'info');
        paintCloud();
      });
    } else {
      DK.toast('Draft published — the public site loads it on the next visit.', 'success');
    }
  }

  function exportJson() {
    var clone = JSON.parse(JSON.stringify(doc));
    delete clone.__updatedAt;
    DK.download(new Blob([JSON.stringify(clone, null, 2)], { type: 'application/json' }), 'content.json');
    if (DK.sound) DK.sound.play('click');
    DK.toast('Exported content.json — drop it into data/ to deploy.', 'success');
  }

  function importJson() {
    var input = DK.dom.el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          doc = DK.normalise(JSON.parse(String(reader.result)));
          dirty = true;
          openItem = null;
          renderShell();
          if (DK.sound) DK.sound.play('success');
          DK.toast('Imported. Press Publish to apply it locally.', 'success');
        } catch (e) {
          if (DK.sound) DK.sound.play('error');
          DK.toast('Import failed: ' + e.message, 'error');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function reset() {
    if (!global.confirm('Discard local edits and restore the shipped content (also in Firestore)?')) return;
    DK.clearContent();
    DK.loadContent(undefined, true).then(function (d) {
      doc = d;
      dirty = false;
      openItem = null;
      renderShell();
      if (DK.sound) DK.sound.play('toggleOff');
      DK.toast('Reset to shipped content.', 'success');
      if (DK.cloud && typeof DK.cloud.save === 'function') {
        // Restore the shipped seed in Firestore too, timestamping the write
        // up front so our own snapshot echo is ignored.
        var at = Date.now();
        lastSyncedAt = at;
        DK.cloud.save(doc, at).then(function () { paintCloud(); });
      }
    });
  }

  /** Build the full authenticated workspace. */
  function renderShell() {
    root.innerHTML = '';
    var shell = DK.dom.el('div', { class: 'adm', id: 'adm-shell' });

    /* Sidebar -------------------------------------------------------- */
    var side = DK.dom.el('aside', { class: 'adm-side' });
    side.innerHTML = '<div class="adm-brand">DK <span>Studio admin</span><i aria-hidden="true"></i></div>';

    var nav = DK.dom.el('nav', { class: 'adm-nav', 'aria-label': 'Dashboard sections' });
    var lastGroup = null;
    PANEL_DEFS.forEach(function (p) {
      if (p.group && p.group !== lastGroup) {
        lastGroup = p.group;
        nav.appendChild(DK.dom.el('p', { class: 'adm-nav__group' }, esc(p.group)));
      }
      var btn = DK.dom.el('button', {
        type: 'button', class: 'adm-nav__btn', 'data-panel': p.id
      });
      btn.appendChild(DK.dom.el('span', null, esc(p.label)));
      if (p.count) btn.appendChild(DK.dom.el('span', { class: 'adm-nav__count' }, String(count(p.count))));
      btn.addEventListener('click', function () { go(p.id); });
      nav.appendChild(btn);
    });
    side.appendChild(nav);

    var foot = DK.dom.el('div', { class: 'adm-side__foot' });
    var view = DK.dom.el('a', { class: 'adm-btn adm-btn--sm', href: 'index.html' }, 'View site');
    var lockBtn = DK.dom.el('button', { type: 'button', class: 'adm-btn adm-btn--sm adm-btn--danger' }, 'Lock');
    lockBtn.addEventListener('click', lock);
    foot.appendChild(view);
    foot.appendChild(lockBtn);
    side.appendChild(foot);
    shell.appendChild(side);

    /* Main ----------------------------------------------------------- */
    var main = DK.dom.el('div', { class: 'adm-main' });

    var top = DK.dom.el('header', { class: 'adm-top' });
    top.innerHTML =
      '<h2 class="adm-top__title" id="adm-top-title"></h2>' +
      '<span class="adm-cloud" id="adm-cloud" title="Firestore sync status"></span>' +
      '<span class="adm-top__status" id="adm-top-status"></span>';
    var actions = DK.dom.el('div', { class: 'adm-top__actions' });

    var importBtn = DK.dom.el('button', { type: 'button', class: 'adm-btn' }, 'Import');
    var exportBtn = DK.dom.el('button', { type: 'button', class: 'adm-btn' }, 'Export JSON');
    var resetBtn = DK.dom.el('button', { type: 'button', class: 'adm-btn adm-btn--danger' }, 'Reset');
    var publishBtn = DK.dom.el('button', { type: 'button', class: 'adm-btn adm-btn--primary', id: 'adm-publish' }, 'Publish');
    importBtn.addEventListener('click', importJson);
    exportBtn.addEventListener('click', exportJson);
    resetBtn.addEventListener('click', reset);
    publishBtn.addEventListener('click', publish);
    [importBtn, exportBtn, resetBtn, publishBtn].forEach(function (b) { actions.appendChild(b); });
    top.appendChild(actions);
    main.appendChild(top);

    var host = DK.dom.el('div', { class: 'adm-panel', id: 'adm-panel' });
    main.appendChild(host);
    shell.appendChild(main);
    root.appendChild(shell);

    renderPanel();
    paintCloud();
  }

  /* ----------------------------------------------------------------- boot */

  var soundBound = false;

  function boot() {
    return DK.loadContent().then(function (d) {
      doc = d;

      if (doc.settings) {
        DK.sound.configure(doc.settings);
        if (!soundBound) { DK.sound.attach(document); soundBound = true; }
        if (doc.settings.cursor && doc.settings.cursor.enabled !== false && DK.cursor) {
          DK.cursor.init({});
        }
      }

      renderShell();

      DK.admin = {
        go: go, publish: publish, exportJson: exportJson, reset: reset,
        get doc() { return doc; },
        get panel() { return panel; },
        get dirty() { return dirty; },
        renderers: renderers
      };

      // Live Firestore sync: refresh the pill on status changes and adopt
      // remote publishes from other devices — but never while dirty.
      if (DK.cloud) {
        if (typeof DK.cloud.onStatus === 'function') {
          DK.cloud.onStatus(function () { paintCloud(); });
        }
        if (typeof DK.cloud.subscribe === 'function') {
          DK.cloud.subscribe(function (remote) {
            if (dirty || !remote || !remote.__updatedAt) return;
            if (remote.__updatedAt === lastSyncedAt || remote.__updatedAt === doc.__updatedAt) return;
            doc = remote;
            openItem = null;
            renderPanel();
            DK.toast('Content updated from Firestore.', 'info');
          });
        }
      }
      paintCloud();

      document.documentElement.classList.add('dk-loaded');
      return DK.admin;
    }).catch(function (err) {
      root.innerHTML = '<div class="dk-container dk-error" style="padding:3rem 1.5rem">' +
        '<h1>Dashboard unavailable</h1><p>' +
        esc(err && err.message ? err.message : 'Could not load the content document.') +
        '</p><p><a href="index.html">Back to the site</a></p></div>';
      throw err;
    });
  }

  if (isAuthed()) boot();
  else renderLogin();

})(typeof window !== 'undefined' ? window : this);
