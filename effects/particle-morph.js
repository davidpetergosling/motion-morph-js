/*!
 * ParticleMorph v1.1 — scroll-driven glowing particle morphs between DOM content.
 * No dependencies. Works in any modern browser.
 *
 *   const pm = ParticleMorph.create({ colorMode: 'blend', motion: 'swirl' });
 *   pm.scroll({ from: '#a h2', to: '#b h2' });                       // scroll-scrubbed
 *   pm.scroll({ from: '#a img', to: '#b img', motion: 'vortex' });    // runs alongside
 *   const m = pm.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   pm.play({ to: '#hero', duration: 3000, scatter: 'viewport' });     // timed intro build, returns a Promise
 *   pm.scroll({ from: '#s1', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *       // ↑ start only once the bottom of #s1 has risen past 2/3 of the viewport
 *   Target content is kept at opacity 0 until its morph starts (hideTarget), then fades in as the dots land.
 *
 * Per-morph specs accept any option below to override the instance defaults.
 */
(function (root) {
  'use strict';
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var EASE = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in: function (t) { return t * t * t; },
    linear: function (t) { return t; },
    expo: function (t) { return t === 0 ? 0 : t === 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2; }
  };
  var $ = function (x) { return typeof x === 'string' ? Array.prototype.slice.call(document.querySelectorAll(x)) : x == null ? [] : x.length != null && !x.nodeType ? Array.prototype.slice.call(x) : [x]; };

  var DEFAULTS = {
    count: null,              // dots per morph; null = 1700 desktop / 750 small screens
    colorMode: 'palette',     // 'palette' | 'source' (sampled from start pixel) | 'target' | 'blend' (source → target)
    colors: ['#9184d9', '#f2f0ff', '#c9c2f0'],   // used by 'palette'
    brighten: 0.15,           // lift sampled colours toward white so they glow on dark grounds (0–1)
    motion: 'swirl',          // 'swirl' | 'vortex' | 'galaxy' | 'explode' | 'wave' | 'drift' | 'direct' | function(q)
    direction: 'cw',          // 'cw' | 'ccw' | 'alternate' (alternates per morph)
    center: 'between',        // 'between' (midpoint of from/to) | 'viewport' | [fx, fy] viewport fractions
    swirl: 1.1,               // strength of the rotation (radians at mid-flight)
    wobble: 160,              // max per-dot orbit / scatter radius in px
    stagger: 0.22,            // 0–1, how spread out departures are
    ease: 'inOut',            // 'inOut' | 'out' | 'in' | 'linear' | 'expo' | function(t)
    step: 3,                  // sampling grid for text/outlines in px
    imageStep: 4,             // sampling grid for images in px
    size: 2.6,                // base dot size in px
    glow: true,               // additive blending + soft sprites
    nebula: true,             // rotating conic backlight (CSS, near-free)
    maxDpr: 1.5,
    zIndex: 45,
    outlines: '',             // selector: boxes to trace inside from/to (e.g. '.btn')
    fadeFrom: [0, 0.32],      // progress window where source content fades out
    fadeTo: [0.78, 0.92],     // progress window where target content fades in
    hideTarget: true,         // keep target content fully hidden until the dots set off (p > 0)
    scatter: 'viewport',      // intro / no-'from' source: 'viewport' | 'center' | 'edges' | 'ring'
    respectReducedMotion: true
  };

  // Motion functions mutate q.x / q.y. q: { x, y (eased lerp), x0, y0, x1, y1, e (eased 0–1), s (sin bell 0→1→0),
  //   cx, cy (centre), a (rand angle), r (rand radius), d (rand 0–1), i, dir (±1), o (options) }
  var MOTIONS = {
    direct: function () {},
    swirl: function (q) {
      rot(q, q.dir * q.s * (q.o.swirl + q.r / 220));
      var an = q.a + q.e * 7; q.x += Math.cos(an) * q.r * q.s * .5; q.y += Math.sin(an) * q.r * q.s * .35;
    },
    vortex: function (q) {
      var dx = q.x - q.cx, dy = q.y - q.cy, k = 1 - .78 * q.s;
      q.x = q.cx + dx * k; q.y = q.cy + dy * k;
      rot(q, q.dir * q.s * q.o.swirl * 3.2 * (1.2 - q.d * .4));
    },
    galaxy: function (q) {
      var dx = q.x - q.cx, dy = q.y - q.cy, dist = Math.sqrt(dx * dx + dy * dy), arm = (q.i & 1) ? Math.PI : 0;
      var k = 1 - .55 * q.s; q.x = q.cx + dx * k; q.y = q.cy + dy * k;
      rot(q, q.dir * q.s * (q.o.swirl * 2.6 * (1 - Math.min(1, dist / 600)) + arm * .15));
      q.y = q.cy + (q.y - q.cy) * (1 - .45 * q.s);
    },
    explode: function (q) {
      var dx = q.x0 - q.cx, dy = q.y0 - q.cy, len = Math.sqrt(dx * dx + dy * dy) || 1, f = q.s * (90 + q.r * 1.6);
      q.x += (dx / len * .6 + Math.cos(q.a) * .4) * f; q.y += (dy / len * .6 + Math.sin(q.a) * .4) * f;
    },
    wave: function (q) {
      q.y += Math.sin(q.x0 * .016 + q.e * 9 + q.d * 1.5) * q.s * (36 + q.r * .45) * q.dir;
      q.x += Math.cos(q.a + q.e * 4) * q.s * 14;
    },
    drift: function (q) {
      q.y -= q.s * (50 + q.r * 1.1); q.x += Math.sin(q.a + q.e * 6) * q.s * (16 + q.r * .2);
    }
  };
  function rot(q, th) { var dx = q.x - q.cx, dy = q.y - q.cy, c = Math.cos(th), s = Math.sin(th); q.x = q.cx + dx * c - dy * s; q.y = q.cy + dx * s + dy * c; }

  function parseRGB(c) { var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return [255, 255, 255]; var p = m[1].split(/[ ,/]+/).map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
  function hexRGB(h) { var c = document.createElement('canvas').getContext('2d'); c.fillStyle = h; c.fillRect(0, 0, 1, 1); var d = c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }

  function create(opts) {
    var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in opts || {}) o[k] = opts[k];
    var reduced = o.respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(root.devicePixelRatio || 1, o.maxDpr), W = 0, H = 0, shown = false, morphs = [], scrolled = [], ticking = false, nMorph = 0;
    var cv, ctx, neb, cache = {}, q = {};

    function ensureLayer() {
      if (cv) return;
      cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;z-index:' + o.zIndex;
      document.body.appendChild(cv); ctx = cv.getContext('2d');
      if (o.nebula) {
        neb = document.createElement('div'); neb.setAttribute('aria-hidden', 'true');
        var c = o.colors[0], mix = function (a) { return 'color-mix(in srgb,' + c + ' ' + a + '%,transparent)'; };
        neb.style.cssText = 'position:fixed;left:50%;top:50%;width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;pointer-events:none;opacity:0;mix-blend-mode:screen;will-change:transform,opacity;z-index:' + (o.zIndex - 1) +
          ';background:conic-gradient(from 0deg,transparent,' + mix(24) + ' 12%,transparent 32%,' + mix(16) + ' 55%,transparent 72%,' + mix(20) + ' 88%,transparent)' +
          ';-webkit-mask:radial-gradient(closest-side,#000 10%,transparent);mask:radial-gradient(closest-side,#000 10%,transparent)';
        document.body.appendChild(neb);
      }
      resize();
    }
    function resize() { W = innerWidth; H = innerHeight; if (cv) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } }

    // Colour sprites, quantised to a 6×6×6 cube (216 max) and built lazily — arbitrary colours at sprite cost.
    function qi(r, g, b) { return (Math.round(r / 51) * 36) + (Math.round(g / 51) * 6) + Math.round(b / 51); }
    function sprite(idx, glow, sampled) {
      var key = idx + (glow ? 'g' : 'f') + (sampled ? 's' : ''); if (cache[key]) return cache[key];
      var r = Math.floor(idx / 36) * 51, g = Math.floor(idx / 6) % 6 * 51, b = idx % 6 * 51, col = 'rgb(' + r + ',' + g + ',' + b + ')';
      var s = document.createElement('canvas'), R = 24; s.width = s.height = R * 2;
      var c = s.getContext('2d'), gr = c.createRadialGradient(R, R, 0, R, R, R);
      if (glow && sampled) { gr.addColorStop(0, col); gr.addColorStop(.3, col); gr.addColorStop(.55, 'rgba(' + r + ',' + g + ',' + b + ',.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
      else if (glow) { gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.12, col); gr.addColorStop(.35, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { gr.addColorStop(0, col); gr.addColorStop(.4, col); gr.addColorStop(.42, 'rgba(0,0,0,0)'); }
      c.fillStyle = gr; c.fillRect(0, 0, R * 2, R * 2); return (cache[key] = s);
    }

    // Rasterise text (word by word at exact layout positions, in its real colour), images (honouring object-fit) and outlines.
    function raster(g, el, ox, oy, oo) {
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
            if (r.width) { var w = s.slice(i, j); g.fillText(up ? w.toUpperCase() : w, r.left - ox, r.top - oy + r.height / 2 + fs * 0.36); }
          }
          i = j;
        }
      }
      var imgs = el.tagName === 'IMG' ? [el] : $(el.querySelectorAll('img'));
      imgs.forEach(function (im) {
        if (!im.complete || !im.naturalWidth) return;
        var r = im.getBoundingClientRect(), cs = getComputedStyle(im), fit = cs.objectFit, nw = im.naturalWidth, nh = im.naturalHeight;
        var sx = 0, sy = 0, sw = nw, sh = nh, dx = r.left - ox, dy = r.top - oy, dw = r.width, dh = r.height;
        var pos = (cs.objectPosition || '50% 50%').split(' ').map(function (v) { return v.indexOf('%') > -1 ? parseFloat(v) / 100 : v === 'left' || v === 'top' ? 0 : v === 'right' || v === 'bottom' ? 1 : .5; });
        if (fit === 'cover') { var sc = Math.max(dw / nw, dh / nh); sw = dw / sc; sh = dh / sc; sx = (nw - sw) * pos[0]; sy = (nh - sh) * (pos[1] != null ? pos[1] : .5); }
        else if (fit === 'contain' || fit === 'scale-down') { var sc2 = Math.min(dw / nw, dh / nh); var w2 = nw * sc2, h2 = nh * sc2; dx += (dw - w2) * pos[0]; dy += (dh - h2) * (pos[1] != null ? pos[1] : .5); dw = w2; dh = h2; }
        try { g.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh); } catch (e) {}
      });
      if (oo.outlines) {
        var list = $(el.querySelectorAll(oo.outlines)); if (el.matches && el.matches(oo.outlines)) list.push(el);
        g.lineWidth = 1.5;
        list.forEach(function (b) {
          var r = b.getBoundingClientRect(), bs = getComputedStyle(b), rad = Math.min(r.height / 2, parseFloat(bs.borderRadius) || 0);
          g.strokeStyle = bs.borderTopColor && bs.borderTopWidth !== '0px' ? bs.borderTopColor : bs.color;
          g.beginPath(); if (g.roundRect) g.roundRect(r.left - ox + .75, r.top - oy + .75, r.width - 1.5, r.height - 1.5, rad); else g.rect(r.left - ox, r.top - oy, r.width, r.height); g.stroke();
        });
      }
    }
    // Sample opaque pixels → [x, y, r, g, b] relative to the anchor element's top-left.
    function sample(els, oo, step, clip) {
      var out = [], anchor = els[0], box = null; if (!anchor) return { pts: out, anchor: null };
      els.forEach(function (e) { var r = e.getBoundingClientRect(); if (!r.width && !r.height) return; box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
      if (!box) return { pts: out, anchor: anchor };
      if (clip) { box.l = Math.max(box.l, 0); box.t = Math.max(box.t, 0); box.r = Math.min(box.r, W); box.b = Math.min(box.b, H); }
      var w = Math.ceil(box.r - box.l), h = Math.ceil(box.b - box.t); if (w < 2 || h < 2) return { pts: out, anchor: anchor };
      var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d', { willReadFrequently: true });
      els.forEach(function (e) { raster(g, e, box.l, box.t, oo); });
      var d; try { d = g.getImageData(0, 0, w, h).data; } catch (e) { return { pts: out, anchor: anchor, tainted: true }; }
      var hasImg = els.some(function (e) { return e.tagName === 'IMG' || e.querySelector('img'); }), st = hasImg ? Math.max(step, oo.imageStep) : step;
      var ar = anchor.getBoundingClientRect(), dx = box.l - ar.left, dy = box.t - ar.top, lift = oo.brighten;
      for (var y = 0; y < h; y += st) for (var x = (y / st & 1) ? st / 2 | 0 : 0; x < w; x += st) {
        var k = (y * w + x) * 4; if (d[k + 3] <= 110) continue;
        out.push(x + dx, y + dy, d[k] + (255 - d[k]) * lift, d[k + 1] + (255 - d[k + 1]) * lift, d[k + 2] + (255 - d[k + 2]) * lift);
      }
      return { pts: out, anchor: anchor };
    }

    function Morph(spec) {
      this.spec = spec; this.P = null; this.p = 0; this.idx = nMorph++;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      var dir = this.o.direction; this.dir = dir === 'ccw' ? -1 : dir === 'alternate' ? (this.idx & 1 ? -1 : 1) : 1;
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.inOut;
      this.move = typeof this.o.motion === 'function' ? this.o.motion : MOTIONS[this.o.motion] || MOTIONS.swirl;
    }
    Morph.prototype.build = function () {
      ensureLayer();
      var oo = this.o, n = oo.count || (innerWidth < 700 ? 750 : 1700), pal = oo.colors.map(hexRGB);
      var restore = this.toEls.map(function (e) { var v = e.style.opacity; e.style.opacity = '1'; return v; });
      var T = sample(this.toEls, oo, Math.max(2, oo.step - 1), false);
      this.toEls.forEach(function (e, i) { e.style.opacity = restore[i]; });
      var S = this.fromEls.length ? sample(this.fromEls, oo, oo.step, true) : scatterPts(oo.scatter, n);
      var ns = S.pts.length / 5, nt = T.pts.length / 5; if (!ns || !nt) return false;
      var noSrc = !S.anchor;
      var P = { n: n, sx: new Float32Array(n), sy: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), a: new Float32Array(n), r: new Float32Array(n), d: new Float32Array(n), z: new Float32Array(n), cs: new Float32Array(n * 3), ct: new Float32Array(n * 3) };
      for (var i = 0; i < n; i++) {
        var si = (Math.random() * ns | 0) * 5, ti = (Math.random() * nt | 0) * 5, pc = pal[Math.random() * pal.length | 0];
        P.sx[i] = S.pts[si]; P.sy[i] = S.pts[si + 1]; P.tx[i] = T.pts[ti]; P.ty[i] = T.pts[ti + 1];
        P.a[i] = Math.random() * 6.283; P.r[i] = 20 + Math.random() * Math.random() * oo.wobble; P.d[i] = Math.random(); P.z[i] = .7 + Math.random() * 1.5;
        var m = oo.colorMode, src = m === 'palette' ? pc : [S.pts[si + 2], S.pts[si + 3], S.pts[si + 4]], tgt = m === 'palette' || m === 'source' ? src : [T.pts[ti + 2], T.pts[ti + 3], T.pts[ti + 4]];
        if (m === 'target' || (noSrc && m !== 'palette')) src = tgt;
        P.cs[i * 3] = src[0]; P.cs[i * 3 + 1] = src[1]; P.cs[i * 3 + 2] = src[2]; P.ct[i * 3] = tgt[0]; P.ct[i * 3 + 1] = tgt[1]; P.ct[i * 3 + 2] = tgt[2];
      }
      this.P = P; this.sA = S.anchor; this.tA = T.anchor; return true;
    };
    // Source points for intros (no 'from'): viewport coordinates, colour filled in from the target.
    function scatterPts(kind, n) {
      var pts = [], cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
      for (var i = 0; i < n; i++) {
        var x, y, a = Math.random() * 6.283;
        if (kind === 'center') { var r = Math.random() * Math.random() * Math.min(W, H) * .12; x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; }
        else if (kind === 'edges') { var side = Math.random() * 4 | 0, t = Math.random(); x = side === 0 ? -20 : side === 1 ? W + 20 : t * W; y = side === 2 ? -20 : side === 3 ? H + 20 : t * H; if (side < 2) y = t * H; }
        else if (kind === 'ring') { var rr = R * (.9 + Math.random() * .25); x = cx + Math.cos(a) * rr; y = cy + Math.sin(a) * rr; }
        else { x = Math.random() * W; y = Math.random() * H; }
        pts.push(x, y, 255, 255, 255);
      }
      return { pts: pts, anchor: null };
    }
    Morph.prototype.invalidate = function () { this.P = null; };
    Morph.prototype.fades = function (p) {
      var ff = this.o.fadeFrom, ft = this.o.fadeTo, spec = this.spec;
      var fo = p <= 0 ? '' : (1 - clamp((p - ff[0]) / (ff[1] - ff[0]))).toFixed(3);
      var ti = p >= 1 ? '' : p <= 0 ? (this.o.hideTarget && !this.done ? '0' : '') : clamp((p - ft[0]) / (ft[1] - ft[0])).toFixed(3);
      if (spec.fadeFrom !== false) this.fromEls.forEach(function (e) { e.style.opacity = fo; e.style.transition = fo ? 'none' : ''; });
      if (spec.fadeTo !== false) this.toEls.forEach(function (e) { e.style.opacity = ti; e.style.transition = ti ? 'none' : ''; });
      if (spec.onProgress) spec.onProgress(p);
    };
    Morph.prototype.progress = function (p) { this.p = clamp(p); this.fades(this.p); this.manual = true; schedule(); return this; };
    Morph.prototype.destroy = function () { this.fades(0); morphs.splice(morphs.indexOf(this), 1); var i = scrolled.indexOf(this); if (i > -1) scrolled.splice(i, 1); schedule(); };

    function draw(m, p) {
      var P = m.P, oo = m.o, sr = m.sA ? m.sA.getBoundingClientRect() : { left: 0, top: 0 }, tr = m.tA.getBoundingClientRect();
      var cx, cy;
      if (oo.center === 'viewport') { cx = W / 2; cy = H * .48; }
      else if (Array.isArray(oo.center)) { cx = W * oo.center[0]; cy = H * oo.center[1]; }
      else { var a = m.fromEls.length ? m.fromEls[0].getBoundingClientRect() : { left: 0, right: W, top: 0, bottom: H }, b = m.toEls[0].getBoundingClientRect(); cx = ((a.left + a.right) / 2 + (b.left + b.right) / 2) / 2; cy = clamp(((a.top + a.bottom) / 2 + (b.top + b.bottom) / 2) / 2 / H) * H; }
      var fade = p > .86 ? 1 - (p - .86) / .14 : 1, st = oo.stagger, blend = oo.colorMode === 'blend', glow = oo.glow, sampled = oo.colorMode !== 'palette';
      var dens = sampled ? Math.min(1, 1100 / P.n) : 1;
      q.o = oo; q.cx = cx; q.cy = cy; q.dir = m.dir;
      for (var i = 0; i < P.n; i++) {
        var e = m.ease(clamp((p - P.d[i] * st) / (1 - st - .06))), s = Math.sin(Math.PI * e);
        var x0 = P.sx[i] + sr.left, y0 = P.sy[i] + sr.top, x1 = P.tx[i] + tr.left, y1 = P.ty[i] + tr.top;
        q.x0 = x0; q.y0 = y0; q.x1 = x1; q.y1 = y1; q.x = x0 + (x1 - x0) * e; q.y = y0 + (y1 - y0) * e;
        q.e = e; q.s = s; q.a = P.a[i]; q.r = P.r[i]; q.d = P.d[i]; q.i = i; q.p = p;
        m.move(q);
        var j = i * 3, cr = P.cs[j], cg = P.cs[j + 1], cb = P.cs[j + 2];
        if (blend) { cr += (P.ct[j] - cr) * e; cg += (P.ct[j + 1] - cg) * e; cb += (P.ct[j + 2] - cb) * e; }
        var sz = P.z[i] * (1 + s * 1.4) * oo.size;
        ctx.globalAlpha = (.5 + .5 * s) * fade * (sampled ? (.55 + .45 * (1 - s)) * dens + .15 : 1); ctx.drawImage(sprite(qi(cr, cg, cb), glow, sampled), q.x - sz, q.y - sz, sz * 2, sz * 2);
      }
    }

    function frame() {
      ticking = false;
      scrolled.forEach(function (m) {
        if (m.manual) return;
        var tb = m.trigger.getBoundingClientRect(), t = m.edge === 'bottom' ? tb.bottom : tb.top, p = clamp((H * m.start - t) / (H * (m.start - m.end)));
        if (p !== m.p) m.fades(p); m.p = p;
      });
      if (reduced || !cv) return;
      var act = morphs.filter(function (m) { return m.p > 0 && m.p < 1 && (m.P || m.build()); });
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      if (!act.length) { if (shown) { cv.style.display = 'none'; shown = false; } if (neb) neb.style.opacity = '0'; return; }
      if (!shown) { cv.style.display = 'block'; shown = true; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var peak = 0, pp = 0;
      act.forEach(function (m) { ctx.globalCompositeOperation = !m.o.glow ? 'source-over' : m.o.colorMode === 'palette' ? 'lighter' : 'screen'; draw(m, m.p); var v = Math.sin(Math.PI * m.p); if (v > peak) { peak = v; pp = m.p; } });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (neb) { neb.style.opacity = (peak * .8).toFixed(3); neb.style.transform = 'rotate(' + (pp * 210).toFixed(1) + 'deg) scale(' + (.6 + pp * .55).toFixed(3) + ')'; }
    }
    function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
    function onResize() { resize(); morphs.forEach(function (m) { m.invalidate(); }); schedule(); }
    var listening = false;
    function listen() { if (listening) return; listening = true; addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', onResize); }

    return {
      options: o,
      motions: MOTIONS,
      morph: function (spec) { ensureLayer(); var m = new Morph(spec); morphs.push(m); listen(); return m; },
      scroll: function (spec) {
        ensureLayer(); var m = new Morph(spec); m.trigger = $(spec.trigger || spec.to)[0];
        m.edge = spec.edge === 'bottom' ? 'bottom' : 'top';
        m.start = spec.start != null ? spec.start : .95; m.end = spec.end != null ? spec.end : .35; m.p = -1;
        m.fades(0); morphs.push(m); scrolled.push(m); listen(); schedule(); return m;
      },
      // Timed build (e.g. a page-load intro). No 'from' = dots gather from `scatter`. Resolves when finished.
      play: function (spec) {
        ensureLayer(); var m = new Morph(spec); m.manual = true; morphs.push(m); listen(); m.fades(0);
        var dur = spec.duration || 3000, delay = spec.delay || 0;
        return new Promise(function (res) {
          if (reduced) { m.p = 1; m.fades(1); m.done = true; return res(m); }
          var t0 = null;
          function f(now) { if (t0 === null) t0 = now + delay; var p = clamp((now - t0) / dur); if (now >= t0) { m.p = p; m.fades(p); schedule(); }
            if (p < 1) requestAnimationFrame(f); else { m.done = true; morphs.splice(morphs.indexOf(m), 1); m.fades(1); schedule(); res(m); } }
          requestAnimationFrame(f);
        });
      },
      refresh: onResize,
      destroy: function () {
        morphs.slice().forEach(function (m) { m.fades(0); }); morphs = []; scrolled = [];
        removeEventListener('scroll', schedule); removeEventListener('resize', onResize); listening = false;
        if (cv) cv.remove(); if (neb) neb.remove(); cv = neb = null; cache = {};
      }
    };
  }

  var api = { create: create, motions: MOTIONS, version: '1.2.0' };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ParticleMorph = api;
})(typeof window !== 'undefined' ? window : this);
