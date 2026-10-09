/*!
 * VacuumMorph v1.0 — scroll-driven vacuum morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const vm = VacuumMorph.create({ color: '#dff4ff' });
 *   vm.scroll({ from: '#a h2', to: '#b h2' });                        // scroll-scrubbed
 *   vm.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = vm.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   vm.play({ from: x, to: y, duration: 3000 });                       // timed, returns a Promise
 *
 * A ring of wind streaks spirals in toward a point between the two elements. The source breaks into
 * tiles that get sucked in, stretching toward the centre. The wind then reverses and blows the target's
 * tiles back out into place. Real content is hidden while the morph runs.
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
    radius: 'auto',           // radius of the wind circle, px; 'auto' = half the distance between the elements (120px – 45% of the viewport)
    position: 'between',      // where the vacuum sits: 'between' (midpoint of from/to) | 'viewport' | [fx, fy] viewport fractions
    color: '#dff4ff',         // wind colour
    wind: 1,                  // wind streak strength (0 hides the wind)
    streaks: 110,             // wind streaks; about a third are dust specks
    swirl: 0.9,               // turns a wind streak makes on its way in
    spin: 0.5,                // turns a tile makes on its way in
    direction: 'cw',          // 'cw' | 'ccw'
    stretch: 2,               // how far tiles stretch toward the centre as they are pulled in
    tile: 10,                 // tile size, px
    stagger: 0.5,             // 0–0.9, how spread out departures are (nearest tiles go first)
    ease: 'in',               // pull ease; blowing out plays it in reverse
    pad: 4,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };
  var SPAN = 0.44;   // pull-in runs over [0.02, 0.46]; blow-out over [0.52, 0.96]

  // Grid of tiles over a snapshot, skipping fully transparent ones.
  function tiles(sh, size, seed) {
    var out = [], d = sh.data && sh.data.data, kx = sh.w / sh.W, ky = sh.h / sh.H, R = rng(seed);
    size = Math.max(4, +size || 10);
    for (var y = 0; y < sh.H; y += size) for (var x = 0; x < sh.W; x += size) {
      var tw = Math.min(size, sh.W - x), th = Math.min(size, sh.H - y);
      if (tw < 1 || th < 1) continue;
      var sx = x * kx, sy = y * ky, sw = tw * kx, shh = th * ky;
      if (d) {
        var hit = false, x0 = Math.floor(sx), x1 = Math.min(sh.w, Math.ceil(sx + sw)), y0 = Math.floor(sy), y1 = Math.min(sh.h, Math.ceil(sy + shh));
        for (var yy = y0; yy < y1 && !hit; yy += 2) for (var xx = x0; xx < x1; xx += 2) if (d[(yy * sh.w + xx) * 4 + 3] > 10) { hit = true; break; }
        if (!hit) continue;
      }
      out.push({ x: x + tw / 2, y: y + th / 2, w: tw, h: th, sx: sx, sy: sy, sw: sw, sh: shh, j: R(), r0: 0, a0: 0 });
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
    function centerOf(m) {
      var pos = m.o.position, S = m.S, T = m.T;
      if (Array.isArray(pos)) return [VW * pos[0], VH * pos[1]];
      if (pos === 'viewport') return [VW / 2, VH / 2];
      return [(S.ox + S.W / 2 + T.ox + T.W / 2) / 2, (S.oy + S.H / 2 + T.oy + T.H / 2) / 2];
    }
    function radiusOf(m) {
      var r = m.o.radius; if (r !== 'auto' && r != null) return +r;
      var S = m.S, T = m.T, d = Math.hypot(S.ox + S.W / 2 - T.ox - T.W / 2, S.oy + S.H / 2 - T.oy - T.H / 2);
      return Math.max(120, Math.min(Math.min(VW, VH) * 0.45, d * 0.5));
    }

    // Wind: streaks spiralling in (or out) along r = Rw·(1 − f)^1.1, plus a soft pressure glow at the centre.
    function wind(m, C, Rw, amt, p, dir, outward) {
      if (amt <= 0.01 || !(m.o.wind > 0)) return;
      var c = m.rgb, tt = p * 9, sw = m.o.swirl * TAU, str = m.o.wind;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var g = ctx.createRadialGradient(C[0], C[1], 0, C[0], C[1], Rw * 0.5);
      g.addColorStop(0, rgba(c, 0.3 * amt * Math.min(1, str))); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(C[0] - Rw * 0.5, C[1] - Rw * 0.5, Rw, Rw);
      var at = function (q, f) {
        var r = Rw * Math.pow(1 - clamp(f), 1.1) + 3, a = q.a + dir * (sw * Math.pow(clamp(f), 1.6) + tt * 0.25);
        return [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
      };
      m.streaks.forEach(function (q) {
        var ph = tt * q.sp + q.s, f = ph - Math.floor(ph), head = outward ? 1 - f : f, al = Math.sin(PI * f) * amt * q.al * Math.min(1, str);
        if (al < 0.01) return;
        ctx.strokeStyle = rgba(c, al); ctx.lineWidth = q.w * (0.6 + (1 - head) * 0.8);
        ctx.beginPath();
        if (q.dust) { var d = at(q, head); ctx.moveTo(d[0], d[1]); ctx.lineTo(d[0] + 0.1, d[1]); ctx.stroke(); return; }
        for (var k = 0; k <= 8; k++) {
          var pt = at(q, head + (outward ? 1 : -1) * q.len * k / 8);
          if (k) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]);
        }
        ctx.stroke();
      });
      ctx.restore();
    }
    // Tiles pulled toward C. out = 0: rest → centre over the window; out = 1: centre → rest.
    function tilePass(m, sh, C, p, t0, out, dir) {
      var mo = m.o, list = sh.tiles, n = list.length; if (!n) return;
      var st = Math.max(0, Math.min(0.9, mo.stagger)), dur = SPAN * (1 - st), spin = mo.spin * TAU * dir * (out ? -1 : 1), str = mo.stretch;
      var dmin = 1e9, dmax = 0, i, t;
      for (i = 0; i < n; i++) {
        t = list[i]; var dx = sh.ox + t.x - C[0], dy = sh.oy + t.y - C[1];
        t.r0 = Math.hypot(dx, dy); t.a0 = Math.atan2(dy, dx);
        if (t.r0 < dmin) dmin = t.r0; if (t.r0 > dmax) dmax = t.r0;
      }
      for (i = 0; i < n; i++) {
        t = list[i];
        var ord = clamp((t.r0 - dmin) / (dmax - dmin || 1) * 0.85 + t.j * 0.15), u = clamp((p - t0 - ord * SPAN * st) / dur);
        if (out) u = 1 - u;
        if (u >= 1) continue;
        var e = m.ease(u), r = t.r0 * (1 - e), th = t.a0 + spin * Math.pow(e, 2), alpha = clamp(r / 24);
        if (alpha <= 0.01) continue;
        var x = C[0] + Math.cos(th) * r, y = C[1] + Math.sin(th) * r;
        // Stretch along the radius, toward the nozzle, and shrink as it gets close.
        var sc = 0.25 + 0.75 * Math.pow(1 - e, 0.5), sR = sc * (1 + str * e * e), sN = sc * (1 - 0.5 * e);
        var pc = Math.cos(th), ps = Math.sin(th), a11 = sR * pc * pc + sN * ps * ps, a12 = (sR - sN) * pc * ps, a22 = sR * ps * ps + sN * pc * pc;
        var rot = (th - t.a0) + (t.j - 0.5) * 2.4 * e, cr = Math.cos(rot), sr = Math.sin(rot);
        ctx.setTransform(dpr * (a11 * cr + a12 * sr), dpr * (a12 * cr + a22 * sr), dpr * (a12 * cr - a11 * sr), dpr * (a22 * cr - a12 * sr), dpr * x, dpr * y);
        var k = 0.6 * e, dw = t.w + 0.6, dh = t.h + 0.6;
        ctx.globalAlpha = alpha * (1 - k); ctx.drawImage(sh.tex, t.sx, t.sy, t.sw, t.sh, -dw / 2, -dh / 2, dw, dh);
        if (k > 0.01) { ctx.globalAlpha = alpha * k; ctx.drawImage(sh.pale, t.sx, t.sy, t.sw, t.sh, -dw / 2, -dh / 2, dw, dh); }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    }

    function setup(m) {
      var mo = m.o, R = rng(21), n = Math.max(0, Math.round(mo.streaks)), list = [];
      m.S.tiles = tiles(m.S, mo.tile, 3); m.T.tiles = tiles(m.T, mo.tile, 5);
      m.rgb = rgbOf(mo.color);
      m.S.pale = tinted(m.S.tex, mo.color, 0.8); m.T.pale = tinted(m.T.tex, mo.color, 0.8);
      for (var i = 0; i < n; i++) { var dust = R() < 0.32; list.push({ a: R() * TAU, s: R(), sp: 0.5 + R() * 0.8, len: 0.08 + R() * 0.22, w: dust ? 1.5 + R() * 1.5 : 0.6 + R() * 1.4, al: dust ? 0.5 + R() * 0.4 : 0.25 + R() * 0.45, dust: dust }); }
      m.streaks = list;
      return true;
    }
    function draw(m, p) {
      var C = centerOf(m), Rw = radiusOf(m), dir = m.o.direction === 'ccw' ? -1 : 1;
      if (p < 0.5) {
        wind(m, C, Rw, EASE.out(win(p, 0, 0.1)) * (1 - EASE.in(win(p, 0.42, 0.5))), p, dir, false);
        tilePass(m, m.S, C, p, 0.02, 0, dir);
      } else {
        wind(m, C, Rw, EASE.out(win(p, 0.5, 0.58)) * (1 - EASE.inOut(win(p, 0.8, 0.98))), p, dir, true);
        tilePass(m, m.T, C, p, 0.52, 1, dir);
      }
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.VacuumMorph = api;
})(typeof window !== 'undefined' ? window : this);
