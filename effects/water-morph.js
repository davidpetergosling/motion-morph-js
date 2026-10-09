/*!
 * WaterMorph v1.0 — scroll-driven liquid morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const wm = WaterMorph.create({ color: 'source' });
 *   wm.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   wm.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = wm.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   wm.play({ from: x, to: y, duration: 3200 });                       // timed, returns a Promise
 *
 * The source melts and drips. Drops of liquid that take its colours break away, merge and split as they
 * flow across to the target, and pour in. The target rises behind a wavy waterline, tinted by the liquid,
 * then ripples and settles. Real content is hidden while the morph runs.
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
    color: 'source',          // liquid colour: 'source' (sampled from the content) | any CSS colour
    brighten: 0.2,            // lift sampled colours toward white so the liquid reads on dark grounds (0–1)
    blobs: 70,                // drops in flight
    blobSize: 10,             // base drop radius, px
    viscosity: 0.5,           // 0 = runny (short drips), 1 = thick (long, stretchy drips)
    path: 'arc',              // 'arc' (leaps across) | 'stream' (a tight, regular stream) | 'splash' (scattered arcs)
    arc: 0.35,                // arc height, fraction of the distance
    ripples: 6,               // ripple amplitude as the target settles, px
    gloss: 0.6,               // highlight on the liquid's upper edges (0–1)
    tint: 0.6,                // how strongly the rising target is tinted by the liquid (0–1)
    resolution: 0.5,          // liquid render scale; lower is faster and softer
    ease: 'sine',             // drop flight ease
    pad: 4,                   // px of margin captured around each element
    maxPixels: 400000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };
  var COL = 3;   // melt strip width, px

  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function isClear(c) {
    if (!c || c === 'transparent') return true;
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return false;
    var p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 && parseFloat(p[3]) === 0;
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); if (r && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); }
  function rgbOf(c) { var g = mkCanvas(1, 1).getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
  function rng(seed) { var s = (seed % 2147483646) + 1; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
  }
  function win(p, a, b) { return clamp((p - a) / (b - a)); }

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
    var ts = Math.min(root.devicePixelRatio || 1, o.maxDpr), budget = o.maxPixels || 400000;
    if (W * H * ts * ts > budget) ts = Math.sqrt(budget / (W * H));
    var c = mkCanvas(W * ts, H * ts), g = c.getContext('2d', { willReadFrequently: true });
    g.scale(c.width / W, c.height / H);
    if (!isClear(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; rrect(g, pad, pad, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 0); g.fill(); }
    g.translate(pad - r.left, pad - r.top); paint(g, el);
    var data = null; try { data = g.getImageData(0, 0, c.width, c.height); } catch (e) {}
    return { el: el, tex: c, data: data, w: c.width, h: c.height, W: W, H: H, pad: pad, ox: r.left - pad, oy: r.top - pad };
  }
  function origin(sh) { var r = sh.el.getBoundingClientRect(); sh.ox = r.left - sh.pad; sh.oy = r.top - sh.pad; }
  function tinted(tex, color, a) {
    var c = mkCanvas(tex.width, tex.height), g = c.getContext('2d');
    g.drawImage(tex, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  // Soft round drop; summed drops are thresholded into one liquid surface.
  function dropSprite(rgb) {
    var R = 32, c = mkCanvas(R * 2, R * 2), g = c.getContext('2d'), gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, rgba(rgb, 1)); gr.addColorStop(0.3, rgba(rgb, 0.85)); gr.addColorStop(0.6, rgba(rgb, 0.35)); gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2); return c;
  }
  // Opaque pixels of a snapshot as [sheetX, sheetY, r, g, b].
  function solids(sh) {
    var out = [], d = sh.data && sh.data.data; if (!d) return out;
    for (var y = 0; y < sh.h; y += 2) for (var x = 0; x < sh.w; x += 2) {
      var i = (y * sh.w + x) * 4; if (d[i + 3] > 80) out.push([(x + 0.5) / sh.w * sh.W, (y + 0.5) / sh.h * sh.H, d[i], d[i + 1], d[i + 2]]);
    }
    return out;
  }

  function create(opts) {
    var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in opts || {}) o[k] = opts[k];
    var reduced = o.respectReducedMotion && root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(root.devicePixelRatio || 1, o.maxDpr), VW = 0, VH = 0, shown = false, morphs = [], scrolled = [], ticking = false;
    var cv, ctx, lc, lg, res = Math.max(0.2, Math.min(1, +o.resolution || 0.5));

    function ensureLayer() {
      if (cv) return;
      cv = mkCanvas(1, 1); cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;z-index:' + o.zIndex;
      document.body.appendChild(cv); ctx = cv.getContext('2d');
      lc = mkCanvas(1, 1); lg = lc.getContext('2d', { willReadFrequently: true });
      resize();
    }
    function resize() {
      VW = innerWidth; VH = innerHeight;
      if (cv) { cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr); lc.width = Math.ceil(VW * res); lc.height = Math.ceil(VH * res); }
    }

    function meltAt(p) { return Math.pow(EASE.inOut(clamp(p / 0.4)), 1.2); }
    function dripAt(m, x, p) { var c = m.drip[Math.max(0, Math.min(m.drip.length - 1, Math.floor(x / COL)))]; return m.S.H * 0.9 * meltAt(p) * c * (0.6 + clamp(m.o.viscosity) * 0.8); }
    function fillAt(p) { return EASE.inOut(win(p, 0.52, 0.84)); }
    function surfY(m, x, p) {
      var f = fillAt(p), amp = 5 * Math.sin(PI * f);
      return m.T.oy + m.T.H * (1 - f) + Math.sin(x * 0.045 + p * 50) * amp + Math.sin(x * 0.11 - p * 37) * amp * 0.4;
    }

    // Source: vertical strips sliding down by their drip length, so the content smears into drips.
    function drawMelt(m, p) {
      var S = m.S, a = 1 - win(p, 0.24, 0.42); if (a <= 0) return;
      var kx = S.w / S.W, n = m.drip.length, tk = meltAt(p) * 0.7;
      for (var c = 0; c < n; c++) {
        var x = c * COL, w = Math.min(COL, S.W - x), d = dripAt(m, x + w / 2, p), y = S.oy + d * 0.6, h = S.H + d * 0.4;
        ctx.globalAlpha = a; ctx.drawImage(S.tex, x * kx, 0, w * kx, S.h, S.ox + x, y, w + 0.4, h);
        if (tk > 0.01) { ctx.globalAlpha = a * tk; ctx.drawImage(S.tint, x * kx, 0, w * kx, S.h, S.ox + x, y, w + 0.4, h); }
      }
      ctx.globalAlpha = 1;
    }
    // Target: revealed below the waterline, tinted by the liquid, then rippling as it settles.
    function drawPool(m, p) {
      var T = m.T, mo = m.o, f = fillAt(p); if (f <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.moveTo(T.ox - 2, T.oy + T.H + 2);
      for (var x = 0; x <= T.W + 6; x += 6) ctx.lineTo(T.ox + Math.min(x, T.W + 2), surfY(m, x, p));
      ctx.lineTo(T.ox + T.W + 2, T.oy + T.H + 2); ctx.closePath(); ctx.clip();
      var r = win(p, 0.78, 1), amp = (+mo.ripples || 0) * (r > 0 ? (1 - r) * (1 - r) : 0.5 * Math.sin(PI * f)), ta = clamp(mo.tint) * (1 - EASE.inOut(win(p, 0.74, 0.96)));
      var draws = ta > 0.01 ? [[T.tex, 1], [T.tint, ta]] : [[T.tex, 1]];
      draws.forEach(function (dw) {
        ctx.globalAlpha = dw[1];
        if (amp < 0.3) { ctx.drawImage(dw[0], T.ox, T.oy, T.W, T.H); return; }
        var ky = T.h / T.H;
        for (var y = 0; y < T.H; y += 3) {
          var h = Math.min(3, T.H - y), off = amp * Math.sin(y * 0.13 - p * 60) * Math.sin(PI * clamp(y / T.H + 0.15));
          ctx.drawImage(dw[0], 0, y * ky, T.w, h * ky, T.ox + off, T.oy + y, T.W, h + 0.4);
        }
      });
      ctx.restore();
    }

    // Drops + the waterline band, drawn soft into the low-res liquid canvas, then thresholded into one glossy surface.
    function drawLiquid(m, p) {
      var mo = m.o, S = m.S, T = m.T, bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, lc.width, lc.height);
      function ball(x, y, r, ci) {
        if (r < 0.5) return;
        var R = r * 2; lg.drawImage(m.sprites[ci], (x - R) * res, (y - R) * res, R * 2 * res, R * 2 * res);
        if (x - R < bx0) bx0 = x - R; if (y - R < by0) by0 = y - R; if (x + R > bx1) bx1 = x + R; if (y + R > by1) by1 = y + R;
      }
      var spread = mo.path === 'stream' ? 6 : mo.path === 'splash' ? 60 : 26;
      m.blobs.forEach(function (q) {
        if (p < q.b - 0.1 || p > q.a + 0.05) return;
        if (p < q.b) { ball(S.ox + q.x, S.oy + S.H + dripAt(m, q.x, p), q.r * 0.9 * clamp((p - q.b + 0.1) / 0.1), q.ci); return; }
        var tx = T.ox + q.tx;
        if (p > q.a) { var k = (p - q.a) / 0.05; ball(tx, surfY(m, q.tx, p) + k * 6, q.r * (1 - k), q.ci); return; }
        var x0 = S.ox + q.x, y0 = S.oy + S.H + dripAt(m, q.x, q.b), x3 = tx, y3 = surfY(m, q.tx, q.a);
        var dx = x3 - x0, dy = y3 - y0, dist = Math.hypot(dx, dy) || 1, nx = -dy / dist, ny = dx / dist;
        var h = mo.arc * Math.max(dist * 0.6, 140) * (mo.path === 'splash' ? q.h : mo.path === 'stream' ? 0.5 : 1);
        var x1 = x0 + dx * 0.25, y1 = Math.min(y0, y3) - h, x2 = x3 - dx * 0.25, y2 = Math.min(y0, y3) - h;
        for (var t = 0; t < 3; t++) {
          var u = (p - q.b) / (q.a - q.b) - t * 0.03; if (u < 0) break;
          var e = m.ease(u), v = 1 - e, w = Math.sin(PI * u);
          var x = v * v * v * x0 + 3 * v * v * e * x1 + 3 * v * e * e * x2 + e * e * e * x3, y = v * v * v * y0 + 3 * v * v * e * y1 + 3 * v * e * e * y2 + e * e * e * y3;
          x += nx * q.off * spread * w + Math.sin(u * TAU * 1.5 + q.ph) * 4 * w; y += ny * q.off * spread * w;
          ball(x, y, q.r * (0.8 + 0.25 * w) * [1, 0.72, 0.5][t], q.ci);
        }
      });
      var f = fillAt(p), band = 8 * (1 - EASE.in(win(p, 0.8, 0.95)));
      if (f > 0 && band > 0.3) {
        lg.setTransform(res, 0, 0, res, 0, 0); lg.fillStyle = rgba(m.avg, 1); lg.beginPath();
        for (var x = 0; x <= T.W; x += 6) lg.lineTo(T.ox + Math.min(x, T.W), surfY(m, x, p));
        for (x = T.W; x >= 0; x -= 6) lg.lineTo(T.ox + x, surfY(m, x, p) + band);
        lg.closePath(); lg.fill(); lg.setTransform(1, 0, 0, 1, 0, 0);
        var lv = T.oy + T.H * (1 - f);
        bx0 = Math.min(bx0, T.ox - 4); bx1 = Math.max(bx1, T.ox + T.W + 4); by0 = Math.min(by0, lv - 14); by1 = Math.max(by1, lv + band + 14);
      }
      var X0 = Math.max(0, Math.floor(bx0 * res)), Y0 = Math.max(0, Math.floor(by0 * res)), X1 = Math.min(lc.width, Math.ceil(bx1 * res)), Y1 = Math.min(lc.height, Math.ceil(by1 * res));
      var bw = X1 - X0, bh = Y1 - Y0; if (bw < 2 || bh < 2) return;
      var img = lg.getImageData(X0, Y0, bw, bh), d = img.data, row = bw * 4, gl = clamp(mo.gloss);
      for (var yy = 0; yy < bh; yy++) for (var xx = 0; xx < bw; xx++) {
        var i = yy * row + xx * 4, a = d[i + 3] / 255;
        var A = clamp((a - 0.36) / 0.18); if (A <= 0) { d[i + 3] = 0; continue; }
        var an = (xx + 2 < bw && yy + 2 < bh) ? d[i + row * 2 + 11] / 255 : a, hl = clamp((an - a) * 4) * gl, dk = clamp((a - an) * 3) * gl * 0.5;
        d[i] = d[i] + (255 - d[i]) * hl - d[i] * dk; d[i + 1] = d[i + 1] + (255 - d[i + 1]) * hl - d[i + 1] * dk; d[i + 2] = d[i + 2] + (255 - d[i + 2]) * hl - d[i + 2] * dk;
        d[i + 3] = A * A * (3 - 2 * A) * 240;
      }
      lg.putImageData(img, X0, Y0);
      ctx.drawImage(lc, X0, Y0, bw, bh, X0 / res, Y0 / res, bw / res, bh / res);
    }

    function draw(m, p) {
      if (m.fallback) {
        ctx.globalAlpha = clamp(1 - p * 2); ctx.drawImage(m.S.tex, m.S.ox, m.S.oy, m.S.W, m.S.H);
        ctx.globalAlpha = clamp(p * 2 - 1); ctx.drawImage(m.T.tex, m.T.ox, m.T.oy, m.T.W, m.T.H); return;
      }
      drawMelt(m, p);
      drawPool(m, p);
      drawLiquid(m, p);
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
      this.S = S; this.T = T;
      var mo = this.o, R = rng(17), sp = solids(S), tp = solids(T), br = clamp(mo.brighten), pal;
      this.fallback = !sp.length || !tp.length;
      if (this.fallback) { this.built = true; return true; }
      if (mo.color === 'source') {
        pal = [];
        for (var i = 0; i < 6; i++) { var px = sp[R() * sp.length | 0]; pal.push([px[2], px[3], px[4]].map(function (v) { return v + (255 - v) * br; })); }
      } else pal = [rgbOf(mo.color)];
      var avg = [0, 1, 2].map(function (k) { return pal.reduce(function (s, c) { return s + c[k]; }, 0) / pal.length; });
      this.avg = avg; this.sprites = pal.map(dropSprite);
      S.tint = tinted(S.tex, rgba(avg, 1), 0.9); T.tint = tinted(T.tex, rgba(avg, 1), 0.9);
      var drip = [], nc = Math.ceil(S.W / COL), dmax = 0;
      for (var c = 0; c < nc; c++) { var v = 0.3 + 0.7 * Math.pow(vnoise(c * COL / 34, 1.3), 1.5) + 0.25 * Math.pow(vnoise(c * COL / 12, 4.1), 2); drip.push(v); if (v > dmax) dmax = v; }
      this.drip = drip.map(function (v) { return v / dmax; });
      var n = Math.max(0, Math.round(mo.blobs)), blobs = [], stream = mo.path === 'stream';
      for (i = 0; i < n; i++) {
        var s = sp[R() * sp.length | 0], t = tp[R() * tp.length | 0], col = [s[2], s[3], s[4]].map(function (v) { return v + (255 - v) * br; }), ci = 0, best = 1e9;
        pal.forEach(function (pc, j) { var dd = Math.abs(pc[0] - col[0]) + Math.abs(pc[1] - col[1]) + Math.abs(pc[2] - col[2]); if (dd < best) { best = dd; ci = j; } });
        var dr = this.drip[Math.min(nc - 1, Math.floor(s[0] / COL))], b = stream ? 0.12 + 0.26 * i / Math.max(1, n - 1) : 0.12 + 0.26 * (0.6 * (1 - dr) + 0.4 * R());
        var a = stream ? b + 0.36 : Math.max(0.5 + 0.22 * R(), b + 0.2);
        blobs.push({ x: s[0], tx: t[0], b: b, a: Math.min(0.94, a), r: (+mo.blobSize || 10) * (0.6 + R() * 0.8), ci: ci, off: R() * 2 - 1, ph: R() * TAU, h: 0.3 + R() * 1.1 });
      }
      this.blobs = blobs; this.built = true; return true;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.WaterMorph = api;
})(typeof window !== 'undefined' ? window : this);
