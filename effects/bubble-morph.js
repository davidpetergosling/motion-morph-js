/*!
 * BubbleMorph v1.0 — scroll-driven bubble morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const bb = BubbleMorph.create({ bubble: 22 });
 *   bb.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   bb.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = bb.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   bb.play({ from: x, to: y, duration: 3200 });                       // timed, returns a Promise
 *
 * The source lifts off in soap bubbles, each carrying the piece of content behind it, magnified and
 * wobbling, with an iridescent rim. They float across, the picture inside shifting to the target, rise
 * into place and pop, leaving the target behind. Real content is hidden while the morph runs.
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
    bubble: 22,               // grid cell size, px; bubbles are a little larger so they overlap
    rise: 120,                // px bubbles float up as they leave, and rise into place by at the end
    wobble: 1,                // sideways wander and shape wobble
    magnify: 1.15,            // lens magnification of the content inside a bubble
    iridescence: 0.6,         // strength of the rainbow rim (0–1)
    colors: ['#00f0ff', '#ff2bd6', '#ffe14d'],   // iridescent rim colours
    stagger: 0.32,            // how spread out departures are (top rows leave first)
    pop: true,                // pop with a ring and droplets on arrival
    ease: 'sine',             // flight ease
    pad: 2,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Grid cells over a snapshot, skipping fully transparent ones.
  function cells(sh, size) {
    var out = [], d = sh.data && sh.data.data, kx = sh.w / sh.W, ky = sh.h / sh.H;
    size = Math.max(6, +size || 22);
    for (var y = 0; y < sh.H; y += size) for (var x = 0; x < sh.W; x += size) {
      var cw = Math.min(size, sh.W - x), ch = Math.min(size, sh.H - y); if (cw < 1 || ch < 1) continue;
      if (d) {
        var hit = false;
        for (var yy = Math.floor(y * ky); yy < Math.min(sh.h, (y + ch) * ky) && !hit; yy += 2) for (var xx = Math.floor(x * kx); xx < Math.min(sh.w, (x + cw) * kx); xx += 2) if (d[(yy * sh.w + xx) * 4 + 3] > 10) { hit = true; break; }
        if (!hit) continue;
      }
      out.push({ x: x, y: y, w: cw, h: ch, cx: x + cw / 2, cy: y + ch / 2, dep: 1, land: 1 });
    }
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
    function patch(sh, c) { var kx = sh.w / sh.W, ky = sh.h / sh.H; ctx.drawImage(sh.tex, c.x * kx, c.y * ky, c.w * kx, c.h * ky, sh.ox + c.x - 0.3, sh.oy + c.y - 0.3, c.w + 0.6, c.h + 0.6); }
    // Content of an element seen through a bubble at (x, y), centred on sheet point (cx, cy).
    function lens(sh, cx, cy, x, y, r, mag, a) {
      if (a <= 0.01) return;
      var kx = sh.w / sh.W, ky = sh.h / sh.H, sr = r / mag;
      ctx.globalAlpha = a; ctx.drawImage(sh.tex, (cx - sr) * kx, (cy - sr) * ky, sr * 2 * kx, sr * 2 * ky, x - r, y - r, r * 2, r * 2);
    }
    function bubble(m, q, S, T, x, y, r, k, wob, ph) {
      var mo = m.o, sq = 1 + 0.07 * wob * Math.sin(ph);
      ctx.save(); ctx.translate(x, y); ctx.scale(sq, 1 / sq); ctx.translate(-x, -y);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.save(); ctx.clip();
      lens(S, q.s.cx, q.s.cy, x, y, r, mo.magnify, 1 - k); lens(T, q.t.cx, q.t.cy, x, y, r, mo.magnify, k);
      ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.05)'); g.addColorStop(0.93, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0.45)');
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      if (mo.iridescence > 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = Math.max(1, r * 0.1);
        m.cols.forEach(function (c, i) { var a0 = ph * 0.5 + i * TAU / m.cols.length; ctx.strokeStyle = rgba(c, 0.45 * mo.iridescence); ctx.beginPath(); ctx.arc(x, y, r * 0.9, a0, a0 + 1.3); ctx.stroke(); });
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.11, -0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    function pop(m, x, y, r, k) {
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r * (1 + 0.6 * k), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (var i = 0; i < 6; i++) { var a = i / 6 * TAU + 0.4, d = r * (1 + 1.3 * k); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.4 * (1 - k), 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    function setup(m) {
      var mo = m.o, R = rng(23), S = m.S, T = m.T, sc = cells(S, mo.bubble), tc = cells(T, mo.bubble), n = Math.max(sc.length, tc.length), list = [], st = clamp(mo.stagger);
      if (!sc.length || !tc.length) return false;
      sc.forEach(function (c) { c.dep = 1; }); tc.forEach(function (c) { c.land = 1; });
      for (var i = 0; i < n; i++) {
        var s = sc[i % sc.length], t = tc[Math.floor(R() * tc.length)];
        if (i < tc.length) t = tc[i];
        var d = 0.03 + st * (0.7 * s.cy / S.H + 0.3 * R()), l = Math.min(0.95, d + 0.42 + 0.14 * R());
        s.dep = Math.min(s.dep, d); t.land = Math.min(t.land, l);
        list.push({ s: s, t: t, d: d, l: l, ph: R() * TAU, r: 0.58 + R() * 0.12 });
      }
      m.sc = sc; m.tc = tc; m.bubbles = list;
      m.cols = (mo.colors && mo.colors.length ? mo.colors : DEFAULTS.colors).map(rgbOf);
      return true;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, size = Math.max(6, +mo.bubble || 22), rise = mo.rise, wob = mo.wobble;
      m.sc.forEach(function (c) { if (p < c.dep) patch(S, c); });
      m.tc.forEach(function (c) { if (p >= c.land + 0.02) patch(T, c); });
      m.bubbles.forEach(function (q) {
        if (p < q.d || p > q.l + 0.05) return;
        var R = size * q.r, x3 = T.ox + q.t.cx, y3 = T.oy + q.t.cy;
        if (p > q.l) { if (mo.pop) pop(m, x3, y3, R, (p - q.l) / 0.05); return; }
        var u = (p - q.d) / (q.l - q.d), e = m.ease(u), v = 1 - e, grow = EASE.out(clamp(u / 0.08));
        var x0 = S.ox + q.s.cx, y0 = S.oy + q.s.cy, x1 = x0, y1 = y0 - rise, x2 = x3, y2 = y3 + rise * 0.6;
        var x = v * v * v * x0 + 3 * v * v * e * x1 + 3 * v * e * e * x2 + e * e * e * x3 + Math.sin(u * TAU * 1.5 + q.ph) * 14 * wob * Math.sin(PI * u);
        var y = v * v * v * y0 + 3 * v * v * e * y1 + 3 * v * e * e * y2 + e * e * e * y3;
        bubble(m, q, S, T, x, y, lerp(size * 0.5, R, grow), clamp((u - 0.35) / 0.4), wob, u * 20 + q.ph);
      });
      ctx.globalAlpha = 1;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BubbleMorph = api;
})(typeof window !== 'undefined' ? window : this);
