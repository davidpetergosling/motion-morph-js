/*!
 * ExitStageMorph v1.0 — scroll-driven "exit stage left, enter stage right" transitions. Canvas 2D, no dependencies.
 *
 *   const xs = ExitStageMorph.create({ exit: 'left', enter: 'right' });
 *   xs.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   xs.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = xs.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   xs.play({ from: x, to: y, duration: 2000 });                       // timed, returns a Promise
 *
 * The source winds up, leans into the move and zips off the chosen edge of the screen, stretching with
 * speed lines and after-images. The target zips in from its edge, overshoots, squashes on the stop and
 * wobbles into place. Directions are screen directions: exit 'left' leaves off the left edge, enter 'right'
 * comes in from the right edge. style: 'smooth' drops the cartoon touches for a plain slide.
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
    exit: 'left',             // edge the source leaves by: 'left' | 'right' | 'top' | 'bottom'
    enter: 'right',           // edge the target comes in from: 'left' | 'right' | 'top' | 'bottom'
    style: 'cartoon',         // 'cartoon' (wind-up, stretch, lean, wobble) | 'smooth' (plain slide)
    anticipation: 1,          // size of the wind-up before leaving
    stretch: 1,               // stretch along the move at speed, squash on the stop
    lean: 1,                  // lean into the move
    trails: 3,                // after-images at speed
    speedLines: true,         // streaks behind the element at speed
    lineColor: '#ffffff',     // speed line colour
    overlap: 0.1,             // how much the exit and entrance overlap (0 = one after the other, 0.5 = together)
    ease: 'in',               // exit ease
    enterEase: 'back',        // entrance ease; 'back' overshoots
    pad: 4,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };
  var DIRS = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

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
    // Distance to move sheet sh in direction d until it is fully off screen.
    function offDist(sh, d) {
      var m = 24;
      return d[0] < 0 ? sh.ox + sh.W + m : d[0] > 0 ? VW - sh.ox + m : d[1] < 0 ? sh.oy + sh.H + m : VH - sh.oy + m;
    }
    // Draw a sheet displaced by (dx, dy), stretched along d (sA) and across it (sP), leaning by `lean`.
    function place(sh, d, dx, dy, sA, sP, lean, alpha) {
      if (alpha <= 0.01) return;
      var cx = sh.ox + sh.W / 2 + dx, cy = sh.oy + sh.H / 2 + dy, sx = d[0] ? sA : sP, sy = d[0] ? sP : sA;
      ctx.save(); ctx.translate(cx, cy);
      // Lean: the leading top edge pushes ahead for horizontal moves, the leading side for vertical ones.
      if (d[0]) ctx.transform(1, 0, -lean * d[0], 1, 0, 0); else ctx.transform(1, -lean * d[1] * 0.5, 0, 1, 0, 0);
      ctx.scale(sx, sy); ctx.globalAlpha = alpha;
      ctx.drawImage(sh.tex, -sh.W / 2, -sh.H / 2, sh.W, sh.H);
      ctx.restore();
    }
    function lines(m, sh, d, dx, dy, speed) {
      if (!m.o.speedLines || speed < 0.05) return;
      var R = rng(m.seed), n = 7, L = 40 + 220 * speed;
      ctx.save(); ctx.strokeStyle = rgba(m.lineRgb, 0.85 * Math.min(1, speed * 1.5)); ctx.lineCap = 'round';
      for (var i = 0; i < n; i++) {
        var f = 0.1 + 0.8 * R(), len = L * (0.5 + R() * 0.5), w = 1 + R() * 2, x, y;
        ctx.lineWidth = w;
        if (d[0]) { y = sh.oy + dy + sh.H * f; x = d[0] < 0 ? sh.ox + dx + sh.W + 10 : sh.ox + dx - 10; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d[0] * len, y); ctx.stroke(); }
        else { x = sh.ox + dx + sh.W * f; y = d[1] < 0 ? sh.oy + dy + sh.H + 10 : sh.oy + dy - 10; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - d[1] * len); ctx.stroke(); }
      }
      ctx.restore();
    }
    // Source leaving. u: 0 → 1 over the exit window.
    function exitAt(m, u) {
      var mo = m.o, S = m.S, d = DIRS[mo.exit] || DIRS.left, D = offDist(S, d), toon = mo.style !== 'smooth', a = toon ? 0.3 : 0;
      var pos = function (t) {
        var back = toon ? Math.sin(PI * clamp(t / a)) * 18 * mo.anticipation * (t < a ? 1 : 0) : 0;
        return t < a ? -back : D * m.ease(clamp((t - a) / (1 - a)));
      };
      var s = pos(u), speed = clamp((pos(Math.min(1, u + 0.02)) - s) / D * 6);
      var wind = toon && u < a ? Math.sin(PI * u / a) : 0, st = toon ? mo.stretch : 0;
      var sA = 1 + st * (0.6 * speed - 0.12 * wind), sP = 1 - st * (0.25 * speed - 0.1 * wind), lean = toon ? mo.lean * (0.28 * speed - 0.12 * wind) : 0;
      if (toon) {
        for (var k = Math.round(mo.trails); k >= 1; k--) {
          var sk = pos(Math.max(0, u - k * 0.035)); if (s - sk < 4) continue;
          place(S, d, d[0] * sk, d[1] * sk, sA, sP, lean, 0.22 / k * Math.min(1, speed * 2));
        }
        lines(m, S, d, d[0] * s, d[1] * s, speed);
      }
      place(S, d, d[0] * s, d[1] * s, sA, sP, lean, 1);
    }
    // Target arriving. v: 0 → 1 over the entrance window.
    function enterAt(m, v) {
      var mo = m.o, T = m.T, from = DIRS[mo.enter] || DIRS.right, d = [-from[0], -from[1]], D = offDist(T, from), toon = mo.style !== 'smooth';
      var ee = EASE[mo.enterEase] || (typeof mo.enterEase === 'function' ? mo.enterEase : EASE.back), tv = toon ? 0.7 : 1;
      var pos = function (t) { return -D * (1 - ee(clamp(t / tv))); };   // along d; 0 = home
      var s = pos(v), speed = clamp(Math.abs(pos(Math.min(1, v + 0.02)) - s) / D * 6), st = toon ? mo.stretch : 0;
      var sA = 1 + st * 0.6 * speed, sP = 1 - st * 0.25 * speed, lean = toon ? -mo.lean * 0.2 * speed : 0;
      if (toon && v > tv * 0.85) {
        // Squash on the stop, then a damped wobble.
        var t = (v - tv * 0.85) / (1 - tv * 0.85), w = Math.exp(-5 * t) * Math.cos(t * 14) * (1 - t);
        sA *= 1 - 0.14 * st * w; sP *= 1 + 0.1 * st * w; lean += mo.lean * 0.08 * w;
      }
      if (toon) {
        for (var k = Math.round(mo.trails); k >= 1; k--) {
          var sk = pos(Math.max(0, v - k * 0.035)); if (Math.abs(s - sk) < 4) continue;
          place(T, d, d[0] * sk, d[1] * sk, sA, sP, lean, 0.22 / k * Math.min(1, speed * 2));
        }
        lines(m, T, d, d[0] * s, d[1] * s, speed);
      }
      place(T, d, d[0] * s, d[1] * s, sA, sP, lean, 1);
    }
    function setup(m) { m.lineRgb = rgbOf(m.o.lineColor); m.seed = 11; return true; }
    function draw(m, p) {
      var ov = Math.max(0, Math.min(0.5, +m.o.overlap || 0)), e1 = 0.5 + ov / 2, e0 = 0.5 - ov / 2;
      if (p < e1) exitAt(m, win(p, 0, e1));
      if (p > e0) enterAt(m, win(p, e0, 1));
    }

    function Morph(spec) {
      this.spec = spec; this.p = 0;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.in;
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
        var dur = spec.duration || 2000, delay = spec.delay || 0;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ExitStageMorph = api;
})(typeof window !== 'undefined' ? window : this);
