/*!
 * InkMorph v1.0 — scroll-driven ink-in-water morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const im = InkMorph.create({ swirl: 1 });
 *   im.scroll({ from: '#a h2', to: '#b h2' });                        // scroll-scrubbed
 *   im.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = im.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   im.play({ from: x, to: y, duration: 3400 });                       // timed, returns a Promise
 *
 * The source bleeds and dissolves like ink dropped in water: soft clouds in its colours bloom off it,
 * curl and drift across, shifting toward the target's colours, then gather and condense as the target
 * seeps back in from the edges. Real content is hidden while the morph runs.
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
    sine: function (t) { return -(Math.cos(PI * t) - 1) / 2; },
    back: function (t) { var c = 1.4, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  };
  var $ = function (x) { return typeof x === 'string' ? Array.prototype.slice.call(document.querySelectorAll(x)) : x == null ? [] : x.length != null && !x.nodeType ? Array.prototype.slice.call(x) : [x]; };

  var DEFAULTS = {
    puffs: 240,               // ink clouds in flight
    size: 46,                 // max cloud radius, px
    swirl: 1,                 // how much the clouds curl and wander
    drift: 50,                // px the clouds rise as they travel
    origin: 'edges',          // where the content dissolves first: 'edges' | 'center' | 'bottom' | 'top' | 'left' | 'right'
    roughness: 0.6,           // how blotchy the dissolve is (0 = smooth, 1 = pure noise)
    soft: 0.12,               // softness of the dissolve edge
    bleed: 0.8,               // blurred bleed around dissolving content (0–1)
    density: 0.16,            // opacity of each cloud
    brighten: 0.15,           // lift sampled colours toward white so ink reads on dark grounds (0–1)
    ease: 'sine',             // cloud flight ease
    pad: 10,                  // px of margin captured around each element
    maxPixels: 160000,        // per-element pixel budget for the dissolve
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Dissolve order per pixel, 0 (first) → 1 (last): a gradient from the origin, roughened by noise.
  function field(sh, o, seed) {
    var w = sh.w, h = sh.h, f = new Float32Array(w * h), cell = 40 * (w / sh.W), rough = clamp(o.roughness), org = o.origin, lo = 1e9, hi = -1e9, i = 0, half = Math.min(w, h) / 2 || 1, dmax = Math.hypot(w, h) / 2 || 1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++, i++) {
      var g = org === 'center' ? Math.hypot(x - w / 2, y - h / 2) / dmax : org === 'bottom' ? 1 - y / h : org === 'top' ? y / h : org === 'left' ? x / w : org === 'right' ? 1 - x / w : Math.min(x, w - x, y, h - y) / half;
      var v = g * (1 - rough) + clamp((fbm(x / cell, y / cell, seed) - 0.5) * 2.2 + 0.5) * rough;
      f[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    var k = 1 / (hi - lo || 1); for (i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
    return f;
  }
  function puffSprite(rgb) {
    var R = 32, c = mkCanvas(R * 2, R * 2), g = c.getContext('2d'), gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, rgba(rgb, 1)); gr.addColorStop(0.35, rgba(rgb, 0.7)); gr.addColorStop(0.7, rgba(rgb, 0.22)); gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2); return c;
  }
  // Opaque pixel indices, plus a small palette sampled from them.
  function solids(sh) { var d = sh.data.data, out = []; for (var i = 0, j = 3; j < d.length; i++, j += 4) if (d[j] > 60) out.push(i); return out; }
  function palette(sh, list, n, br, R) {
    var d = sh.data.data, out = [];
    for (var i = 0; i < n && list.length; i++) { var j = list[R() * list.length | 0] * 4; out.push([d[j], d[j + 1], d[j + 2]].map(function (v) { return v + (255 - v) * br; })); }
    return out.length ? out : [[255, 255, 255]];
  }
  function nearest(pal, c) { var bi = 0, bd = 1e9; pal.forEach(function (q, i) { var dd = Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]) + Math.abs(q[2] - c[2]); if (dd < bd) { bd = dd; bi = i; } }); return bi; }

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
    function prep(sh, mo, seed) {
      sh.f = field(sh, mo, seed); sh.solid = solids(sh);
      sh.work = mkCanvas(sh.w, sh.h); sh.wg = sh.work.getContext('2d'); sh.out = sh.wg.createImageData(sh.w, sh.h);
    }
    // Soft dissolve (mode 0: visible where f > t) or condense (mode 1: visible where f < t), with a blurred bleed.
    function pass(m, sh, t, mode, bleed) {
      var d = sh.data.data, out = sh.out.data, f = sh.f, s = Math.max(0.005, m.o.soft), n = sh.w * sh.h;
      for (var i = 0, j = 0; i < n; i++, j += 4) {
        var a = d[j + 3]; if (!a) { out[j + 3] = 0; continue; }
        var k = mode ? (t + s - f[i]) / (2 * s) : (f[i] - t + s) / (2 * s); k = k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
        out[j] = d[j]; out[j + 1] = d[j + 1]; out[j + 2] = d[j + 2]; out[j + 3] = a * k;
      }
      sh.wg.putImageData(sh.out, 0, 0);
      if (bleed > 0.01 && 'filter' in ctx) { ctx.save(); ctx.filter = 'blur(7px)'; ctx.globalAlpha = bleed; ctx.drawImage(sh.work, sh.ox, sh.oy, sh.W, sh.H); ctx.restore(); }
      ctx.drawImage(sh.work, sh.ox, sh.oy, sh.W, sh.H);
    }
    function setup(m) {
      var mo = m.o, S = m.S, T = m.T, R = rng(31), br = clamp(mo.brighten);
      if (!S.data || !T.data) return false;
      prep(S, mo, 11); prep(T, mo, 29);
      if (!S.solid.length || !T.solid.length) return false;
      var sp = palette(S, S.solid, 6, br, R), tp = palette(T, T.solid, 6, br, R), s = Math.max(0.005, mo.soft), n = Math.max(0, Math.round(mo.puffs)), list = [];
      m.sSpr = sp.map(puffSprite); m.tSpr = tp.map(puffSprite);
      for (var i = 0; i < n; i++) {
        var si = S.solid[R() * S.solid.length | 0], ti = T.solid[R() * T.solid.length | 0], sd = S.data.data, td = T.data.data;
        var b = 0.02 + 0.48 * (S.f[si] + s) / (1 + 2 * s), a = Math.min(0.99, Math.max(0.5 + 0.48 * (T.f[ti] + s) / (1 + 2 * s), b + 0.22));
        var ang = R() * TAU, ang2 = R() * TAU;
        list.push({
          sx: (si % S.w + 0.5) / S.w * S.W, sy: ((si / S.w | 0) + 0.5) / S.h * S.H, tx: (ti % T.w + 0.5) / T.w * T.W, ty: ((ti / T.w | 0) + 0.5) / T.h * T.H,
          b: b, a: a, sz: 0.5 + R() * 0.7, ph: R() * TAU, c1: [Math.cos(ang), Math.sin(ang)], c2: [Math.cos(ang2), Math.sin(ang2)],
          sc: nearest(sp, [sd[si * 4], sd[si * 4 + 1], sd[si * 4 + 2]]), tc: nearest(tp, [td[ti * 4], td[ti * 4 + 1], td[ti * 4 + 2]])
        });
      }
      m.puffs = list; return true;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, s = Math.max(0.005, mo.soft), bl = clamp(mo.bleed);
      if (p < 0.52) pass(m, S, lerp(-s, 1 + s, win(p, 0.02, 0.5)), 0, bl * Math.sin(PI * win(p, 0, 0.55)));
      if (p > 0.48) pass(m, T, lerp(-s, 1 + s, win(p, 0.5, 0.98)), 1, bl * Math.sin(PI * win(p, 0.45, 1)));
      var sw = 90 * mo.swirl, dr = mo.drift, size = mo.size, den = mo.density;
      var pos = function (q, u) {
        var e = m.ease(clamp(u)), v = 1 - e, x0 = S.ox + q.sx, y0 = S.oy + q.sy, x3 = T.ox + q.tx, y3 = T.oy + q.ty;
        var x1 = x0 + q.c1[0] * sw, y1 = y0 + q.c1[1] * sw - dr, x2 = x3 + q.c2[0] * sw, y2 = y3 + q.c2[1] * sw - dr * 0.5, w = Math.sin(PI * u);
        return [v * v * v * x0 + 3 * v * v * e * x1 + 3 * v * e * e * x2 + e * e * e * x3 + Math.sin(u * 5 + q.ph) * 30 * mo.swirl * w,
                v * v * v * y0 + 3 * v * v * e * y1 + 3 * v * e * e * y2 + e * e * e * y3 + Math.cos(u * 4 + q.ph) * 20 * mo.swirl * w];
      };
      m.puffs.forEach(function (q) {
        if (p <= q.b || p >= q.a) return;
        var u = (p - q.b) / (q.a - q.b), w = Math.sin(PI * u), P = pos(q, u), P2 = pos(q, u + 0.02);
        var r = size * q.sz * (0.12 + 0.88 * Math.pow(w, 0.6)), al = den * Math.pow(w, 0.4), ang = Math.atan2(P2[1] - P[1], P2[0] - P[0]);
        var c = Math.cos(ang), sn = Math.sin(ang), st = 1 + 0.6 * w;
        ctx.setTransform(dpr * c * st, dpr * sn * st, -dpr * sn, dpr * c, dpr * P[0], dpr * P[1]);
        ctx.globalAlpha = al * (1 - u); ctx.drawImage(m.sSpr[q.sc], -r, -r, r * 2, r * 2);
        ctx.globalAlpha = al * u; ctx.drawImage(m.tSpr[q.tc], -r, -r, r * 2, r * 2);
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    }

    function Morph(spec) {
      this.spec = spec; this.p = 0;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.sine;
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
    Morph.prototype.progress = function (p) { if (p === undefined) return this.p; this.p = clamp(p); this.fades(this.p); this.manual = true; schedule(); return this; };
    Morph.prototype.destroy = function () { if (this.st) { this.st.kill(); this.st = null; } this.o.hideContent = false; this.fades(0); morphs.splice(morphs.indexOf(this), 1); var i = scrolled.indexOf(this); if (i > -1) scrolled.splice(i, 1); schedule(); };

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
        var dur = spec.duration || 3400, delay = spec.delay || 0;
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
      // GSAP: let ScrollTrigger drive the morph. stOptions takes any ScrollTrigger option (scrub defaults to true);
      // start / end / trigger / edge default to the same values as scroll(). Returns the morph.
      scrollTrigger: function (spec, stOptions) {
        var st = stOptions || {}, ST = st.ScrollTrigger || root.ScrollTrigger;
        if (!ST) throw new Error('scrollTrigger() needs GSAP ScrollTrigger: load it and call gsap.registerPlugin(ScrollTrigger), or pass { ScrollTrigger: ScrollTrigger }');
        var m = this.morph(spec), cfg = {}, k, edge = spec.edge === 'bottom' ? 'bottom ' : 'top ';
        var pct = function (v, d) { return edge + +((v != null ? v : d) * 100).toFixed(2) + '%'; };
        for (k in st) if (k !== 'ScrollTrigger') cfg[k] = st[k];
        if (cfg.trigger == null) cfg.trigger = $(spec.trigger || spec.to)[0];
        if (cfg.start == null) cfg.start = pct(spec.start, 0.95);
        if (cfg.end == null) cfg.end = pct(spec.end, 0.35);
        if (cfg.scrub == null) cfg.scrub = true;
        var user = cfg.onUpdate;
        cfg.onUpdate = function (self) { m.progress(self.progress); if (user) user.call(this, self); };
        m.st = ST.create(cfg); m.progress(m.st.progress);
        return m;
      },
      destroy: function () {
        morphs.slice().forEach(function (m) { if (m.st) { m.st.kill(); m.st = null; } m.o.hideContent = false; m.fades(0); }); morphs = []; scrolled = [];
        removeEventListener('scroll', schedule); removeEventListener('resize', onResize); listening = false;
        if (cv) cv.remove(); cv = null;
      }
    };
  }

  var api = { create: create, version: '1.0.0' };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InkMorph = api;
})(typeof window !== 'undefined' ? window : this);
