/*!
 * TeleporterMorph v1.0 — scroll-driven teleporter transitions between DOM content. Canvas 2D, no dependencies.
 *
 *   const tp = TeleporterMorph.create({ color: '#9fd8ff' });
 *   tp.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   tp.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = tp.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   tp.play({ from: x, to: y, duration: 3000 });                       // timed, returns a Promise
 *
 * A column of light switches on over the source. The content shimmers in flickering bands, washes into
 * the beam colour and dissolves into a cloud of twinkling sparkles, which fade as the beam powers down.
 * The same thing plays in reverse at the target, which materialises out of the sparkles.
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
    color: '#9fd8ff',         // beam and sparkle colour
    sparkles: 420,            // sparkles per element
    sparkleSize: 2.5,         // sparkle size, px
    shimmer: 1,               // strength of the flickering bands (0–1.5)
    band: 3,                  // shimmer band height, px
    beam: true,               // column of light over the element
    pads: true,               // bright emitter lines above and below the element
    rise: 16,                 // px sparkles drift upward while they hang
    rate: 60,                 // flicker frames over the whole morph
    ease: 'inOut',            // content fade ease
    pad: 6,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };

  // A four-point glint: soft glow plus a thin cross.
  function glint(rgb) {
    var R = 24, c = mkCanvas(R * 2, R * 2), g = c.getContext('2d'), gr = g.createRadialGradient(R, R, 0, R, R, R * 0.6);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, rgba(rgb, 0.8)); gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = rgba(rgb, 0.9); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(R, 2); g.lineTo(R, R * 2 - 2); g.moveTo(2, R); g.lineTo(R * 2 - 2, R); g.stroke();
    return c;
  }
  // The light column: brightest down the middle, fading at the sides and toward the top and bottom.
  function beamImage(rgb) {
    var w = 64, h = 128, c = mkCanvas(w, h), g = c.getContext('2d'), id = g.createImageData(w, h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var u = x / (w - 1), v = y / (h - 1), hx = Math.pow(Math.sin(PI * u), 1.5), vy = clamp(Math.min(v, 1 - v) / 0.25), i = (y * w + x) * 4;
      id.data[i] = rgb[0]; id.data[i + 1] = rgb[1]; id.data[i + 2] = rgb[2]; id.data[i + 3] = 255 * 0.28 * hx * vy * vy * (3 - 2 * vy);
    }
    g.putImageData(id, 0, 0); return c;
  }
  // Points on the opaque parts of a snapshot (or anywhere in it when its pixels can't be read).
  function points(sh, n, R) {
    var d = sh.data && sh.data.data, out = [], tries = 0;
    while (out.length < n && tries++ < n * 30) {
      var x = R() * sh.W, y = R() * sh.H;
      if (d) { var i = ((Math.floor(y * sh.h / sh.H) * sh.w) + Math.floor(x * sh.w / sh.W)) * 4; if (d[i + 3] < 40) continue; }
      out.push([x, y, R(), R()]);
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
    // One element (de)materialising. u: 0 = solid, 1 = gone. f: flicker frame.
    function beamIn(m, sh, u, f) {
      var mo = m.o, c = m.rgb, hot = m.hot, x = sh.ox, y = sh.oy, W = sh.W, H = sh.H;
      var beamA = mo.beam ? EASE.out(win(u, 0, 0.18)) * (1 - EASE.in(win(u, 0.8, 1))) : 0, tk = win(u, 0.08, 0.42);
      var cA = 1 - m.ease(win(u, 0.25, 0.7)), sA = EASE.out(win(u, 0.1, 0.35)) * (1 - EASE.in(win(u, 0.7, 0.98))), sh2 = clamp(mo.shimmer / 1.5) * Math.sin(PI * win(u, 0.02, 0.75));
      if (beamA > 0.01) {
        var bx = x - W * 0.12, bw = W * 1.24, by = y - H * 0.5, bh = H * 2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = beamA; ctx.drawImage(m.beamImg, bx, by, bw, bh); ctx.globalAlpha = 1;
        if (mo.pads) {
          ctx.globalCompositeOperation = 'lighter';
          [y - 6, y + H + 6].forEach(function (yy) {
            [[8, 0.12], [3, 0.4], [1.2, 0.95]].forEach(function (L) { ctx.strokeStyle = rgba(L[1] > 0.5 ? hot : c, L[1] * beamA); ctx.lineWidth = L[0]; ctx.beginPath(); ctx.moveTo(bx + bw * 0.15, yy); ctx.lineTo(bx + bw * 0.85, yy); ctx.stroke(); });
          });
        }
        ctx.restore();
      }
      if (cA > 0.01) {
        var band = Math.max(1, +mo.band || 3), ky = sh.h / sh.H;
        for (var yy = 0; yy < H; yy += band) {
          var hh = Math.min(band, H - yy), row = yy / band | 0, a = cA * (1 - sh2 * 0.8 * hash(row, f, 3)), dx = (hash(row, f, 9) - 0.5) * 6 * sh2;
          ctx.globalAlpha = a * (1 - tk); ctx.drawImage(sh.tex, 0, yy * ky, sh.w, hh * ky, x + dx, y + yy, W, hh);
          if (tk > 0.01) { ctx.globalAlpha = a * tk; ctx.drawImage(sh.lit, 0, yy * ky, sh.w, hh * ky, x + dx, y + yy, W, hh); }
        }
        ctx.globalAlpha = 1;
      }
      if (sA > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var s = mo.sparkleSize, rise = mo.rise;
        sh.pts.forEach(function (q, i) {
          var tw = hash(i, f, 5), a = sA * (0.25 + 0.75 * tw * tw); if (a < 0.03) return;
          var r = s * (0.6 + 1.4 * hash(i, f, 7)) * 2;
          ctx.globalAlpha = a; ctx.drawImage(m.glint, x + q[0] - r, y + q[1] - rise * u * q[2] - r, r * 2, r * 2);
        });
        ctx.restore();
      }
    }
    function setup(m) {
      var mo = m.o, R = rng(17), n = Math.max(0, Math.round(mo.sparkles));
      m.rgb = rgbOf(mo.color); m.hot = m.rgb.map(function (v) { return Math.round(lerp(v, 255, 0.7)); }); m.glint = glint(m.rgb); m.beamImg = beamImage(m.rgb);
      [m.S, m.T].forEach(function (sh) { sh.lit = tinted(sh.tex, mo.color, 0.5); sh.pts = points(sh, n, R); });
      return true;
    }
    function draw(m, p) {
      var f = Math.floor(p * (+m.o.rate || 60));
      if (p < 0.5) beamIn(m, m.S, p / 0.5, f);
      else beamIn(m, m.T, 1 - (p - 0.5) / 0.5, f);
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
        var dur = spec.duration || 3000, delay = spec.delay || 0;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TeleporterMorph = api;
})(typeof window !== 'undefined' ? window : this);
