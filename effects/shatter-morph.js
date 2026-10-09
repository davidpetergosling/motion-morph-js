/*!
 * ShatterMorph v1.0 — scroll-driven glass-shatter morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const sm = ShatterMorph.create({ shards: 90 });
 *   sm.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   sm.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = sm.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   sm.play({ from: x, to: y, duration: 2800 });                       // timed, returns a Promise
 *
 * Cracks spread from an impact point and the source breaks into glass shards. The shards blow outward,
 * tumbling and catching the light, gather in a cloud between the two elements, then fly in and lock
 * together as the target. Real content is hidden while the morph runs.
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
    shards: 90,               // roughly how many shards each element breaks into
    impact: 'center',         // where the glass breaks from: 'center' | [fx, fy] element fractions
    force: 1,                 // how hard the shards blow outward
    spread: 1,                // size of the shard cloud between the elements
    spin: 1,                  // how much shards tumble
    gravity: 0.4,             // how much shards sag mid-flight
    sheen: 0.6,               // light catching the shards as they turn (0–1)
    cracks: true,             // draw crack lines before the glass breaks
    edgeColor: 'rgba(255,255,255,.7)',   // shard edge highlight
    ease: 'inOut',            // flight ease
    pad: 2,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Jittered grid, each cell split into two triangles along a random diagonal. Transparent shards are dropped.
  function shatter(sh, count, seed) {
    var R = rng(seed), cells = Math.max(2, (+count || 90) / 2), cols = Math.max(1, Math.round(Math.sqrt(cells * sh.W / sh.H))), rows = Math.max(1, Math.round(cells / cols));
    var cw = sh.W / cols, ch = sh.H / rows, P = [], d = sh.data && sh.data.data, out = [];
    for (var j = 0; j <= rows; j++) {
      P.push([]);
      for (var i = 0; i <= cols; i++) {
        var jx = i > 0 && i < cols ? (R() - 0.5) * 0.7 * cw : 0, jy = j > 0 && j < rows ? (R() - 0.5) * 0.7 * ch : 0;
        P[j].push([i * cw + jx, j * ch + jy]);
      }
    }
    function solid(tri) {
      if (!d) return true;
      var x0 = Math.min(tri[0][0], tri[1][0], tri[2][0]), x1 = Math.max(tri[0][0], tri[1][0], tri[2][0]), y0 = Math.min(tri[0][1], tri[1][1], tri[2][1]), y1 = Math.max(tri[0][1], tri[1][1], tri[2][1]);
      var kx = sh.w / sh.W, ky = sh.h / sh.H, st = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) * kx / 6));
      for (var y = Math.floor(y0 * ky); y < Math.min(sh.h, y1 * ky); y += st) for (var x = Math.floor(x0 * kx); x < Math.min(sh.w, x1 * kx); x += st) if (d[(y * sh.w + x) * 4 + 3] > 10) return true;
      return false;
    }
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      var a = P[j][i], b = P[j][i + 1], c = P[j + 1][i + 1], e = P[j + 1][i], tris = R() < 0.5 ? [[a, b, c], [a, c, e]] : [[a, b, e], [b, c, e]];
      tris.forEach(function (t) {
        if (!solid(t)) return;
        var cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        out.push({ p: t.map(function (q) { return [q[0] - cx, q[1] - cy]; }), cx: cx, cy: cy, rs: (R() - 0.5) * 2, fs: 0.5 + R() * 1.5, ux: 0, uy: 0, k: R(), j: R() });
      });
    }
    // Unit-disk spot in the cloud for each shard.
    out.forEach(function (s) { var a = R() * TAU, r = Math.sqrt(R()); s.ux = Math.cos(a) * r; s.uy = Math.sin(a) * r; });
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
    function impactOf(m, sh) {
      var im = m.o.impact;
      return Array.isArray(im) ? [sh.W * im[0], sh.H * im[1]] : [sh.W / 2, sh.H / 2];
    }
    // One shard: clip to its triangle, draw the snapshot under it, add sheen and an edge highlight.
    function shard(sh, s, x, y, rot, flip, alpha, sheen, crack) {
      if (alpha <= 0.01) return;
      var mo = sh.mo;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip, 1);
      ctx.beginPath(); ctx.moveTo(s.p[0][0], s.p[0][1]); ctx.lineTo(s.p[1][0], s.p[1][1]); ctx.lineTo(s.p[2][0], s.p[2][1]); ctx.closePath();
      ctx.save(); ctx.clip(); ctx.globalAlpha = alpha;
      ctx.drawImage(sh.tex, -s.cx - 0.5, -s.cy - 0.5, sh.W + 1, sh.H + 1);
      if (sheen > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * sheen; ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.restore();
      if (crack > 0.01) { ctx.globalAlpha = alpha * crack; ctx.strokeStyle = mo.edgeColor; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }
    function setup(m) {
      m.S.mo = m.T.mo = m.o;
      m.S.shards = shatter(m.S, m.o.shards, 7); m.T.shards = shatter(m.T, m.o.shards, 13);
      return m.S.shards.length > 0 && m.T.shards.length > 0;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, sp = mo.spin, F = mo.force, G = mo.gravity * 120;
      var mx = (S.ox + S.W / 2 + T.ox + T.W / 2) / 2, my = (S.oy + S.H / 2 + T.oy + T.H / 2) / 2;
      var dist = Math.hypot(S.ox - T.ox, S.oy - T.oy), cloud = Math.max(120, dist * 0.3) * mo.spread;
      var cloudAt = function (s, t) { return [mx + s.ux * cloud + Math.sin(t * 3 + s.k * 9) * 12, my + s.uy * cloud * 0.6 + Math.cos(t * 2 + s.j * 9) * 10]; };
      var flipOf = function (s, a) { var f = Math.cos(a); return (f < 0 ? -1 : 1) * Math.max(0.12, Math.abs(f)); };
      var ss = S.shards, ts = T.shards, cr = mo.cracks ? EASE.out(win(p, 0, 0.07)) : 0;
      // Source: crack, then blow outward from the impact point into the cloud.
      if (p < 0.54) {
        var I = impactOf(m, S), rmax = Math.hypot(Math.max(I[0], S.W - I[0]), Math.max(I[1], S.H - I[1])) || 1, fade = 1 - win(p, 0.44, 0.54);
        ss.forEach(function (s) {
          var dx = s.cx - I[0], dy = s.cy - I[1], dl = Math.hypot(dx, dy) || 1, st = 0.06 + (dl / rmax) * 0.1, u = m.ease(win(p, st, st + 0.34));
          var x0 = S.ox + s.cx, y0 = S.oy + s.cy, E = cloudAt(s, p), qx = x0 + dx / dl * F * (80 + s.k * 140), qy = y0 + dy / dl * F * (80 + s.k * 140) - 40, v = 1 - u;
          var x = v * v * x0 + 2 * v * u * qx + u * u * E[0], y = v * v * y0 + 2 * v * u * qy + u * u * E[1] + G * Math.sin(PI * u);
          var a = s.fs * sp * PI * 2 * u, flip = flipOf(s, a), sheen = mo.sheen * Math.pow(Math.abs(Math.sin(a)), 3);
          shard(S, s, x, y, s.rs * sp * TAU * u, flip, fade, sheen, Math.max(cr * Math.min(1, 1.6 - dl / rmax), u > 0 ? 0.5 : 0));
        });
      }
      // Target: shards leave the cloud and lock into place, outermost first.
      if (p > 0.44) {
        var tw = T.W / 2, th = T.H / 2, tr = Math.hypot(tw, th) || 1, fin = win(p, 0.44, 0.54);
        ts.forEach(function (s, i) {
          var src = ss[i % ss.length], dl = Math.hypot(s.cx - tw, s.cy - th), st = 0.48 + (1 - dl / tr) * 0.1, u = m.ease(win(p, st, st + 0.38));
          var x1 = T.ox + s.cx, y1 = T.oy + s.cy, E = cloudAt(src, p), ox = (s.cx - tw) / (dl || 1), oy = (s.cy - th) / (dl || 1);
          var qx = x1 + ox * F * (90 + s.k * 120), qy = y1 + oy * F * (90 + s.k * 120) - 40, v = 1 - u;
          var x = v * v * E[0] + 2 * v * u * qx + u * u * x1, y = v * v * E[1] + 2 * v * u * qy + u * u * y1 + G * Math.sin(PI * u);
          var a = s.fs * sp * PI * 2 * (1 - u), flip = flipOf(s, a), sheen = mo.sheen * Math.pow(Math.abs(Math.sin(a)), 3);
          shard(T, s, x, y, s.rs * sp * TAU * (1 - u), flip, fin, sheen, u < 1 ? 0.5 * (1 - u * u) : 0);
        });
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ShatterMorph = api;
})(typeof window !== 'undefined' ? window : this);
