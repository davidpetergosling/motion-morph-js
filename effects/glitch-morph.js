/*!
 * GlitchMorph v1.0 — scroll-driven digital-glitch transitions between DOM content. Canvas 2D, no dependencies.
 *
 *   const gm = GlitchMorph.create({ intensity: 1 });
 *   gm.scroll({ from: '#a h2', to: '#b h2' });                        // scroll-scrubbed
 *   gm.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = gm.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   gm.play({ from: x, to: y, duration: 1800 });                       // timed, returns a Promise
 *
 * The source corrupts: its RGB channels split apart, horizontal slices tear sideways and drop out,
 * scanlines and noise blocks crawl over it. A burst of digital noise bridges the two elements, then
 * the target resolves out of the same corruption. Glitch frames are seeded from progress, so
 * scrubbing back and forth is repeatable. Real content is hidden while the morph runs.
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
    intensity: 1,             // overall glitch strength
    split: 8,                 // max RGB channel separation, px
    slices: 16,               // horizontal slices per element
    tear: 60,                 // max sideways slice offset, px
    noise: true,              // noise blocks over the content
    scanlines: true,          // dark scanlines over the content
    burst: true,              // burst of noise between the elements mid-morph
    colors: ['#00f0ff', '#ff2bd6', '#f5f7ff'],   // noise block colours
    rate: 90,                 // glitch frames over the whole morph (higher = more flicker while scrubbing)
    ease: 'linear',           // glitch build-up ease
    pad: 6,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // Red, green and blue copies of a snapshot; drawn with 'lighter' they add back up to the original.
  function channels(tex) {
    return ['#f00', '#0f0', '#00f'].map(function (col) {
      var c = mkCanvas(tex.width, tex.height), g = c.getContext('2d');
      g.drawImage(tex, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(tex, 0, 0);
      return c;
    });
  }
  function noiseTile(seed) {
    var c = mkCanvas(96, 96), g = c.getContext('2d'), id = g.createImageData(96, 96), R = rng(seed);
    for (var i = 0; i < id.data.length; i += 4) { var v = R() * 255, k = R(); id.data[i] = k < 0.33 ? v : v * 0.3; id.data[i + 1] = k > 0.66 ? v : v * 0.4; id.data[i + 2] = v; id.data[i + 3] = R() < 0.55 ? 255 : 0; }
    g.putImageData(id, 0, 0); return c;
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
    // One glitched frame of an element. I: strength 0–1; vis: fraction of slices still showing.
    function glitch(m, sh, I, vis, seed) {
      var mo = m.o, R = rng(seed), n = Math.max(1, Math.round(mo.slices)), cuts = [0], ky = sh.h / sh.H, i;
      I = clamp(I) * mo.intensity;
      for (i = 0; i < n - 1; i++) cuts.push(R() * sh.H); cuts.push(sh.H); cuts.sort(function (a, b) { return a - b; });
      for (i = 0; i < n; i++) {
        var y0 = cuts[i], h = cuts[i + 1] - y0, show = R(), torn = R(), off = (R() * 2 - 1) * mo.tear * I, spl = mo.split * I * (0.4 + R());
        if (h < 0.5 || show > vis) continue;
        if (torn > 0.3 * I + 0.04) off *= 0.08;
        if (spl < 0.3) { ctx.drawImage(sh.tex, 0, y0 * ky, sh.w, h * ky, sh.ox + off, sh.oy + y0, sh.W, h); continue; }
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sh.ch[0], 0, y0 * ky, sh.w, h * ky, sh.ox + off - spl, sh.oy + y0, sh.W, h);
        ctx.drawImage(sh.ch[1], 0, y0 * ky, sh.w, h * ky, sh.ox + off, sh.oy + y0, sh.W, h);
        ctx.drawImage(sh.ch[2], 0, y0 * ky, sh.w, h * ky, sh.ox + off + spl, sh.oy + y0, sh.W, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (mo.scanlines && I > 0.02) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.3 * Math.min(1, I)) + ')';
        for (var y = 0; y < sh.H; y += 3) ctx.fillRect(sh.ox, sh.oy + y, sh.W, 1);
      }
      if (mo.noise && I > 0.05) blocks(m, sh.ox, sh.oy, sh.W, sh.H, Math.round(I * 9 * (0.5 + R())), R, I);
    }
    function blocks(m, x, y, w, h, k, R, a) {
      var cols = m.cols;
      for (var i = 0; i < k; i++) {
        var bw = 8 + R() * Math.min(w, 140) * Math.min(1, a), bh = 2 + R() * 12, bx = x + R() * (w - bw), by = y + R() * (h - bh);
        if (R() < 0.5) { ctx.globalAlpha = 0.85; ctx.drawImage(m.noise, R() * 60, R() * 60, 36, 36, bx, by, bw, bh); }
        else { ctx.globalAlpha = 0.6 + R() * 0.4; ctx.fillStyle = cols[R() * cols.length | 0]; ctx.fillRect(bx, by, bw, bh); }
      }
      ctx.globalAlpha = 1;
    }
    function setup(m) {
      m.S.ch = channels(m.S.tex); m.T.ch = channels(m.T.tex);
      m.noise = noiseTile(5); m.cols = (m.o.colors && m.o.colors.length ? m.o.colors : DEFAULTS.colors).slice();
      return true;
    }
    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, f = Math.floor(p * (+mo.rate || 90));
      if (p < 0.5) glitch(m, S, m.ease(win(p, 0, 0.45)), 1 - win(p, 0.32, 0.5), f * 7 + 1);
      if (p > 0.5) glitch(m, T, 1 - m.ease(win(p, 0.55, 1)), win(p, 0.5, 0.68), f * 7 + 3);
      if (mo.burst) {
        var b = Math.sin(PI * win(p, 0.4, 0.6)); if (b <= 0.01) return;
        var R = rng(f * 13 + 5), x0 = Math.min(S.ox, T.ox), y0 = Math.min(S.oy, T.oy), x1 = Math.max(S.ox + S.W, T.ox + T.W), y1 = Math.max(S.oy + S.H, T.oy + T.H);
        blocks(m, x0, y0, x1 - x0, y1 - y0, Math.round(40 * b * mo.intensity), R, b);
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < Math.round(10 * b); i++) {
          var yy = y0 + R() * (y1 - y0); ctx.fillStyle = m.cols[R() * m.cols.length | 0]; ctx.globalAlpha = 0.25 + R() * 0.5 * b;
          ctx.fillRect(x0 - 40, yy, x1 - x0 + 80, 1 + R() * 2);
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    }

    function Morph(spec) {
      this.spec = spec; this.p = 0;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.linear;
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
        var dur = spec.duration || 1800, delay = spec.delay || 0;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GlitchMorph = api;
})(typeof window !== 'undefined' ? window : this);
