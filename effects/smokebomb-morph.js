/*!
 * SmokeBombMorph v1.0 — scroll-driven smoke-bomb transitions between DOM content. Canvas 2D, no dependencies.
 *
 *   const sb = SmokeBombMorph.create({ color: '#cfcbd9' });
 *   sb.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   sb.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = sb.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   sb.play({ from: x, to: y, duration: 2600 });                       // timed, returns a Promise
 *
 * Poof. A smoke bomb goes off on the source: a flash, a spray of sparks and a burst of billowing smoke
 * that hides it. A trail of puffs dashes across, a second bomb goes off on the target, and as the smoke
 * clears the target is standing there. Real content is hidden while the morph runs.
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
    color: '#cfcbd9',         // smoke colour (light side)
    shade: '#5d5870',         // smoke colour (shadow side)
    puffs: 60,                // smoke puffs per bomb
    size: 1,                  // cloud size relative to the element
    density: 0.85,            // smoke opacity
    drift: 40,                // px the smoke rises as it clears
    flash: true,              // flash when each bomb goes off
    flashColor: '#ffd9a0',    // flash colour
    sparks: 20,               // sparks sprayed by each bomb
    trail: true,              // trail of puffs dashing from source to target
    ease: 'out',              // smoke expansion ease
    pad: 4,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Lumpy smoke puff: a soft disc with fbm texture in its alpha.
  function puffSprite(rgb, seed) {
    var R = 48, c = mkCanvas(R * 2, R * 2), g = c.getContext('2d'), id = g.createImageData(R * 2, R * 2);
    for (var y = 0; y < R * 2; y++) for (var x = 0; x < R * 2; x++) {
      var dx = (x - R) / R, dy = (y - R) / R, d = Math.sqrt(dx * dx + dy * dy); if (d >= 1) continue;
      var n = fbm(x / 13, y / 13, seed), a = Math.pow(1 - d, 1.4) * (0.35 + 0.9 * n), i = (y * R * 2 + x) * 4;
      id.data[i] = rgb[0]; id.data[i + 1] = rgb[1]; id.data[i + 2] = rgb[2]; id.data[i + 3] = 255 * clamp(a);
    }
    g.putImageData(id, 0, 0); return c;
  }
  function puffs(n, R) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ a: R() * TAU, d: Math.sqrt(R()), r0: 0.1 + R() * 0.1, r1: 0.26 + R() * 0.26, rot: R() * TAU, spin: (R() - 0.5) * 1.5, v: R() * 4 | 0, dark: R() < 0.35, k: R(), del: R() * 0.06 });
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
    function sizeOf(m, sh) { return Math.max(sh.W, sh.H) * 0.45 * (+m.o.size || 1) + 20; }
    function puff(m, q, x, y, r, rot, a) {
      if (a <= 0.01 || r < 1) return;
      var img = (q.dark ? m.dark : m.light)[q.v], c = Math.cos(rot), s = Math.sin(rot);
      ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * x, dpr * y);
      ctx.globalAlpha = a; ctx.drawImage(img, -r, -r, r * 2, r * 2);
    }
    // One bomb at C. t: 0 = detonation → 1 = cleared.
    function bomb(m, list, C, Z, t) {
      if (t <= 0 || t >= 1) return;
      var mo = m.o, den = clamp(mo.density), dr = mo.drift;
      if (mo.flash && t < 0.1) {
        var fa = 1 - t / 0.1, g = ctx.createRadialGradient(C[0], C[1], 0, C[0], C[1], Z * 1.4);
        g.addColorStop(0, 'rgba(255,255,255,' + fa + ')'); g.addColorStop(0.25, rgba(m.flash, fa * 0.7)); g.addColorStop(1, rgba(m.flash, 0));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(C[0] - Z * 1.4, C[1] - Z * 1.4, Z * 2.8, Z * 2.8); ctx.restore();
      }
      if (t < 0.25 && m.sparkList.length) {
        var u = t / 0.25; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        m.sparkList.forEach(function (s) {
          var d0 = Z * (0.2 + 1.3 * EASE.out(u) * s.v), d1 = d0 - Z * 0.18 * (1 - u), cx = Math.cos(s.a), sy = Math.sin(s.a);
          ctx.strokeStyle = rgba(m.flash, (1 - u) * 0.9); ctx.lineWidth = 1.5 * (1 - u) + 0.5;
          ctx.beginPath(); ctx.moveTo(C[0] + cx * d1, C[1] + sy * d1 + 20 * u * u); ctx.lineTo(C[0] + cx * d0, C[1] + sy * d0 + 30 * u * u); ctx.stroke();
        });
        ctx.restore();
      }
      list.forEach(function (q) {
        var g = m.ease(clamp((t - q.del) / 0.35)), x = C[0] + Math.cos(q.a) * q.d * Z * g, y = C[1] + Math.sin(q.a) * q.d * Z * g * 0.8 - dr * t * (0.5 + q.k);
        var r = Z * lerp(q.r0, q.r1, g) * (1 + 0.35 * t), a = den * 0.6 * clamp((t - q.del) * 25) * (1 - EASE.inOut(win(t, 0.25 + q.k * 0.2, 0.8 + q.k * 0.2)));
        puff(m, q, x, y, r, q.rot + q.spin * t, a);
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    }
    function setup(m) {
      var mo = m.o, R = rng(37), n = Math.max(0, Math.round(mo.puffs)), light = rgbOf(mo.color), dark = rgbOf(mo.shade);
      m.light = [1, 2, 3, 4].map(function (s) { return puffSprite(light, s * 5); });
      m.dark = [1, 2, 3, 4].map(function (s) { return puffSprite(dark, s * 7 + 1); });
      m.flash = rgbOf(mo.flashColor);
      m.A = puffs(n, R); m.B = puffs(n, R); m.trailList = puffs(Math.round(n * 0.5), R);
      m.sparkList = []; for (var i = 0; i < Math.round(mo.sparks); i++) m.sparkList.push({ a: R() * TAU, v: 0.5 + R() * 0.5 });
      return true;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, CS = [S.ox + S.W / 2, S.oy + S.H / 2], CT = [T.ox + T.W / 2, T.oy + T.H / 2], ZS = sizeOf(m, S), ZT = sizeOf(m, T);
      var sa = 1 - win(p, 0.04, 0.12), ta = win(p, 0.5, 0.58);
      if (sa > 0.01) { ctx.globalAlpha = sa; ctx.drawImage(S.tex, S.ox, S.oy, S.W, S.H); }
      if (ta > 0.01) { ctx.globalAlpha = ta; ctx.drawImage(T.tex, T.ox, T.oy, T.W, T.H); }
      ctx.globalAlpha = 1;
      if (mo.trail) {
        m.trailList.forEach(function (q, i) {
          var f = (i + 0.5) / m.trailList.length, t0 = 0.18 + 0.26 * f, t = (p - t0) / 0.22; if (t <= 0 || t >= 1) return;
          var x = lerp(CS[0], CT[0], f) + Math.cos(q.a) * 14, y = lerp(CS[1], CT[1], f) + Math.sin(q.a) * 10 - Math.sin(PI * f) * 40 - mo.drift * 0.5 * t;
          puff(m, q, x, y, Math.min(ZS, ZT) * (0.15 + 0.2 * q.r1) * (0.6 + t), q.rot + t, clamp(mo.density) * 0.7 * Math.sin(PI * t));
        });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
      }
      bomb(m, m.A, CS, ZS, win(p, 0, 0.55));
      bomb(m, m.B, CT, ZT, win(p, 0.44, 1));
    }

    function Morph(spec) {
      this.spec = spec; this.p = 0;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.out;
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
        var dur = spec.duration || 2600, delay = spec.delay || 0;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SmokeBombMorph = api;
})(typeof window !== 'undefined' ? window : this);
