/*!
 * ElectricityMorph v1.0 — scroll-driven lightning morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const el = ElectricityMorph.create({ color: '#8fd3ff' });
 *   el.scroll({ from: '#a h2', to: '#b h2' });                        // scroll-scrubbed
 *   el.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = el.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   el.play({ from: x, to: y, duration: 2400 });                       // timed, returns a Promise
 *
 * The source charges up: arcs crackle across it and it flickers and glows. A branching lightning bolt
 * strikes from the source to the target and the source is zapped away, its sparks racing along the bolt.
 * The target flickers on, still crackling, then settles. Bolts are seeded from progress, so scrubbing
 * is repeatable. Real content is hidden while the morph runs.
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
    color: '#8fd3ff',         // electric colour
    arcs: 10,                 // arcs crackling over an element at full charge
    branches: 3,              // side branches on the main bolt
    jag: 1,                   // how jagged the bolts are
    width: 2,                 // bolt core width, px
    sparks: 140,              // sparks that race along the bolt
    flicker: 1,               // how much the content flickers (0–1)
    flash: true,              // screen flash when the bolt strikes
    rate: 50,                 // bolt redraws over the whole morph (higher = more crackle while scrubbing)
    ease: 'inOut',            // content fade ease
    pad: 8,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Jagged polyline between two points by midpoint displacement.
  function bolt(x0, y0, x1, y1, R, jag, levels) {
    var pts = [[x0, y0], [x1, y1]], amp = Math.hypot(x1 - x0, y1 - y0) * 0.22 * jag;
    for (var l = 0; l < levels; l++) {
      var next = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, o = (R() - 0.5) * 2 * amp;
        next.push([(a[0] + b[0]) / 2 - dy / len * o, (a[1] + b[1]) / 2 + dx / len * o], b);
      }
      pts = next; amp *= 0.55;
    }
    return pts;
  }
  function points(sh, n, R) {
    var d = sh.data && sh.data.data, out = [], tries = 0;
    while (out.length < n && tries++ < n * 30) {
      var x = R() * sh.W, y = R() * sh.H;
      if (d) { var i = ((Math.floor(y * sh.h / sh.H) * sh.w) + Math.floor(x * sh.w / sh.W)) * 4; if (d[i + 3] < 40) continue; }
      out.push([x, y]);
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
    function stroke(m, pts, w, a) {
      if (a <= 0.01 || pts.length < 2) return;
      var c = m.rgb, hot = m.hot;
      [[w * 7, rgba(c, 0.16 * a)], [w * 2.8, rgba(c, 0.45 * a)], [w, rgba(hot, 0.95 * a)]].forEach(function (L) {
        ctx.lineWidth = L[0]; ctx.strokeStyle = L[1]; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      });
    }
    // Short arcs between nearby opaque points of an element. I: charge 0–1.
    function crackle(m, sh, I, R) {
      var n = Math.round(m.o.arcs * I * (0.6 + R() * 0.8)), pts = sh.pts; if (!pts.length) return;
      for (var i = 0; i < n; i++) {
        var a = pts[R() * pts.length | 0], b = null;
        for (var t = 0; t < 8; t++) { var c = pts[R() * pts.length | 0], d = Math.hypot(c[0] - a[0], c[1] - a[1]); if (d > 14 && d < 110) { b = c; break; } }
        if (!b) continue;
        stroke(m, bolt(sh.ox + a[0], sh.oy + a[1], sh.ox + b[0], sh.oy + b[1], R, m.o.jag * 0.9, 4), m.o.width * 0.6, 0.5 + 0.5 * I);
      }
    }
    function content(m, sh, a, glow, R) {
      if (a <= 0.01) return;
      var fl = clamp(m.o.flicker), off = fl * glow;
      if (R() < 0.25 * off) a *= 0.25;
      var dx = (R() - 0.5) * 4 * off, dy = (R() - 0.5) * 2 * off;
      ctx.globalAlpha = a * (1 - glow * 0.7); ctx.drawImage(sh.tex, sh.ox + dx, sh.oy + dy, sh.W, sh.H);
      if (glow > 0.01) { ctx.globalAlpha = a * glow * 0.7; ctx.drawImage(sh.lit, sh.ox + dx, sh.oy + dy, sh.W, sh.H); }
      ctx.globalAlpha = 1;
    }
    function setup(m) {
      var mo = m.o, R = rng(29), n = Math.max(0, Math.round(mo.sparks)), list = [];
      m.rgb = rgbOf(mo.color); m.hot = m.rgb.map(function (v) { return Math.round(lerp(v, 255, 0.75)); });
      [m.S, m.T].forEach(function (sh) { sh.lit = tinted(sh.tex, mo.color, 0.85); sh.pts = points(sh, 160, R); });
      for (var i = 0; i < n; i++) { var s = m.S.pts.length ? m.S.pts[R() * m.S.pts.length | 0] : [m.S.W / 2, m.S.H / 2]; list.push({ x: s[0], y: s[1], st: 0.32 + R() * 0.1, dur: 0.18 + R() * 0.12, j: R() * 2 - 1, k: R() }); }
      m.sparks = list; return true;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, f = Math.floor(p * (+mo.rate || 50)), R = rng(f * 31 + 7);
      var chargeS = EASE.in(win(p, 0, 0.3)) * (1 - win(p, 0.36, 0.46)), chargeT = EASE.out(win(p, 0.55, 0.65)) * (1 - EASE.inOut(win(p, 0.65, 0.98)));
      var strike = EASE.out(win(p, 0.3, 0.35)) * (1 - EASE.in(win(p, 0.62, 0.72)));
      content(m, S, 1 - m.ease(win(p, 0.3, 0.44)), win(p, 0, 0.3), R);
      content(m, T, m.ease(win(p, 0.55, 0.75)), 1 - win(p, 0.65, 0.95), R);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (chargeS > 0.02) crackle(m, S, chargeS, R);
      if (chargeT > 0.02) crackle(m, T, chargeT, R);
      if (strike > 0.01) {
        var x0 = S.ox + S.W / 2, y0 = S.oy + S.H / 2, x1 = T.ox + T.W / 2, y1 = T.oy + T.H / 2, main = bolt(x0, y0, x1, y1, R, mo.jag, 6), fl = 0.65 + 0.35 * R();
        stroke(m, main, mo.width, strike * fl);
        for (var b = 0; b < Math.round(mo.branches); b++) {
          var at = main[Math.floor((0.15 + R() * 0.7) * main.length)], ang = Math.atan2(y1 - y0, x1 - x0) + (R() - 0.5) * 1.8, len = Math.hypot(x1 - x0, y1 - y0) * (0.15 + R() * 0.25);
          stroke(m, bolt(at[0], at[1], at[0] + Math.cos(ang) * len, at[1] + Math.sin(ang) * len, R, mo.jag, 4), mo.width * 0.6, strike * fl * 0.7);
        }
        // Sparks race from their spot on the source along the bolt.
        var segs = [0], total = 0; for (var i = 1; i < main.length; i++) { total += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]); segs.push(total); }
        m.sparks.forEach(function (q) {
          var u = (p - q.st) / q.dur; if (u <= 0 || u >= 1) return;
          var e = EASE.in(u), want = e * total, j = 1; while (j < segs.length - 1 && segs[j] < want) j++;
          var t = (want - segs[j - 1]) / (segs[j] - segs[j - 1] || 1), bx = lerp(main[j - 1][0], main[j][0], t), by = lerp(main[j - 1][1], main[j][1], t);
          var k = clamp(u * 4), x = lerp(S.ox + q.x, bx, k) + q.j * 6, y = lerp(S.oy + q.y, by, k) + q.k * 6 - 3;
          ctx.fillStyle = rgba(q.k < 0.5 ? m.hot : m.rgb, 1 - u * 0.6); ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        });
      }
      ctx.restore();
      if (mo.flash) {
        var fa = Math.exp(-Math.pow((p - 0.33) / 0.018, 2)) * 0.22;
        if (fa > 0.005) { ctx.fillStyle = rgba(m.rgb, fa); ctx.fillRect(0, 0, VW, VH); }
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
        var dur = spec.duration || 2400, delay = spec.delay || 0;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ElectricityMorph = api;
})(typeof window !== 'undefined' ? window : this);
