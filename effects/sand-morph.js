/*!
 * SandMorph v1.0 — scroll-driven sand morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const sd = SandMorph.create({ crumble: 'bottom' });
 *   sd.scroll({ from: '#a h2', to: '#b h2' });                        // scroll-scrubbed
 *   sd.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = sd.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   sd.play({ from: x, to: y, duration: 3200 });                       // timed, returns a Promise
 *
 * The source crumbles into grains of its own colours. They fall, stream across and pour onto the target,
 * which builds up from the bottom like a pile of sand, each grain landing where its pixel belongs.
 * Real content is hidden while the morph runs. Per-morph specs accept any option to override defaults.
 */
(function (root) {
  'use strict';
  var PI = Math.PI, TAU = PI * 2;
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var EASE = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in: function (t) { return t * t * t; },
    linear: function (t) { return t; },
    sine: function (t) { return -(Math.cos(PI * t) - 1) / 2; },
    back: function (t) { var c = 1.4, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  };
  var $ = function (x) { return typeof x === 'string' ? Array.prototype.slice.call(document.querySelectorAll(x)) : x == null ? [] : x.length != null && !x.nodeType ? Array.prototype.slice.call(x) : [x]; };

  var DEFAULTS = {
    grain: 2,                 // grain size, px
    step: 3,                  // sampling grid, px (one grain per step × step pixels)
    maxGrains: 6000,          // the grid is coarsened until each element has at most this many grains
    crumble: 'bottom',        // where the source crumbles first: 'bottom' | 'top' | 'left' | 'right' | 'random'
    roughness: 0.3,           // how ragged the crumbling edge is (0–1)
    gravity: 1,               // how far grains drop before they travel
    drop: 90,                 // px grains fall onto the target from above
    spread: 40,               // sideways scatter of the stream, px
    ease: 'inOut',            // grain flight ease
    pad: 2,                   // px of margin captured around each element
    maxPixels: 200000,        // per-element pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Order per pixel, 0 (first) → 1 (last), from an edge plus noise.
  function field(sh, org, rough, seed) {
    var w = sh.w, h = sh.h, f = new Float32Array(w * h), cell = 30 * (w / sh.W), lo = 1e9, hi = -1e9, i = 0;
    rough = clamp(rough);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++, i++) {
      var g = org === 'top' ? y / h : org === 'left' ? x / w : org === 'right' ? 1 - x / w : org === 'random' ? 0.5 : 1 - y / h;
      var v = g * (1 - rough) + clamp((fbm(x / cell, y / cell, seed) - 0.5) * 2.2 + 0.5) * rough;
      f[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    var k = 1 / (hi - lo || 1); for (i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
    return f;
  }
  // Grid samples of opaque pixels: [index, sheetX, sheetY], coarsened to stay under `max`.
  function samples(sh, step, max) {
    var d = sh.data.data, st = Math.max(1, Math.round(step * sh.w / sh.W)), out;
    do {
      out = [];
      for (var y = 0; y < sh.h; y += st) for (var x = 0; x < sh.w; x += st) { var i = y * sh.w + x; if (d[i * 4 + 3] > 80) out.push(i); }
      st++;
    } while (out.length > max);
    return out;
  }

  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function isClear(c) {
    if (!c || c === 'transparent') return true;
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return false;
    var p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 && parseFloat(p[3]) === 0;
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); if (r && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); }
  function rgbOf(c) { var g = mkCanvas(1, 1).getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
  function rng(seed) { var s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(x, y, s) { var n = Math.sin(x * 127.1 + y * 311.7 + (s || 0) * 74.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy, s), hash(ix + 1, iy, s), fx), lerp(hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s), fx), fy);
  }
  function fbm(x, y, s) { return (vnoise(x, y, s) * 4 + vnoise(x * 2.1, y * 2.1, s + 3) * 2 + vnoise(x * 4.3, y * 4.3, s + 7)) / 7; }
  function win(p, a, b) { return clamp((p - a) / (b - a)); }
  function tinted(tex, color, a) {
    var c = mkCanvas(tex.width, tex.height), g = c.getContext('2d');
    g.drawImage(tex, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ── Snapshot: backgrounds, borders, text (word by word at layout positions), images (object-fit aware).
  function paint(g, el) {
    var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
    all.forEach(function (e) {
      if (!e.getClientRects().length || e instanceof SVGElement) return;
      var cs = getComputedStyle(e); if (cs.visibility === 'hidden') return;
      var r = e.getBoundingClientRect(), rad = parseFloat(cs.borderTopLeftRadius) || 0, bw = parseFloat(cs.borderTopWidth) || 0;
      if (e !== el && !isClear(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; rrect(g, r.left, r.top, r.width, r.height, rad); g.fill(); }
      if (bw && cs.borderTopStyle !== 'none' && !isClear(cs.borderTopColor)) { g.lineWidth = bw; g.strokeStyle = cs.borderTopColor; rrect(g, r.left + bw / 2, r.top + bw / 2, r.width - bw, r.height - bw, rad); g.stroke(); }
    });
    var tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = tw.nextNode())) {
      var p = n.parentNode; if (!p || !p.getClientRects().length) continue;
      var cs = getComputedStyle(p); if (cs.visibility === 'hidden') continue;
      var fs = parseFloat(cs.fontSize) || 16, up = cs.textTransform === 'uppercase', s = n.nodeValue, i = 0;
      g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
      g.textBaseline = 'alphabetic'; g.fillStyle = cs.color;
      while (i < s.length) {
        while (i < s.length && s.charCodeAt(i) <= 32) i++;
        var j = i; while (j < s.length && s.charCodeAt(j) > 32) j++;
        if (j > i) {
          var rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, j);
          var r = rg.getBoundingClientRect();
          if (r.width) { var w = s.slice(i, j); g.fillText(up ? w.toUpperCase() : w, r.left, r.top + r.height / 2 + fs * 0.36); }
        }
        i = j;
      }
    }
    var imgs = el.tagName === 'IMG' ? [el] : $(el.querySelectorAll('img'));
    imgs.forEach(function (im) {
      if (!im.complete || !im.naturalWidth) return;
      var r = im.getBoundingClientRect(), cs = getComputedStyle(im), fit = cs.objectFit, nw = im.naturalWidth, nh = im.naturalHeight;
      var sx = 0, sy = 0, sw = nw, sh = nh, dx = r.left, dy = r.top, dw = r.width, dh = r.height;
      if (fit === 'cover') { var sc = Math.max(dw / nw, dh / nh); sw = dw / sc; sh = dh / sc; sx = (nw - sw) / 2; sy = (nh - sh) / 2; }
      else if (fit === 'contain' || fit === 'scale-down') { var sc2 = Math.min(dw / nw, dh / nh), w2 = nw * sc2, h2 = nh * sc2; dx += (dw - w2) / 2; dy += (dh - h2) / 2; dw = w2; dh = h2; }
      try { g.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh); } catch (e) {}
    });
  }
  // Transparent snapshot of an element plus `pad` px of margin. `data` is null when a cross-origin image taints it.
  function snapshot(el, o) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el), pad = +o.pad || 0, W = r.width + pad * 2, H = r.height + pad * 2;
    if (r.width < 2 || r.height < 2) return null;
    var ts = Math.min(root.devicePixelRatio || 1, o.maxDpr), budget = o.maxPixels || 600000;
    if (W * H * ts * ts > budget) ts = Math.sqrt(budget / (W * H));
    var c = mkCanvas(W * ts, H * ts), g = c.getContext('2d', { willReadFrequently: true });
    g.scale(c.width / W, c.height / H);
    if (!isClear(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; rrect(g, pad, pad, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 0); g.fill(); }
    g.translate(pad - r.left, pad - r.top); paint(g, el);
    var data = null; try { data = g.getImageData(0, 0, c.width, c.height); } catch (e) {}
    return { el: el, tex: c, data: data, w: c.width, h: c.height, W: W, H: H, pad: pad, ox: r.left - pad, oy: r.top - pad };
  }
  function origin(sh) { var r = sh.el.getBoundingClientRect(); sh.ox = r.left - sh.pad; sh.oy = r.top - sh.pad; }

  function create(opts) {
    var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in opts || {}) o[k] = opts[k];
    var reduced = o.respectReducedMotion && root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(root.devicePixelRatio || 1, o.maxDpr), VW = 0, VH = 0, shown = false, morphs = [], scrolled = [], ticking = false;
    var cv, ctx;

    function ensureLayer() {
      if (cv) return;
      cv = mkCanvas(1, 1); cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;z-index:' + o.zIndex;
      document.body.appendChild(cv); ctx = cv.getContext('2d');
      resize();
    }
    function resize() { VW = innerWidth; VH = innerHeight; if (cv) { cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr); } }
    function crossfade(m, p) {
      var S = m.S, T = m.T;
      ctx.globalAlpha = clamp(1 - p * 2); ctx.drawImage(S.tex, S.ox, S.oy, S.W, S.H);
      ctx.globalAlpha = clamp(p * 2 - 1); ctx.drawImage(T.tex, T.ox, T.oy, T.W, T.H); ctx.globalAlpha = 1;
    }
    var RELEASE = [0.02, 0.45], LAND = [0.45, 0.95];
    function prep(sh, org, rough, seed) {
      sh.f = field(sh, org, rough, seed);
      sh.work = mkCanvas(sh.w, sh.h); sh.wg = sh.work.getContext('2d'); sh.out = sh.wg.createImageData(sh.w, sh.h);
    }
    // Mask pass: mode 0 keeps source pixels not yet released; mode 1 shows target pixels already landed.
    function pass(sh, p, mode) {
      var d = sh.data.data, out = sh.out.data, f = sh.f, n = sh.w * sh.h, R = mode ? LAND : RELEASE, k = R[1] - R[0];
      for (var i = 0, j = 0; i < n; i++, j += 4) {
        var t = R[0] + k * f[i], on = mode ? p >= t : p < t;
        out[j] = d[j]; out[j + 1] = d[j + 1]; out[j + 2] = d[j + 2]; out[j + 3] = on ? d[j + 3] : 0;
      }
      sh.wg.putImageData(sh.out, 0, 0); ctx.drawImage(sh.work, sh.ox, sh.oy, sh.W, sh.H);
    }
    function setup(m) {
      var mo = m.o, S = m.S, T = m.T, R = rng(41);
      if (!S.data || !T.data) return false;
      prep(S, mo.crumble, mo.roughness, 11); prep(T, 'bottom', 0.2, 29);
      var ss = samples(S, mo.step, mo.maxGrains), ts = samples(T, mo.step, mo.maxGrains);
      if (!ss.length || !ts.length) return false;
      ss.sort(function (a, b) { return S.f[a] - S.f[b]; }); ts.sort(function (a, b) { return T.f[a] - T.f[b]; });
      var sd = S.data.data, td = T.data.data, N = ss.length, list = new Array(N);
      for (var i = 0; i < N; i++) {
        var si = ss[i], ti = ts[Math.floor(i * ts.length / N)];
        var r = RELEASE[0] + (RELEASE[1] - RELEASE[0]) * S.f[si], l = Math.min(0.99, Math.max(LAND[0] + (LAND[1] - LAND[0]) * T.f[ti], r + 0.15));
        list[i] = {
          sx: (si % S.w + 0.5) / S.w * S.W, sy: ((si / S.w | 0) + 0.5) / S.h * S.H, tx: (ti % T.w + 0.5) / T.w * T.W, ty: ((ti / T.w | 0) + 0.5) / T.h * T.H,
          r: r, l: l, j1: R() * 2 - 1, j2: R() * 2 - 1, ph: R() * TAU,
          c0: [sd[si * 4], sd[si * 4 + 1], sd[si * 4 + 2]], c1: [td[ti * 4], td[ti * 4 + 1], td[ti * 4 + 2]]
        };
      }
      m.grains = list; return true;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, g = Math.max(0.5, +mo.grain || 2), h = g / 2, fall = 60 * mo.gravity, drop = mo.drop, spr = mo.spread, buckets = {};
      if (p < RELEASE[1] + 0.01) pass(S, p, 0);
      if (p > LAND[0] - 0.01) pass(T, p, 1);
      m.grains.forEach(function (q) {
        if (p <= q.r || p >= q.l) return;
        var u = (p - q.r) / (q.l - q.r), e = m.ease(u), v = 1 - e;
        var x0 = S.ox + q.sx, y0 = S.oy + q.sy, x3 = T.ox + q.tx, y3 = T.oy + q.ty;
        var x1 = x0 + q.j1 * spr * 0.5, y1 = y0 + fall, x2 = x3 + q.j2 * spr * 0.3, y2 = y3 - drop;
        var x = v * v * v * x0 + 3 * v * v * e * x1 + 3 * v * e * e * x2 + e * e * e * x3 + Math.sin(u * 7 + q.ph) * spr * 0.25 * Math.sin(PI * u);
        var y = v * v * v * y0 + 3 * v * v * e * y1 + 3 * v * e * e * y2 + e * e * e * y3;
        var k = clamp((u - 0.3) / 0.6), key = ((lerp(q.c0[0], q.c1[0], k) >> 4) << 8) | ((lerp(q.c0[1], q.c1[1], k) >> 4) << 4) | (lerp(q.c0[2], q.c1[2], k) >> 4);
        (buckets[key] || (buckets[key] = [])).push(x - h, y - h);
      });
      for (var key in buckets) {
        var b = buckets[key], kk = +key;
        ctx.fillStyle = 'rgb(' + (((kk >> 8) & 15) * 17) + ',' + (((kk >> 4) & 15) * 17) + ',' + ((kk & 15) * 17) + ')';
        ctx.beginPath(); for (var i = 0; i < b.length; i += 2) ctx.rect(b[i], b[i + 1], g, g); ctx.fill();
      }
    }

    function Morph(spec) {
      this.spec = spec; this.p = 0;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.inOut;
    }
    Morph.prototype.build = function () {
      ensureLayer();
      var S = this.fromEls[0] && snapshot(this.fromEls[0], this.o), T = this.toEls[0] && snapshot(this.toEls[0], this.o);
      if (!S || !T) return false;
      this.S = S; this.T = T; this.fallback = !setup(this); this.built = true; return true;
    };
    Morph.prototype.invalidate = function () { this.built = false; };
    Morph.prototype.fades = function (p) {
      var a = '', b = '';
      if (this.o.hideContent) { a = p <= 0 ? '' : '0'; b = p >= 1 ? '' : '0'; if (reduced) { a = p < .5 ? '' : '0'; b = p < .5 ? '0' : ''; } }
      this.fromEls.forEach(function (e) { e.style.opacity = a; });
      this.toEls.forEach(function (e) { e.style.opacity = b; });
      if (this.spec.onProgress) this.spec.onProgress(p);
    };
    Morph.prototype.progress = function (p) { this.p = clamp(p); this.fades(this.p); this.manual = true; schedule(); return this; };
    Morph.prototype.destroy = function () { this.o.hideContent = false; this.fades(0); morphs.splice(morphs.indexOf(this), 1); var i = scrolled.indexOf(this); if (i > -1) scrolled.splice(i, 1); schedule(); };

    function frame() {
      ticking = false;
      scrolled.forEach(function (m) {
        if (m.manual) return;
        var tb = m.trigger.getBoundingClientRect(), t = m.edge === 'bottom' ? tb.bottom : tb.top, p = clamp((VH * m.start - t) / (VH * (m.start - m.end)));
        if (p !== m.p) m.fades(p); m.p = p;
      });
      if (reduced || !cv) return;
      if (VW !== innerWidth || VH !== innerHeight) resize();
      var act = morphs.filter(function (m) { return m.p > 0 && m.p < 1 && (m.built || m.build()); });
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      if (!act.length) { if (shown) { cv.style.display = 'none'; shown = false; } return; }
      if (!shown) { cv.style.display = 'block'; shown = true; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      act.forEach(function (m) { ctx.save(); origin(m.S); origin(m.T); if (m.fallback) crossfade(m, m.p); else draw(m, m.p); ctx.restore(); });
      ctx.globalAlpha = 1;
    }
    function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
    function onResize() { resize(); morphs.forEach(function (m) { m.invalidate(); }); schedule(); }
    var listening = false;
    function listen() { if (listening) return; listening = true; addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', onResize); }

    return {
      options: o,
      morph: function (spec) { ensureLayer(); var m = new Morph(spec); morphs.push(m); listen(); m.fades(0); return m; },
      scroll: function (spec) {
        ensureLayer(); var m = new Morph(spec); m.trigger = $(spec.trigger || spec.to)[0];
        m.edge = spec.edge === 'bottom' ? 'bottom' : 'top';
        m.start = spec.start != null ? spec.start : .95; m.end = spec.end != null ? spec.end : .35; m.p = -1;
        m.fades(0); morphs.push(m); scrolled.push(m); listen(); schedule(); return m;
      },
      play: function (spec) {
        ensureLayer(); var m = new Morph(spec); m.manual = true; morphs.push(m); listen(); m.fades(0);
        var dur = spec.duration || 3200, delay = spec.delay || 0;
        return new Promise(function (res) {
          if (reduced) { m.p = 1; m.fades(1); return res(m); }
          var t0 = null;
          function f(now) {
            if (t0 === null) t0 = now + delay; var p = clamp((now - t0) / dur);
            if (now >= t0) { m.p = p; m.fades(p); schedule(); }
            if (p < 1) requestAnimationFrame(f); else { morphs.splice(morphs.indexOf(m), 1); m.fades(1); schedule(); res(m); }
          }
          requestAnimationFrame(f);
        });
      },
      refresh: onResize,
      destroy: function () {
        morphs.slice().forEach(function (m) { m.o.hideContent = false; m.fades(0); }); morphs = []; scrolled = [];
        removeEventListener('scroll', schedule); removeEventListener('resize', onResize); listening = false;
        if (cv) cv.remove(); cv = null;
      }
    };
  }

  var api = { create: create, version: '1.0.0' };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SandMorph = api;
})(typeof window !== 'undefined' ? window : this);
