/*!
 * BlackHoleMorph v1.0 — scroll-driven black-hole morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const bh = BlackHoleMorph.create({ spin: 1.2 });
 *   bh.scroll({ from: '#a h2', to: '#b h2' });                        // scroll-scrubbed
 *   bh.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = bh.morph({ from: x, to: y }); m.progress(0.5);           // manual control
 *   bh.play({ from: x, to: y, duration: 3000 });                       // timed, returns a Promise
 *
 * A black hole with a glowing accretion disk opens between the two elements. The source breaks into tiles
 * that spiral in, stretching along their orbit and reddening as they cross the horizon. The hole collapses
 * in a flash, then a white hole throws the target's tiles back out into place.
 * Real content is hidden while the morph runs. Per-morph specs accept any option to override defaults.
 */
(function (root) {
  'use strict';
  var PI = Math.PI, TAU = PI * 2;
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var EASE = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in: function (t) { return t * t * t; },
    linear: function (t) { return t; },
    sine: function (t) { return -(Math.cos(PI * t) - 1) / 2; }
  };
  var $ = function (x) { return typeof x === 'string' ? Array.prototype.slice.call(document.querySelectorAll(x)) : x == null ? [] : x.length != null && !x.nodeType ? Array.prototype.slice.call(x) : [x]; };

  var DEFAULTS = {
    size: 'auto',             // event-horizon radius, px; 'auto' = 6% of the smaller viewport side (28–72px)
    position: 'between',      // where the hole opens: 'between' (midpoint of from/to) | 'viewport' | [fx, fy] viewport fractions
    spin: 1.2,                // turns a tile makes on its way in
    direction: 'cw',          // 'cw' | 'ccw'
    stretch: 2.5,             // spaghettification: how far tiles stretch along their orbit near the horizon
    tile: 10,                 // tile size, px
    stagger: 0.5,             // 0–0.9, how spread out departures are (nearest tiles fall first)
    diskColors: ['#fff4d6', '#ffb347', '#ff4f1a', '#7a1cff'],   // accretion disk, inner → outer
    tilt: 0.28,               // disk squash (0.05 = edge-on, 1 = face-on)
    redshift: 0.7,            // tint toward red as tiles fall in (0–1)
    blueshift: 0.5,           // tint toward blue-white as tiles fly out (0–1)
    flash: true,              // flash when the hole collapses
    ease: 'in',               // fall ease; the outflow plays it in reverse
    pad: 4,                   // px of margin captured around each element
    maxPixels: 600000,        // per-element snapshot pixel budget
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    respectReducedMotion: true
  };
  var SPAN = 0.44;   // the infall runs over [0.02, 0.46]; the outflow over [0.52, 0.96]

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

  // Copy of a snapshot with its opaque pixels washed in one colour — cross-faded in for red/blue shift.
  function tinted(tex, color, a) {
    var c = mkCanvas(tex.width, tex.height), g = c.getContext('2d');
    g.drawImage(tex, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
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

    function centerOf(m) {
      var pos = m.o.position, S = m.S, T = m.T;
      if (Array.isArray(pos)) return [VW * pos[0], VH * pos[1]];
      if (pos === 'viewport') return [VW / 2, VH / 2];
      return [(S.ox + S.W / 2 + T.ox + T.W / 2) / 2, (S.oy + S.H / 2 + T.oy + T.H / 2) / 2];
    }
    function radiusOf(m) { var s = m.o.size; return s === 'auto' || s == null ? Math.max(28, Math.min(72, Math.min(VW, VH) * 0.06)) : +s; }

    // Accretion disk: a tilted glowing ring with streaks orbiting it. half: 0 = whole disk, 1 = only the half in front of the hole.
    function disk(m, C, Rh, p, dir, half) {
      if (Rh < 0.5) return;
      var c = m.disk, tilt = Math.max(0.05, Math.min(1, m.o.tilt)), Ro = Rh * 3.4;
      ctx.save(); ctx.translate(C[0], C[1]); ctx.rotate(-0.22 * dir); ctx.scale(1, tilt);
      if (half) { ctx.beginPath(); ctx.rect(-Ro, 0, Ro * 2, Ro); ctx.clip(); ctx.globalAlpha = 0.85; }
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(0, 0, Rh * 0.9, 0, 0, Ro);
      g.addColorStop(0, rgba(c[0], 0)); g.addColorStop(0.06, rgba(c[0], 0.95)); g.addColorStop(0.25, rgba(c[1], 0.75));
      g.addColorStop(0.55, rgba(c[2], 0.4)); g.addColorStop(1, rgba(c[3], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Ro, 0, TAU); ctx.fill();
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, Rh * 0.07);
      for (var i = 0; i < 7; i++) {
        var rr = Rh * (1.25 + i * 0.3), a0 = p * TAU * (4 - i * 0.35) * dir + i * 1.7;
        ctx.strokeStyle = 'rgba(255,245,225,' + (0.24 - i * 0.025) + ')'; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 1.1 + i * 0.1); ctx.stroke();
      }
      ctx.restore();
    }
    // Event horizon (black core + photon ring) or, for the outflow, a white-hot core.
    function core(m, C, Rh, white) {
      if (Rh < 0.5) return;
      var c = m.disk;
      ctx.save(); ctx.translate(C[0], C[1]);
      if (!white) {
        var g = ctx.createRadialGradient(0, 0, Rh * 0.7, 0, 0, Rh * 1.15);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Rh * 1.15, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(c[0], 0.9);
        ctx.lineWidth = Math.max(1.2, Rh * 0.05); ctx.beginPath(); ctx.arc(0, 0, Rh * 1.02, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.3; ctx.lineWidth = Rh * 0.2; ctx.stroke();
      } else {
        var w = ctx.createRadialGradient(0, 0, 0, 0, 0, Rh * 2.2);
        w.addColorStop(0, 'rgba(255,255,255,1)'); w.addColorStop(0.3, rgba(c[0], 0.85)); w.addColorStop(1, rgba(c[1], 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = w; ctx.beginPath(); ctx.arc(0, 0, Rh * 2.2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // Tiles on their spiral. out = 0: rest → singularity over the window; out = 1: singularity → rest.
    function tilePass(m, sh, C, Rh, p, t0, out, dir) {
      var mo = m.o, list = sh.tiles, n = list.length; if (!n) return;
      var st = Math.max(0, Math.min(0.9, mo.stagger)), dur = SPAN * (1 - st), spin = mo.spin * TAU * dir * (out ? -1 : 1), str = mo.stretch;
      var tint = out ? sh.blue : sh.red, shift = clamp(out ? mo.blueshift : mo.redshift), dmin = 1e9, dmax = 0, i, t;
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
        // Spin follows the fall, so tiles whirl faster as they near the centre instead of orbiting wide first.
        var e = m.ease(u), r = t.r0 * (1 - e), th = t.a0 + spin * Math.pow(e, 2.5);
        var x = C[0] + Math.cos(th) * r, y = C[1] + Math.sin(th) * r;
        var alpha = Rh > 0.5 ? clamp((r - Rh * 0.55) / (Rh * 0.6)) : clamp(1 - e);
        if (alpha <= 0.01) continue;
        var sc = 0.2 + 0.8 * Math.pow(1 - e, 0.6), sT = sc * (1 + str * e * e), sN = sc * (1 - 0.6 * e);
        var pc = Math.cos(th + PI / 2), ps = Math.sin(th + PI / 2), a11 = sT * pc * pc + sN * ps * ps, a12 = (sT - sN) * pc * ps, a22 = sT * ps * ps + sN * pc * pc;
        var rot = th - t.a0, cr = Math.cos(rot), sr = Math.sin(rot);
        ctx.setTransform(dpr * (a11 * cr + a12 * sr), dpr * (a12 * cr + a22 * sr), dpr * (a12 * cr - a11 * sr), dpr * (a22 * cr - a12 * sr), dpr * x, dpr * y);
        var k = shift * Math.min(1, e * 1.4), dw = t.w + 0.6, dh = t.h + 0.6;
        ctx.globalAlpha = alpha * (1 - k); ctx.drawImage(sh.tex, t.sx, t.sy, t.sw, t.sh, -dw / 2, -dh / 2, dw, dh);
        if (k > 0.01) { ctx.globalAlpha = alpha * k; ctx.drawImage(tint, t.sx, t.sy, t.sw, t.sh, -dw / 2, -dh / 2, dw, dh); }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    }

    function draw(m, p) {
      var mo = m.o, C = centerOf(m), R = radiusOf(m), dir = mo.direction === 'ccw' ? -1 : 1;
      if (p < 0.5) {
        var Rh = R * EASE.out(clamp(p / 0.12)) * (1 - EASE.in(clamp((p - 0.43) / 0.07)));
        disk(m, C, Rh, p, dir, 0);
        tilePass(m, m.S, C, Rh, p, 0.02, 0, dir);
        core(m, C, Rh, false);
        disk(m, C, Rh, p, dir, 1);
      } else {
        var Rw = R * 0.75 * EASE.out(clamp((p - 0.5) / 0.06)) * (1 - EASE.inOut(clamp((p - 0.78) / 0.18)));
        disk(m, C, Rw, p, dir, 0);
        core(m, C, Rw, true);
        tilePass(m, m.T, C, Rw, p, 0.52, 1, dir);
      }
      if (mo.flash) {
        var f = Math.exp(-Math.pow((p - 0.5) / 0.022, 2));
        if (f > 0.01) {
          var g = ctx.createRadialGradient(C[0], C[1], 0, C[0], C[1], R * 7);
          g.addColorStop(0, 'rgba(255,255,255,' + f + ')'); g.addColorStop(0.15, rgba(m.disk[0], f * 0.7)); g.addColorStop(1, rgba(m.disk[1], 0));
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(C[0] - R * 7, C[1] - R * 7, R * 14, R * 14); ctx.globalCompositeOperation = 'source-over';
        }
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
      S.tiles = tiles(S, this.o.tile, 3); T.tiles = tiles(T, this.o.tile, 5);
      S.red = tinted(S.tex, '#ff2a10', 0.85); T.blue = tinted(T.tex, '#cfe9ff', 0.85);
      var dc = (this.o.diskColors && this.o.diskColors.length ? this.o.diskColors : DEFAULTS.diskColors).map(rgbOf);
      while (dc.length < 4) dc.push(dc[dc.length - 1]);
      this.S = S; this.T = T; this.disk = dc; this.built = true; return true;
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
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BlackHoleMorph = api;
})(typeof window !== 'undefined' ? window : this);
