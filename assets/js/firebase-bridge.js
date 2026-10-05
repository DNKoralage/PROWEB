/* ==========================================================================
   DK — firebase-bridge.js
   Firebase Firestore live CMS bridge.
   The SDK is pulled from the gstatic CDN with dynamic import() so the site
   stays a pure static build (Hostinger + GitHub — no bundler, no build step,
   no CORS surprises). Nothing here ever blocks: init races a timeout, every
   call degrades to a no-op, and the site keeps working from the shipped seed
   plus the local localStorage draft whenever the network or the Firestore
   rules say no.

   Exposes  DK.cloud:
     status        'init' | 'connecting' | 'online' | 'offline'
     ready         Promise resolving to the Firestore instance or null
     fetch()       -> Promise<doc|null>       never rejects
     save(doc, at) -> Promise<false|number>   false on failure,
                                              else the __updatedAt written
     subscribe(cb) realtime snapshots of the CMS document
     onStatus(cb)  status-change listener
   ======================================================================== */
(function (global) {
  'use strict';

  var DK = global.DK || (global.DK = {});

  // Public web config (safe to ship; protect data with firestore.rules).
  var firebaseConfig = {
    apiKey: 'AIzaSyByTGl6_N31K0ny4eOLzcr6kfT-xjzZGIU',
    authDomain: 'proweb-8f017.firebaseapp.com',
    projectId: 'proweb-8f017',
    storageBucket: 'proweb-8f017.firebasestorage.app',
    messagingSenderId: '132268250161',
    appId: '1:132268250161:web:dd4792f2b7f23430533110',
    measurementId: 'G-D2GBW2EBPY'
  };

  var CDN = 'https://www.gstatic.com/firebasejs/12.19.0/';
  var COLLECTION = 'content';
  var DOC_ID = 'site';
  // Each collection is also mirrored into its own Firestore document so the
  // data is directly manageable per collection in the Firebase console.
  var MIRRORS = ['logos', 'graphics', 'photography', 'videography'];
  var CONNECT_TIMEOUT = 5000;
  var FETCH_BUDGET = 3000;   // page render never waits longer than this
  var SAVE_BUDGET = 8000;    // publish may take a little longer, never forever

  var fs = null;   // firebase-firestore module exports
  var db = null;
  var app = null;
  var status = 'init';
  var statusListeners = [];

  function setStatus(s) {
    if (status === s) return;
    status = s;
    for (var i = 0; i < statusListeners.length; i++) {
      try { statusListeners[i](s); } catch (e) { /* listener error is not ours */ }
    }
  }

  /** Resolve with fallback after ms; never rejects. */
  function race(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, ms);
      promise.then(function (v) {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }, function () {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      });
    });
  }

  /** JSON-safe copy — drops undefined/functions Firestore would reject. */
  function sanitize(value) {
    return JSON.parse(JSON.stringify(value, function (key, v) {
      if (v === undefined || typeof v === 'function') return null;
      return v;
    }));
  }

  var ready = new Promise(function (resolve) {
    if (!global.Promise || !global.fetch) { setStatus('offline'); resolve(null); return; }
    setStatus('connecting');
    Promise.all([
      import(CDN + 'firebase-app.js'),
      import(CDN + 'firebase-firestore.js')
    ]).then(function (mods) {
      var appMod = mods[0];
      fs = mods[1];
      app = appMod.initializeApp(firebaseConfig);
      db = fs.getFirestore(app);
      setStatus('online');
      // Analytics is optional and never runs from file:// or localhost.
      var loc = global.location;
      var proto = loc && loc.protocol;
      var host = loc && loc.hostname;
      if ((proto === 'http:' || proto === 'https:') &&
          host !== 'localhost' && host !== '127.0.0.1') {
        import(CDN + 'firebase-analytics.js').then(function (an) {
          try { an.getAnalytics(app); } catch (e) { /* unsupported — fine */ }
        }).catch(function () { /* offline — fine */ });
      }
      resolve(db);
    }).catch(function () {
      // CDN blocked, offline, or dynamic import unsupported: stay local.
      setStatus('offline');
      resolve(null);
    });
  });

  function siteRef() { return fs.doc(db, COLLECTION, DOC_ID); }

  DK.cloud = {
    get status() { return status; },
    ready: ready,
    config: firebaseConfig,
    onStatus: function (fn) {
      if (typeof fn === 'function') statusListeners.push(fn);
    },

    /** Live CMS document, or null when Firestore has none / is unreachable. */
    fetch: function () {
      var work = race(ready, CONNECT_TIMEOUT).then(function (ok) {
        if (!ok || !fs) return null;
        return fs.getDoc(siteRef()).then(function (snap) {
          if (!snap.exists()) return null;
          var data = snap.data();
          return DK.normalise ? DK.normalise(data) : data;
        }).catch(function () { return null; });
      });
      // Hard budget covering init AND the read: rendering must never stall.
      return race(work, FETCH_BUDGET);
    },

    /**
     * Write the CMS document (plus per-collection mirrors) in one batch.
     * Resolves false on failure, otherwise the __updatedAt number written —
     * callers use it to recognise their own snapshot echo.
     */
    save: function (doc, at) {
      var stamp = typeof at === 'number' ? at : Date.now();
      var payload = sanitize(doc);
      payload.__updatedAt = stamp;
      var work = race(ready, CONNECT_TIMEOUT).then(function (ok) {
        if (!ok || !fs) return false;
        var batch = fs.writeBatch(db);
        batch.set(siteRef(), payload);
        MIRRORS.forEach(function (key) {
          var items = payload.collections && payload.collections[key];
          if (Array.isArray(items)) {
            batch.set(fs.doc(db, COLLECTION, key), { items: items, __updatedAt: stamp });
          }
        });
        return batch.commit().then(function () { return stamp; })
          .catch(function () { return false; });
      });
      // Hard budget: a dead network resolves false instead of hanging forever.
      return race(work, SAVE_BUDGET);
    },

    /** Realtime snapshots of the CMS document; errors are swallowed. */
    subscribe: function (cb) {
      if (typeof cb !== 'function') return;
      race(ready, CONNECT_TIMEOUT).then(function (ok) {
        if (!ok || !fs) return;
        try {
          fs.onSnapshot(siteRef(), function (snap) {
            if (!snap.exists()) return;
            try { cb(DK.normalise ? DK.normalise(snap.data()) : snap.data()); }
            catch (e) { /* malformed remote doc — ignore */ }
          }, function () { /* permission denied — stay on local mode */ });
        } catch (e) { /* ignore */ }
      });
    }
  };

})(typeof window !== 'undefined' ? window : this);