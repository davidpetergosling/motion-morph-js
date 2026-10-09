/*!
 * PortalMorph v1.0 — scroll-driven portal transitions between DOM content. Canvas 2D, no dependencies.
 *
 *   const pt = PortalMorph.create({ style: 'sparks', color: '#ff9a2e' });
 *   pt.scroll({ from: '#a .card', to: '#b .card' });                  // scroll-scrubbed
 *   pt.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = pt.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   pt.play({ from: x, to: y, duration: 3000 });                       // timed, returns a Promise
 *
 * A portal opens around the source, which sinks through it into the void and is gone as the portal
 * closes. A second portal opens around the target, which pushes out toward the viewer and settles.
 * Styles: 'sparks' (a spinning ring of sparks), 'ring' (a clean neon ring), 'rift' (a jagged tear).
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
    style: 'sparks',          // 'sparks' | 'ring' | 'rift'
    color: '#ff9a2e',         // portal colour
    voidColor: '#05050a',     // colour seen through the portal
    size: 1,                  // portal radius relative to the circle that encloses the element
    tilt: 0,                  // 0 = facing the viewer, 1 = lying almost flat
    sparks: 140,              // sparks per portal ('ring' and 'rift' use fewer)
    spin: 1,                  // ring and spark rotation speed
    direction: 'cw',          // 'cw' | 'ccw'
    twist: 0.7,               // radians the content turns as it sinks / emerges
    dual: false,              // open both portals at once, so content passes straight between them
    ease: 'inOut',            // sink ease; emerging uses a slight overshoot
    pad: 4,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };
  // Timelines: [portal A open, A close, sink, portal B open, B close, emerge] as [start, end] progress windows.
  var SINGLE = { aOpen: [0, 0.16], aClose: [0.4, 0.52], sink: [0.12, 0.42], bOpen: [0.46, 0.6], bClose: [0.86, 1], emerge: [0.56, 0.86] };
  var DUAL = { aOpen: [0, 0.16], aClose: [0.6, 0.78], sink: [0.14, 0.46], bOpen: [0.06, 0.22], bClose: [0.8, 1], emerge: [0.4, 0.74] };

  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function isClear(c) {
    if (!c || c === 'transparent') return true;
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return false;
    var p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 && parseFloat(p[3]) === 0;
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); if (r && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); }
  function rgbOf(c) { var g = mkCanvas(1, 1).getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function rng(seed) { var s = (seed % 2147483646) + 1; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
  }
  function win(p, w) { return clamp((p - w[0]) / (w[1] - w[0])); }

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
  // Transparent snapshot of an element plus `pad` px of margin.
  function snapshot(el, o) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el), pad = +o.pad || 0, W = r.width + pad * 2, H = r.height + pad * 2;
    if (r.width < 2 || r.height < 2) return null;
    var ts = Math.min(root.devicePixelRatio || 1, o.maxDpr), budget = o.maxPixels || 600000;
    if (W * H * ts * ts > budget) ts = Math.sqrt(budget / (W * H));
    var c = mkCanvas(W * ts, H * ts), g = c.getContext('2d');
    g.scale(c.width / W, c.height / H);
    if (!isClear(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; rrect(g, pad, pad, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 0); g.fill(); }
    g.translate(pad - r.left, pad - r.top); paint(g, el);
    return { el: el, tex: c, W: W, H: H, pad: pad, ox: r.left - pad, oy: r.top - pad };
  }
  function origin(sh) { var r = sh.el.getBoundingClientRect(); sh.ox = r.left - sh.pad; sh.oy = r.top - sh.pad; }
  function tinted(tex, color, a) {
    var c = mkCanvas(tex.width, tex.height), g = c.getContext('2d');
    g.drawImage(tex, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

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

    // Portal geometry around a sheet. amt scales it open (0 → 1).
    function geom(m, sh, amt) {
      var mo = m.o, R = Math.hypot(sh.W, sh.H) / 2 * 1.08 * (+mo.size || 1), rift = mo.style === 'rift', sq = 1 - clamp(mo.tilt) * 0.75;
      return { x: sh.ox + sh.W / 2, y: sh.oy + sh.H / 2, R: R, rx: R * (rift ? 0.6 : 1) * amt, ry: R * (rift ? 1.05 : sq) * amt };
    }
    // Outline of the opening: an ellipse, or a jagged ellipse for 'rift'.
    function shape(m, P, tt, grow) {
      var rx = P.rx * (grow || 1), ry = P.ry * (grow || 1);
      ctx.beginPath();
      if (m.o.style !== 'rift') { ctx.ellipse(P.x, P.y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); return; }
      for (var i = 0; i < 64; i++) {
        var a = i / 64 * TAU, j = 1 + (vnoise(i * 0.55, tt * 0.9) - 0.5) * 0.3 + (vnoise(i * 2.3, tt * 2.1 + 9) - 0.5) * 0.12;
        var x = P.x + Math.cos(a) * rx * j, y = P.y + Math.sin(a) * ry * j;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    function interior(m, P, tt, amt, dir) {
      if (P.rx < 1) return;
      var c = m.rgb, v = m.voidRgb;
      ctx.save(); shape(m, P, tt); ctx.clip();
      var g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, Math.max(P.rx, P.ry));
      g.addColorStop(0, rgba(v, 1)); g.addColorStop(0.8, rgba(v, 0.96)); g.addColorStop(1, rgba(c, 0.32));
      ctx.fillStyle = g; ctx.fillRect(P.x - P.rx * 1.3, P.y - P.ry * 1.3, P.rx * 2.6, P.ry * 2.6);
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(P.x, P.y); ctx.scale(1, P.ry / P.rx);
      ctx.lineWidth = Math.max(1, P.rx * 0.02); ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(dir * tt * 0.45 + i * TAU / 3); ctx.beginPath();
        for (var s = 0; s <= 1.0001; s += 0.04) { var r = s * P.rx * 0.95, a = s * 4.2 * dir; if (s) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(0, 0); }
        ctx.strokeStyle = rgba(c, 0.11 * amt); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    function rim(m, P, tt, amt, dir) {
      if (P.rx < 1) return;
      var c = m.rgb, hot = m.hot, style = m.o.style;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      var layers = [[Math.max(4, P.R * 0.09), rgba(c, 0.12 * amt)], [Math.max(2, P.R * 0.035), rgba(c, 0.4 * amt)], [Math.max(1, P.R * 0.012), rgba(hot, 0.95 * amt)]];
      layers.forEach(function (L) { shape(m, P, tt); ctx.lineWidth = L[0]; ctx.strokeStyle = L[1]; ctx.stroke(); });
      if (style === 'ring') {
        shape(m, P, tt, 0.88); ctx.lineWidth = Math.max(1, P.R * 0.01); ctx.strokeStyle = rgba(c, 0.7 * amt); ctx.stroke();
        ctx.setLineDash([P.R * 0.16, P.R * 0.1]); ctx.lineDashOffset = -dir * tt * P.R * 0.12;
        shape(m, P, tt, 0.94); ctx.lineWidth = Math.max(1.5, P.R * 0.02); ctx.strokeStyle = rgba(hot, 0.55 * amt); ctx.stroke();
        ctx.lineDashOffset = dir * tt * P.R * 0.2; shape(m, P, tt, 1.08); ctx.lineWidth = Math.max(1, P.R * 0.008); ctx.strokeStyle = rgba(c, 0.5 * amt); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    function sparks(m, P, tt, amt, dir, seed) {
      if (P.rx < 1 || !m.sparks.length) return;
      var c = m.rgb, hot = m.hot, rift = m.o.style === 'rift', n = Math.round(m.sparks.length * (m.o.style === 'sparks' ? 1 : 0.35));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (var i = 0; i < n; i++) {
        var q = m.sparks[(i + seed) % m.sparks.length], ph = tt * q.sp * 0.5 + q.s, f = ph - Math.floor(ph);
        if (q.s > amt + 0.15) continue;
        var a = q.a + dir * tt * 0.6, ca = Math.cos(a), sa = Math.sin(a), x0 = P.x + ca * P.rx, y0 = P.y + sa * P.ry;
        var tx = -sa * P.rx, ty = ca * P.ry, tl = Math.hypot(tx, ty) || 1; tx = tx / tl * dir; ty = ty / tl * dir;
        var L = q.len * P.R, pos = function (u) {
          if (rift) return [x0 + ca * u * L * 0.25 + Math.sin(u * 6 + q.s * 9) * 4, y0 - u * L * 0.9];
          return [x0 + tx * u * L + ca * u * L * 0.35, y0 + ty * u * L + sa * u * L * 0.35 + u * u * L * 0.6];
        };
        var p1 = pos(f), p0 = pos(Math.max(0, f - 0.12)), al = Math.min(1, (1 - f) * 1.4) * amt;
        ctx.strokeStyle = rgba(q.hot ? hot : c, al); ctx.lineWidth = Math.max(0.6, q.w * (1 - f));
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
      ctx.restore();
    }
    // Content on its way through: u 0 = at rest, 1 = gone into the void.
    function content(m, sh, u, P, dir, scaleFn) {
      if (u >= 1) return;
      var mo = m.o, s = scaleFn(u), sq = 1 - clamp(mo.tilt) * 0.6 * u, k = clamp(u * 1.2);
      ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(dir * mo.twist * u); ctx.scale(s, s * sq);
      var al = 1 - clamp((u - 0.75) / 0.25);
      ctx.globalAlpha = al * (1 - k); ctx.drawImage(sh.tex, -sh.W / 2, -sh.H / 2, sh.W, sh.H);
      if (k > 0.01) { ctx.globalAlpha = al * k; ctx.drawImage(sh.dark, -sh.W / 2, -sh.H / 2, sh.W, sh.H); }
      ctx.restore();
    }

    function draw(m, p) {
      var mo = m.o, S = m.S, T = m.T, tl = mo.dual ? DUAL : SINGLE, dir = mo.direction === 'ccw' ? -1 : 1, tt = p * 12 * (+mo.spin || 0);
      var aA = EASE.out(win(p, tl.aOpen)) * (1 - EASE.in(win(p, tl.aClose))), aB = EASE.out(win(p, tl.bOpen)) * (1 - EASE.in(win(p, tl.bClose)));
      var PA = geom(m, S, aA), PB = geom(m, T, aB);
      var us = m.ease(win(p, tl.sink)), ue = win(p, tl.emerge);
      if (aA > 0.005) interior(m, PA, tt, aA, dir);
      if (aB > 0.005) interior(m, PB, tt + 3, aB, dir);
      content(m, S, us, PA, dir, function (u) { return lerp(1, 0.04, Math.pow(u, 0.8)); });
      if (ue > 0) content(m, T, 1 - ue, PB, -dir, function (u) { return lerp(0.04, 1, EASE.back(1 - u)); });
      if (aA > 0.005) { rim(m, PA, tt, aA, dir); sparks(m, PA, tt, aA, dir, 0); }
      if (aB > 0.005) { rim(m, PB, tt + 3, aB, dir); sparks(m, PB, tt + 3, aB, dir, 37); }
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
      var mo = this.o, R = rng(13), n = Math.max(0, Math.round(mo.sparks)), list = [];
      this.rgb = rgbOf(mo.color); this.voidRgb = rgbOf(mo.voidColor);
      this.hot = this.rgb.map(function (v) { return Math.round(lerp(v, 255, 0.7)); });
      S.dark = tinted(S.tex, mo.voidColor, 0.85); T.dark = tinted(T.tex, mo.voidColor, 0.85);
      for (var i = 0; i < n; i++) list.push({ a: R() * TAU, sp: 0.6 + R() * 0.9, s: R(), len: 0.15 + R() * 0.35, w: 1.2 + R() * 2.2, hot: R() < 0.6 });
      this.sparks = list; this.S = S; this.T = T; this.built = true; return true;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PortalMorph = api;
})(typeof window !== 'undefined' ? window : this);
