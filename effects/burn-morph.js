/*!
 * BurnMorph v1.0 — scroll-driven burn transitions between DOM content. Canvas 2D, no dependencies.
 *
 *   const bm = BurnMorph.create({ origin: 'bottom' });
 *   bm.scroll({ from: '#a h2', to: '#b h2' });                       // scroll-scrubbed
 *   bm.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = bm.morph({ from: x, to: y }); m.progress(0.5);          // manual control
 *   bm.play({ from: x, to: y, duration: 2800 });                      // timed, returns a Promise
 *
 * A ragged, glowing front eats through the source, charring the content ahead of it and throwing off
 * embers and smoke. The embers drift across and ignite the target, which appears behind its own front
 * and cools from ember-orange to its real colours. Real content is hidden while the morph runs.
 * Per-morph specs accept any option to override the instance defaults.
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
    sine: function (t) { return -(Math.cos(PI * t) - 1) / 2; }
  };
  var $ = function (x) { return typeof x === 'string' ? Array.prototype.slice.call(document.querySelectorAll(x)) : x == null ? [] : x.length != null && !x.nodeType ? Array.prototype.slice.call(x) : [x]; };

  var DEFAULTS = {
    origin: 'bottom',         // where the burn starts: 'bottom' | 'top' | 'left' | 'right' | 'edges' | 'center' | [fx, fy] element fractions
    roughness: 0.45,          // how ragged the burn front is (0 = a straight line, 1 = pure noise)
    noiseScale: 1,            // size of the ragged blotches
    edge: 0.06,               // width of the glowing front, as a fraction of the burn
    char: 0.08,               // width of the charred band ahead of the front
    colors: ['#fff6c2', '#ffc04a', '#ff6a1a', '#b3240b'],   // ember ramp, hottest → coolest
    glow: true,               // soft additive halo around the front
    embers: 260,              // ember count; ~60% fly to the target, the rest are sparks that rise and die
    emberSize: 2.2,           // ember size, px
    rise: 120,                // px embers float up before they travel
    smoke: true,              // faint smoke puffs off the front
    reveal: 'ignite',         // target entrance: 'ignite' (burns in behind a front, cooling) | 'fade' (embers land, target fades in)
    ease: 'inOut',            // ember flight ease
    pad: 8,                   // px of margin captured around each element, so glow and char are not cropped
    maxPixels: 160000,        // per-element pixel budget for the burn simulation
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };
  var SRC_END = 0.55, TGT_START = 0.45;   // the source burns over [0, SRC_END], the target ignites over [TGT_START, 1]

  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function isClear(c) {
    if (!c || c === 'transparent') return true;
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return false;
    var p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 && parseFloat(p[3]) === 0;
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); if (r && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); }
  function rgbOf(c) { var g = mkCanvas(1, 1).getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function rng(seed) { var s = (seed % 2147483646) + 1; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(x, y, s) { var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy, s), hash(ix + 1, iy, s), fx), lerp(hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s), fx), fy);
  }
  function fbm(x, y, s) { return (vnoise(x, y, s) * 4 + vnoise(x * 2.1, y * 2.1, s + 3) * 2 + vnoise(x * 4.3, y * 4.3, s + 7)) / 7; }

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
    var ts = Math.min(root.devicePixelRatio || 1, o.maxDpr), budget = o.maxPixels || 160000;
    if (W * H * ts * ts > budget) ts = Math.sqrt(budget / (W * H));
    var c = mkCanvas(W * ts, H * ts), g = c.getContext('2d', { willReadFrequently: true });
    g.scale(c.width / W, c.height / H);
    if (!isClear(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; rrect(g, pad, pad, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 0); g.fill(); }
    g.translate(pad - r.left, pad - r.top); paint(g, el);
    var data = null; try { data = g.getImageData(0, 0, c.width, c.height); } catch (e) {}
    return { el: el, tex: c, data: data, w: c.width, h: c.height, W: W, H: H, pad: pad, ox: r.left - pad, oy: r.top - pad };
  }
  function origin(sh) { var r = sh.el.getBoundingClientRect(); sh.ox = r.left - sh.pad; sh.oy = r.top - sh.pad; }

  // Burn order per pixel, 0 (burns first) → 1 (burns last): a gradient from the origin, roughened by noise.
  function field(sh, o, seed) {
    var w = sh.w, h = sh.h, f = new Float32Array(w * h), cell = 46 * (o.noiseScale || 1) * (w / sh.W), rough = clamp(o.roughness), org = o.origin;
    var pt = Array.isArray(org) ? [org[0] * w, org[1] * h] : org === 'center' ? [w / 2, h / 2] : null, dmax = 1, lo = 1e9, hi = -1e9, i = 0;
    if (pt) dmax = Math.max(Math.hypot(pt[0], pt[1]), Math.hypot(w - pt[0], pt[1]), Math.hypot(pt[0], h - pt[1]), Math.hypot(w - pt[0], h - pt[1])) || 1;
    var half = Math.min(w, h) / 2 || 1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++, i++) {
      var g = pt ? Math.hypot(x - pt[0], y - pt[1]) / dmax : org === 'top' ? y / h : org === 'left' ? x / w : org === 'right' ? 1 - x / w : org === 'edges' ? Math.min(x, w - x, y, h - y) / half : 1 - y / h;
      var v = g * (1 - rough) + clamp((fbm(x / cell, y / cell, seed) - 0.5) * 2.2 + 0.5) * rough;
      f[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    var k = 1 / (hi - lo || 1); for (i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
    return f;
  }
  function ramp(colors) {
    var c = (colors && colors.length ? colors : DEFAULTS.colors).map(rgbOf), L = new Uint8ClampedArray(256 * 3);
    if (c.length < 2) c.push(c[0]);
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * (c.length - 1), j = Math.min(c.length - 2, Math.floor(t)), f = t - j;
      for (var k = 0; k < 3; k++) L[i * 3 + k] = lerp(c[j][k], c[j + 1][k], f);
    }
    return L;
  }
  function sprite(rgb, core) {
    var R = 24, c = mkCanvas(R * 2, R * 2), g = c.getContext('2d'), gr = g.createRadialGradient(R, R, 0, R, R, R), s = rgb.join(',');
    gr.addColorStop(0, core ? 'rgba(255,255,255,1)' : 'rgba(' + s + ',1)'); gr.addColorStop(0.22, 'rgba(' + s + ',.9)');
    gr.addColorStop(0.5, 'rgba(' + s + ',.25)'); gr.addColorStop(1, 'rgba(' + s + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2); return c;
  }

  function create(opts) {
    var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in opts || {}) o[k] = opts[k];
    var reduced = o.respectReducedMotion && root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(root.devicePixelRatio || 1, o.maxDpr), VW = 0, VH = 0, shown = false, morphs = [], scrolled = [], ticking = false;
    var cv, ctx, smokeSprite;

    function ensureLayer() {
      if (cv) return;
      cv = mkCanvas(1, 1); cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;z-index:' + o.zIndex;
      document.body.appendChild(cv); ctx = cv.getContext('2d');
      smokeSprite = sprite([58, 52, 48], false);
      resize();
    }
    function resize() { VW = innerWidth; VH = innerHeight; if (cv) { cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr); } }

    // Per-element buffers: burn order, output image, glow image, and the opaque pixels embers can start from.
    function prep(sh, mo, seed) {
      sh.f = field(sh, mo, seed);
      sh.work = mkCanvas(sh.w, sh.h); sh.wg = sh.work.getContext('2d'); sh.out = sh.wg.createImageData(sh.w, sh.h);
      if (mo.glow) { sh.gc = mkCanvas(sh.w, sh.h); sh.gg = sh.gc.getContext('2d'); sh.gout = sh.gg.createImageData(sh.w, sh.h); }
      var d = sh.data.data, solid = [];
      for (var i = 0, j = 3; j < d.length; i++, j += 4) if (d[j] > 60) solid.push(i);
      sh.solid = solid;
    }
    function times(mo) { var e = mo.edge, c = mo.char; return { e: e, c: c, cool: c * 2.5 }; }
    function particles(m) {
      var S = m.S, T = m.T, mo = m.o, R = rng(7), n = Math.max(0, Math.round(mo.embers)), out = [], tm = times(mo);
      if (!S.solid.length || !T.solid.length) return out;
      var spanS = 1 + tm.e + tm.c, spanT = 1 + 2 * tm.e + tm.cool, nSmoke = mo.smoke ? Math.round(n * 0.12) + 6 : 0;
      for (var i = 0; i < n + nSmoke; i++) {
        var si = S.solid[R() * S.solid.length | 0], ti = T.solid[R() * T.solid.length | 0];
        var kind = i >= n ? 2 : R() < 0.4 ? 1 : 0, b = SRC_END * (S.f[si] + tm.c) / spanS, l;
        if (kind === 2) l = b + 0.2 + R() * 0.12;
        else if (kind === 1) l = b + 0.07 + R() * 0.1;
        else l = Math.max(TGT_START + (1 - TGT_START) * T.f[ti] / spanT, b + 0.14);
        out.push({
          kind: kind, b: b, l: Math.min(0.995, l), ph: R() * TAU, wx: R() * 2 - 1, sz: 0.6 + R() * 0.8,
          sx: (si % S.w + 0.5) / S.w * S.W, sy: ((si / S.w | 0) + 0.5) / S.h * S.H,
          tx: (ti % T.w + 0.5) / T.w * T.W, ty: ((ti / T.w | 0) + 0.5) / T.h * T.H
        });
      }
      return out;
    }

    // One burn pass over an element. mode 0 burns it away behind threshold t; mode 1 reveals it behind t.
    function pass(m, sh, t, mode) {
      var mo = m.o, d = sh.data.data, out = sh.out.data, gl = sh.gout ? sh.gout.data : null, f = sh.f, L = m.lut, tm = times(mo);
      var e = tm.e || 1e-3, ch = tm.c || 1e-3, cool = tm.cool || 1e-3, n = sh.w * sh.h;
      for (var i = 0, j = 0; i < n; i++, j += 4) {
        var a = d[j + 3], A = 0, gA = 0;
        if (a) {
          var v = f[i], r = d[j], g = d[j + 1], b = d[j + 2], k, li;
          A = a;
          if (mode === 0) {
            if (v < t - e) A = 0;
            else if (v < t) { k = (t - v) / e; li = (k * 255 | 0) * 3; r = L[li]; g = L[li + 1]; b = L[li + 2]; A = gA = a * (1 - k); }
            else if (v < t + ch) { k = 1 - (v - t) / ch; k *= k * 0.92; r = lerp(r, 30, k); g = lerp(g, 16, k); b = lerp(b, 8, k); }
          } else {
            if (v > t + e) A = 0;
            else if (v > t) { k = (v - t) / e; li = (k * 255 | 0) * 3; r = L[li]; g = L[li + 1]; b = L[li + 2]; A = gA = a * (1 - k); }
            else if (v > t - cool) { k = 1 - (t - v) / cool; li = ((1 - k) * 255 | 0) * 3; k = Math.pow(k, 1.5); r = lerp(r, L[li], k); g = lerp(g, L[li + 1], k); b = lerp(b, L[li + 2], k); }
          }
          out[j] = r; out[j + 1] = g; out[j + 2] = b;
          if (gl && gA) { gl[j] = r; gl[j + 1] = g; gl[j + 2] = b; }
        }
        out[j + 3] = A; if (gl) gl[j + 3] = gA;
      }
      sh.wg.putImageData(sh.out, 0, 0);
      ctx.drawImage(sh.work, sh.ox, sh.oy, sh.W, sh.H);
      if (gl && 'filter' in ctx) {
        sh.gg.putImageData(sh.gout, 0, 0);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(5px)';
        ctx.drawImage(sh.gc, sh.ox, sh.oy, sh.W, sh.H); ctx.filter = 'blur(14px)'; ctx.globalAlpha = 0.45; ctx.drawImage(sh.gc, sh.ox, sh.oy, sh.W, sh.H);
        ctx.restore();
      }
    }

    function drawParticles(m, p) {
      var S = m.S, T = m.T, mo = m.o, rise = mo.rise, sp = m.sprites, last = sp.length - 1, es = mo.emberSize;
      m.parts.forEach(function (q) {
        if (q.kind !== 2 || p <= q.b || p >= q.l) return;
        var u = (p - q.b) / (q.l - q.b), r = 10 + 55 * u, x = S.ox + q.sx + q.wx * 30 * u + Math.sin(u * 5 + q.ph) * 10, y = S.oy + q.sy - rise * 1.6 * u;
        ctx.globalAlpha = 0.3 * Math.sin(PI * u); ctx.drawImage(smokeSprite, x - r, y - r, r * 2, r * 2);
      });
      ctx.globalCompositeOperation = 'lighter';
      m.parts.forEach(function (q) {
        if (q.kind === 2 || p <= q.b || p >= q.l) return;
        var u = (p - q.b) / (q.l - q.b), x0 = S.ox + q.sx, y0 = S.oy + q.sy, x, y, heat, a, s;
        if (q.kind === 1) {
          x = x0 + q.wx * 40 * u + Math.sin(u * 8 + q.ph) * 6; y = y0 - rise * 1.2 * u + 30 * u * u;
          heat = 1 - u; a = (1 - u) * Math.min(1, u * 12); s = es * q.sz * (1 - u * 0.5);
        } else {
          var x1 = T.ox + q.tx, y1 = T.oy + q.ty, e = m.ease(u), v = 1 - e;
          var cx1 = x0 + q.wx * 60, cy1 = y0 - rise, cx2 = x1 - q.wx * 40, cy2 = y1 - rise * 0.7;
          x = v * v * v * x0 + 3 * v * v * e * cx1 + 3 * v * e * e * cx2 + e * e * e * x1;
          y = v * v * v * y0 + 3 * v * v * e * cy1 + 3 * v * e * e * cy2 + e * e * e * y1;
          var w = Math.sin(PI * u); x += Math.sin(u * TAU * 2 + q.ph) * 18 * w; y += Math.cos(u * TAU * 1.5 + q.ph) * 10 * w;
          heat = 1 - w * 0.65; a = Math.min(1, u * 14, (1 - u) * 20); s = es * q.sz * (0.75 + 0.25 * Math.sin(u * 40 + q.ph));
        }
        var img = sp[Math.round((1 - heat) * last)], r = s * 4;
        ctx.globalAlpha = clamp(a); ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      });
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    function draw(m, p) {
      var S = m.S, T = m.T, mo = m.o, tm = times(mo);
      if (m.fallback) {
        ctx.globalAlpha = clamp(1 - p * 2); ctx.drawImage(S.tex, S.ox, S.oy, S.W, S.H);
        ctx.globalAlpha = clamp(p * 2 - 1); ctx.drawImage(T.tex, T.ox, T.oy, T.W, T.H); return;
      }
      if (p < SRC_END) pass(m, S, lerp(-tm.c, 1 + tm.e, p / SRC_END), 0);
      if (p > TGT_START) {
        var u = (p - TGT_START) / (1 - TGT_START);
        if (mo.reveal === 'fade') { ctx.globalAlpha = EASE.inOut(clamp((u - 0.25) / 0.75)); ctx.drawImage(T.tex, T.ox, T.oy, T.W, T.H); ctx.globalAlpha = 1; }
        else pass(m, T, lerp(-tm.e, 1 + 2 * tm.e + tm.cool, u), 1);
      }
      drawParticles(m, p);
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
      this.S = S; this.T = T; this.fallback = !S.data || !T.data;
      if (!this.fallback) {
        prep(S, this.o, 11); prep(T, this.o, 29);
        this.lut = ramp(this.o.colors);
        var cols = (this.o.colors && this.o.colors.length ? this.o.colors : DEFAULTS.colors).map(rgbOf);
        this.sprites = cols.map(function (c, i) { return sprite(c, i === 0); });
        this.parts = particles(this);
      }
      this.built = true; return true;
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
      act.forEach(function (m) { ctx.save(); origin(m.S); origin(m.T); draw(m, m.p); ctx.restore(); });
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
        var dur = spec.duration || 2800, delay = spec.delay || 0;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BurnMorph = api;
})(typeof window !== 'undefined' ? window : this);
