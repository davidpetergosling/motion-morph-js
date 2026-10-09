/*!
 * OrigamiMorph v1.2 — scroll-driven paper-plane morphs between DOM content. Canvas 2D, no dependencies.
 *
 *   const om = OrigamiMorph.create({ color: '#ece6d6' });
 *   om.scroll({ from: '#a .card', to: '#b .card' });                       // scroll-scrubbed
 *   om.scroll({ from: '#s1 h2', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });
 *   const m = om.morph({ from: x, to: y }); m.progress(0.5);                // manual control
 *   om.play({ from: x, to: y, duration: 2600 });                            // timed, returns a Promise
 *
 * The source element becomes a sheet of paper and folds into a classic dart — corners to centre,
 * edges to centre, keel, wings — flies an arc across the viewport, and unfolds as the target.
 * By default the plane is plain paper on both sides; set content: true to keep the element printed on it.
 * Real content is hidden while the morph runs. Per-morph specs accept any option to override defaults.
 */
(function (root) {
  'use strict';
  var PI = Math.PI;
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
    color: '#ece6d6',         // paper colour (both sides, or the reverse when content is shown)
    content: false,           // keep the element's content printed on the paper
    paper: 'auto',            // sheet colour behind content; 'auto' = element background, or '#f5f2ea' when transparent
    pad: 'auto',              // margin of paper around content; 'auto' = 20px when the element has no background
    scale: 1,                 // plane size in flight, relative to the folded sheet
    keel: 0.13,               // keel depth as a fraction of sheet height
    dihedral: 8,              // wing tilt in degrees
    arc: 0.5,                 // flight arc height (0–1, fraction of distance / viewport)
    roll: 0.3,                // bank sway while flying (0–1)
    rolls: 0,                 // full barrel rolls during flight
    loops: 0,                 // loop-the-loops during flight
    loopSize: 1,              // loop radius multiplier
    meander: 0,               // sine-wave weaves across the flight path (cycles)
    meanderSize: 60,          // meander amplitude, px
    wobble: 0,                // cosine roll wobble about the length axis (cycles)
    wobbleAngle: 20,          // wobble amplitude, degrees
    lift: 60,                 // px the paper rises toward the viewer while folding
    shade: 0.7,               // facet shading strength (0–1)
    grain: 0.35,              // paper grain strength (0–1)
    creases: true,            // draw crease lines
    crease: 'rgba(0,0,0,.22)',// crease colour
    shadow: true,             // drop shadow while lifted
    perspective: 1100,        // px
    ease: 'inOut',            // per-fold ease
    maxDpr: 2,
    zIndex: 45,
    hideContent: true,        // hide real from/to content while the morph runs
    keepInView: true,         // clamp the flight into the viewport (scroll layouts where the target is still off-screen)
    respectReducedMotion: true
  };

  // Dart fold sequence, nose at the right edge: corners to centre, then the new edges to centre.
  // Each fold: [lineA, lineB, pointOnMovingSide, sign] — sign +1 folds toward the viewer.
  function dart(k, W, H) {
    var c = H / 2, x2 = W - c / Math.tan(PI / 8);
    return [[[W, c], [W - c, 0], [W, 0], 1], [[W, c], [W - c, H], [W, H], 1], [[W, c], [x2, 0], [W - c, 0], 1], [[W, c], [x2, H], [W - c, H], 1]][k] || null;
  }

  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function isClear(c) {
    if (!c || c === 'transparent') return true;
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return false;
    var p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 && parseFloat(p[3]) === 0;
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); if (r && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); }
  function area(P) { var a = 0; for (var i = 0, n = P.length; i < n; i++) { var p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

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
  function snapshot(el, o) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el), clear = isClear(cs.backgroundColor);
    var pad = o.pad === 'auto' ? (clear ? 20 : 0) : +o.pad || 0, W = r.width + pad * 2, H = r.height + pad * 2;
    if (W < 4 || H < 4) return null;
    var ts = Math.min(root.devicePixelRatio || 1, o.maxDpr), c = mkCanvas(W * ts, H * ts), g = c.getContext('2d');
    g.scale(ts, ts);
    g.fillStyle = o.paper === 'auto' ? (clear ? '#f5f2ea' : cs.backgroundColor) : o.paper; g.fillRect(0, 0, W, H);
    g.translate(pad - r.left, pad - r.top); paint(g, el);
    return { el: el, tex: c, W: W, H: H, pad: pad, ox: r.left - pad, oy: r.top - pad };
  }

  // ── Fold planning: sequential straight folds of a flat sheet. Facets are split along each line;
  // each leaf remembers which folds move it, and paint order is tracked per fold.
  function split(f, s) {
    var P = { uv: [], w: [], moves: f.moves.slice() }, N = { uv: [], w: [], moves: f.moves.slice() }, n = s.length;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, si = s[i], sj = s[j];
      if (si >= 0) { P.uv.push(f.uv[i]); P.w.push(f.w[i]); }
      if (si <= 0) { N.uv.push(f.uv[i]); N.w.push(f.w[i]); }
      if ((si > 0 && sj < 0) || (si < 0 && sj > 0)) {
        var t = si / (si - sj), u = [lerp(f.uv[i][0], f.uv[j][0], t), lerp(f.uv[i][1], f.uv[j][1], t)], w = [lerp(f.w[i][0], f.w[j][0], t), lerp(f.w[i][1], f.w[j][1], t)];
        P.uv.push(u); P.w.push(w); N.uv.push(u); N.w.push(w);
      }
    }
    return [P, N];
  }
  function expand(order) { var out = []; order.forEach(function (f) { if (f.kids) out.push.apply(out, expand(f.kids)); else out.push(f); }); return out; }
  function plan(sh, o) {
    var W = sh.W, H = sh.H, rootF = { uv: [[0, 0], [W, 0], [W, H], [0, H]], w: [[0, 0], [W, 0], [W, H], [0, H]], moves: [] };
    var leaves = [rootF], folds = [], orders = [[rootF]];
    for (var k = 0; k < 8; k++) {
      var spec = dart(k, W, H); if (!spec) break;
      var A = spec[0], B = spec[1], M = spec[2], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L; var nx = -dy, ny = dx;
      if ((M[0] - A[0]) * nx + (M[1] - A[1]) * ny < 0) { dx = -dx; dy = -dy; nx = -nx; ny = -ny; }
      var F = { ax: A[0], ay: A[1], dx: dx, dy: dy, nx: nx, ny: ny, sign: spec[3] < 0 ? -1 : 1 }, next = [];
      leaves.forEach(function (f) {
        var s = f.w.map(function (p) { return (p[0] - F.ax) * nx + (p[1] - F.ay) * ny; });
        var mn = Math.min.apply(null, s), mx = Math.max.apply(null, s);
        if (mn >= -0.01) { f.moves[k] = 1; next.push(f); }
        else if (mx <= 0.01) { f.moves[k] = 0; next.push(f); }
        else { var parts = split(f, s); parts[0].moves[k] = 1; parts[1].moves[k] = 0; f.kids = parts; next.push(parts[0], parts[1]); }
      });
      next.forEach(function (f) { if (f.moves[k]) f.w = f.w.map(function (p) { var s = (p[0] - F.ax) * nx + (p[1] - F.ay) * ny; return [p[0] - 2 * s * nx, p[1] - 2 * s * ny]; }); });
      var prev = expand(orders[orders.length - 1]);
      var stat = prev.filter(function (f) { return !f.moves[k]; }), mov = prev.filter(function (f) { return f.moves[k]; }).reverse();
      orders.push(F.sign > 0 ? stat.concat(mov) : mov.concat(stat));
      folds.push(F); leaves = next;
    }
    var K = folds.length;
    leaves.forEach(function (f) { for (var j = 0; j < K; j++) f.moves[j] = f.moves[j] || 0; });
    // Split along keel / wing lines so the folded sheet can bend in 3D.
    var kd = H * o.keel;
    [H / 2 - kd, H / 2, H / 2 + kd].forEach(function (Y) {
      var out = [];
      leaves.forEach(function (f) {
        var s = f.w.map(function (p) { return p[1] - Y; }), mn = Math.min.apply(null, s), mx = Math.max.apply(null, s);
        if (mn < -0.01 && mx > 0.01) { f.kids = split(f, s); out.push(f.kids[0], f.kids[1]); } else out.push(f);
      });
      leaves = out;
    });
    return { leaves: leaves, folds: folds, orders: orders.map(expand), cx: W / 2, cy: H / 2, k: kd };
  }
  function rot3(p, F, phi) {
    var rx = p[0] - F.ax, ry = p[1] - F.ay, t = rx * F.dx + ry * F.dy, s = rx * F.nx + ry * F.ny, z = p[2], c = Math.cos(phi), sn = Math.sin(phi);
    var s2 = s * c - z * sn, z2 = s * sn + z * c;
    return [F.ax + t * F.dx + s2 * F.nx, F.ay + t * F.dy + s2 * F.ny, z2];
  }
  function orderAt(pl, k, fr) {
    var K = pl.folds.length; if (k >= K) return pl.orders[K];
    var base = pl.orders[k]; if (!fr) return base;
    var stat = base.filter(function (f) { return !f.moves[k]; }), mov = base.filter(function (f) { return f.moves[k]; });
    if (fr > 0.5) mov.reverse();
    return pl.folds[k].sign > 0 ? stat.concat(mov) : mov.concat(stat);
  }

  function create(opts) {
    var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in opts || {}) o[k] = opts[k];
    var reduced = o.respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(root.devicePixelRatio || 1, o.maxDpr), VW = 0, VH = 0, shown = false, morphs = [], scrolled = [], ticking = false;
    var cv, ctx, grainPat, O = o;
    var LX = -0.38, LY = -0.52, LZ = 0.76, LL = Math.hypot(LX, LY, LZ); LX /= LL; LY /= LL; LZ /= LL;

    function ensureLayer() {
      if (cv) return;
      cv = mkCanvas(1, 1); cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;z-index:' + o.zIndex;
      document.body.appendChild(cv); ctx = cv.getContext('2d');
      var gc = mkCanvas(128, 128), gg = gc.getContext('2d'), id = gg.createImageData(128, 128), s = 3;
      for (var i = 0; i < id.data.length; i += 4) { s = (s * 16807) % 2147483647; var v = 128 + (s / 2147483647 - .5) * 110; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      gg.putImageData(id, 0, 0); grainPat = ctx.createPattern(gc, 'repeat');
      resize();
    }
    function resize() { VW = innerWidth; VH = innerHeight; if (cv) { cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr); } }

    function project(p, cx, cy) { var z = Math.min(p[2], O.perspective * 0.85), s = O.perspective / (O.perspective - z); return [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s]; }
    function shadeOf(p3) {
      var a = p3[0], b = p3[1], c = p3[2], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      return (nx * LX + ny * LY + nz * LZ) / l - LZ;
    }
    function polyPath(pr, grow) {
      var cx = 0, cy = 0, n = pr.length, i; for (i = 0; i < n; i++) { cx += pr[i][0]; cy += pr[i][1]; } cx /= n; cy /= n;
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        var x = pr[i][0], y = pr[i][1];
        if (grow) { var dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; x += dx / l * grow; y += dy / l * grow; }
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    function affine(u0, u1, u2, p0, p1, p2) {
      var du1 = u1[0] - u0[0], dv1 = u1[1] - u0[1], du2 = u2[0] - u0[0], dv2 = u2[1] - u0[1], det = du1 * dv2 - du2 * dv1; if (Math.abs(det) < 1e-6) return null;
      var dx1 = p1[0] - p0[0], dy1 = p1[1] - p0[1], dx2 = p2[0] - p0[0], dy2 = p2[1] - p0[1];
      var a = (dx1 * dv2 - dx2 * dv1) / det, b = (dy1 * dv2 - dy2 * dv1) / det, c = (dx2 * du1 - dx1 * du2) / det, d = (dy2 * du1 - dy1 * du2) / det;
      return [a, b, c, d, p0[0] - a * u0[0] - c * u0[1], p0[1] - b * u0[0] - d * u0[1]];
    }
    // One paper facet. Front shows the content texture at texA opacity over plain paper; the reverse is plain paper.
    function face(sh, uv, p3, cx, cy, alpha, texA, crease) {
      var pr = p3.map(function (p) { return project(p, cx, cy); }), a2 = area(pr);
      if (Math.abs(a2) < 0.4) return;
      var front = (a2 > 0) === (area(uv) > 0), n = uv.length, M = affine(uv[0], uv[1], uv[n - 1], pr[0], pr[1], pr[n - 1]); if (!M) return;
      var iw = sh.W, ih = sh.H;
      ctx.save(); polyPath(pr, 0.6); ctx.clip(); ctx.globalAlpha = alpha;
      ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      if (!front || texA < 1) { ctx.fillStyle = O.color; ctx.fillRect(-2, -2, iw + 4, ih + 4); }
      if (front && texA > 0) { ctx.globalAlpha = alpha * texA; ctx.drawImage(sh.tex, 0, 0, iw, ih); }
      if (O.grain > 0) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = alpha * O.grain * 0.6; ctx.fillStyle = grainPat; ctx.fillRect(0, 0, iw, ih); ctx.globalCompositeOperation = 'source-over'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sd = shadeOf(p3) * O.shade;
      if (Math.abs(sd) > 0.005) { ctx.globalAlpha = alpha * Math.min(0.85, sd < 0 ? -sd * 1.1 : sd * 0.7); ctx.fillStyle = sd < 0 ? '#000' : '#fff'; ctx.fillRect(0, 0, VW, VH); }
      ctx.restore();
      if (crease && O.creases) { ctx.globalAlpha = alpha * crease; ctx.strokeStyle = O.crease; ctx.lineWidth = 1; polyPath(pr, 0); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    function shadow(list, lift, alpha) {
      if (!O.shadow || !list.length || lift <= 1) return;
      ctx.save(); ctx.filter = 'blur(10px)'; ctx.fillStyle = '#000'; ctx.beginPath();
      list.forEach(function (pr) { pr.forEach(function (p, i) { var x = p[0] + lift * 0.25, y = p[1] + lift * 0.55; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); });
      ctx.globalAlpha = alpha * Math.min(0.5, lift / 160); ctx.fill(); ctx.restore();
    }
    function origin(sh) { var r = sh.el.getBoundingClientRect(); sh.ox = r.left - sh.pad; sh.oy = r.top - sh.pad; }

    // Flat folding stage. F: 0 = flat sheet, 1 = all dart folds done.
    function drawFolds(sh, pl, F, lift, texA, ease) {
      var K = pl.folds.length, x = clamp(F) * K, k = Math.min(K, Math.floor(x)), fr = k >= K ? 0 : ease(x - k);
      var cx = sh.ox + pl.cx, cy = sh.oy + pl.cy, items = orderAt(pl, k, fr).map(function (lf) {
        return { lf: lf, p3: lf.uv.map(function (uv) {
          var p = [uv[0], uv[1], 0];
          for (var j = 0; j <= Math.min(k, K - 1); j++) if (lf.moves[j]) { var th = j < k ? PI : PI * fr; if (th) p = rot3(p, pl.folds[j], pl.folds[j].sign * th); }
          return [sh.ox + p[0], sh.oy + p[1], p[2] + lift];
        }) };
      });
      shadow(items.map(function (it) { return it.p3.map(function (p) { return project(p, cx, cy); }); }), lift, 1);
      var cr = Math.min(1, F * 6);
      items.forEach(function (it) { face(sh, it.lf.uv, it.p3, cx, cy, 1, texA, cr); });
    }
    // Folded dart in 3D. phi: 0 = flat, 1 = keel down + wings out. blend: 0 = sheet orientation, 1 = flight pose.
    function drawPlane(sh, pl, phi, blend, cx, cy, scale, lift, t, tx, ty, alpha, texA) {
      if (alpha <= 0 || scale <= 0.001) return;
      var H = sh.H, k = pl.k, ang = phi * PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), dh = (O.dihedral || 0) * PI / 180 * phi, cd = Math.cos(dh), sd = Math.sin(dh);
      var wob = O.wobble ? (O.wobbleAngle || 0) * PI / 180 * Math.cos(t * 2 * PI * O.wobble) : 0;
      var rx = lerp(PI / 2, 1.0 + Math.sin(t * PI * 3) * O.roll + wob + Math.round(O.rolls) * 2 * PI * EASE.inOut(t), blend), rz = Math.atan2(-ty, tx);
      rz *= blend;
      var cX = Math.cos(rx), sX = Math.sin(rx), cZ = Math.cos(rz), sZ = Math.sin(rz);
      // Paint order: the four surface regions (keel / wing, each side) are sorted by depth; inside a region
      // the paper layers keep their stack order, flipped when that region faces away from the viewer.
      var regions = [[], [], [], []];
      pl.orders[pl.folds.length].forEach(function (lf, i) {
        var my = lf.w.reduce(function (a, w) { return a + w[1]; }, 0) / lf.w.length - H / 2, sg = my < 0 ? -1 : 1, keel = Math.abs(my) <= k;
        var p3 = lf.w.map(function (w) {
          var d = w[1] - H / 2, sg = d < 0 ? -1 : 1, s = Math.abs(d), Y, Z;
          if (s <= k) { Y = sg * s * ca; Z = s * sa; } else { Y = sg * (k * ca + (s - k) * cd); Z = k * sa - (s - k) * sd; }
          var x = w[0] - pl.cx, y = Z, z = Y;
          var y1 = y * cX - z * sX, z1 = y * sX + z * cX, x3 = x * cZ - y1 * sZ, y3 = x * sZ + y1 * cZ;
          return [cx + x3 * scale, cy - y3 * scale, z1 * scale + lift];
        });
        regions[(sg < 0 ? 0 : 2) + (keel ? 0 : 1)].push({ lf: lf, p3: p3, sg: sg, keel: keel });
      });
      var items = [];
      regions.filter(function (r) { return r.length; }).map(function (r) {
        var sg = r[0].sg, nY, nZ, z = 0, n = 0;
        if (r[0].keel) { nY = -sg * sa; nZ = ca; } else { nY = sg * sd; nZ = cd; }
        r.forEach(function (it) { it.p3.forEach(function (p) { z += p[2]; n++; }); });
        return { list: (nZ * sX + nY * cX) >= 0 ? r : r.slice().reverse(), z: z / n };
      }).sort(function (a, b) { return a.z - b.z; }).forEach(function (r) { items.push.apply(items, r.list); });
      shadow(items.map(function (it) { return it.p3.map(function (p) { return project(p, cx, cy); }); }), lift, alpha);
      items.forEach(function (it) { face(sh, it.lf.uv, it.p3, cx, cy, alpha, texA, 1); });
    }
    function flightPath(P0, P1) {
      var dx = P1[0] - P0[0], dy = P1[1] - P0[1], d = Math.hypot(dx, dy), px = 0, py = -1;
      if (d > 1) { px = -dy / d; py = dx / d; if (py > 0) { px = -px; py = -py; } }
      var h = O.arc * Math.max(d * 0.6, VH * 0.35), C = [(P0[0] + P1[0]) / 2 + px * h, (P0[1] + P1[1]) / 2 + py * h];
      var bp = function (t) { var u = 1 - t; return [u * u * P0[0] + 2 * u * t * C[0] + t * t * P1[0], u * u * P0[1] + 2 * u * t * C[1] + t * t * P1[1]]; };
      var bt = function (t) { var u = 1 - t; return [2 * u * (C[0] - P0[0]) + 2 * t * (P1[0] - C[0]), 2 * u * (C[1] - P0[1]) + 2 * t * (P1[1] - C[1])]; };
      var n = Math.max(0, Math.round(O.loops || 0)), R = Math.max(50, Math.min(VW, VH) * 0.12) * O.loopSize, mW = O.meander || 0, mA = O.meanderSize || 0;
      // Time is shared by distance so the plane holds a constant speed: each loop gets 2πR of path, the arc (with meander) its own length.
      var baseLen = 0, prev = null;
      for (var i = 0; i <= 96; i++) { var q = basePos(i / 96); if (prev) baseLen += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
      baseLen = Math.max(baseLen, 1);
      var loopLen = 2 * PI * R, total = baseLen + n * loopLen, Lw = n ? loopLen / total : 0, free = 1 - n * Lw, seg = free / (n + 1);
      function basePos(s) {
        var b = bp(s), g = bt(s), l = Math.hypot(g[0], g[1]) || 1, Tx = g[0] / l, Ty = g[1] / l, Nx = Ty, Ny = -Tx;
        if (Ny > 0 || (Ny === 0 && Nx > 0)) { Nx = -Nx; Ny = -Ny; }
        var x = b[0], y = b[1];
        if (mW && mA) { var off = mA * Math.sin(2 * PI * mW * s) * Math.sin(PI * s); x += Nx * off; y += Ny * off; }
        return [x, y, Tx, Ty, Nx, Ny];
      }
      // Loops freeze progress along the arc while the plane flies a full circle, pitching toward "up".
      function remap(t) {
        if (!n) return [t, -1];
        for (var i = 0; i < n; i++) { var a0 = seg * (i + 1) + Lw * i; if (t < a0) return [(t - Lw * i) / free, -1]; if (t < a0 + Lw) return [seg * (i + 1) / free, (t - a0) / Lw]; }
        return [(t - Lw * n) / free, -1];
      }
      function pos(t) {
        var r = remap(t), B = basePos(clamp(r[0])), x = B[0], y = B[1], Tx = B[2], Ty = B[3], Nx = B[4], Ny = B[5];
        if (r[1] >= 0) { var an = 2 * PI * r[1], fw = R * Math.sin(an), up = R * (1 - Math.cos(an)); x += Tx * fw + Nx * up; y += Ty * fw + Ny * up; }
        return [x, y];
      }
      var fn = function (t) {
        var p = pos(t), e = 0.0015, p0 = pos(Math.max(0, t - e)), p1 = pos(Math.min(1, t + e));
        return { x: p[0], y: p[1], tx: p1[0] - p0[0], ty: p1[1] - p0[1] };
      };
      fn.ratio = total / Math.max(Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) * 1.15, VH * 0.5, 1);
      return fn;
    }

    function Morph(spec) {
      this.spec = spec; this.p = 0;
      this.o = {}; for (var k in o) this.o[k] = spec[k] !== undefined ? spec[k] : o[k];
      this.fromEls = $(spec.from); this.toEls = $(spec.to);
      this.ease = typeof this.o.ease === 'function' ? this.o.ease : EASE[this.o.ease] || EASE.inOut;
    }
    Morph.prototype.build = function () {
      ensureLayer(); O = this.o;
      var S = this.fromEls[0] && snapshot(this.fromEls[0], this.o), T = this.toEls[0] && snapshot(this.toEls[0], this.o);
      if (!S || !T) return false;
      this.S = S; this.T = T; this.Sp = plan(S, this.o); this.Tp = plan(T, this.o);
      this.built = true; return true;
    };
    Morph.prototype.invalidate = function () { this.built = false; };
    // Progress points where the plane is fully folded and where it touches down — for syncing to scroll.
    Morph.prototype.phases = function () { return this.phase || { fold: 0.38, land: 0.62 }; };
    Morph.prototype.fades = function (p) {
      var a = '', b = '';
      if (this.o.hideContent) { a = p <= 0 ? '' : '0'; b = p >= 1 ? '' : '0'; if (reduced) { a = p < .5 ? '' : '0'; b = p < .5 ? '0' : ''; } }
      this.fromEls.forEach(function (e) { e.style.opacity = a; });
      this.toEls.forEach(function (e) { e.style.opacity = b; });
      if (this.spec.onProgress) this.spec.onProgress(p);
    };
    Morph.prototype.progress = function (p) { if (p === undefined) return this.p; this.p = clamp(p); this.fades(this.p); this.manual = true; schedule(); return this; };
    Morph.prototype.destroy = function () { if (this.st) { this.st.kill(); this.st = null; } this.o.hideContent = false; this.fades(0); morphs.splice(morphs.indexOf(this), 1); var i = scrolled.indexOf(this); if (i > -1) scrolled.splice(i, 1); schedule(); };

    function draw(m, p) {
      O = m.o; var S = m.S, T = m.T, Sp = m.Sp, Tp = m.Tp, ease = m.ease, L = O.lift, sc = O.scale; origin(S); origin(T);
      var P0 = [S.ox + Sp.cx, S.oy + Sp.cy], P1 = [T.ox + Tp.cx, T.oy + Tp.cy], q, k, e;
      // Phase lengths come from the true distance; the flight itself is clamped into the viewport so the plane never leaves the screen.
      var ratio = flightPath(P0, P1).ratio;
      if (O.keepInView) {
        // Margin covers the plane's own half-length (it can point along either axis), capped so a huge sheet still fits.
        var ext = Math.max(S.W, T.W) * sc * 0.5 + 16, mx = Math.min(VW * 0.45, Math.max(Math.min(VW, VH) * 0.14, ext)), my = Math.min(VH * 0.45, Math.max(Math.min(VW, VH) * 0.14, ext));
        var cl = function (P) { return [Math.max(mx, Math.min(VW - mx, P[0])), Math.max(my, Math.min(VH - my, P[1]))]; };
        P0 = cl(P0); P1 = cl(P1);
      }
      var path = flightPath(P0, P1);
      var flatTex = function (F) { return O.content ? 1 : 1 - clamp(F * 3); }, planeTex = O.content ? 1 : 0;
      var fl = Math.min(0.72, Math.max(0.24, 0.24 * ratio)), c2 = (1 - fl) / 2, c1 = c2 * 0.79, d1 = c2 + fl, d2 = d1 + (c2 - c1);
      m.phase = { fold: c2, land: d1 };
      if (p < c1) { e = p / c1; drawFolds(S, Sp, e, L * EASE.out(e), flatTex(e), ease); }
      else if (p < c2) { k = EASE.inOut((p - c1) / (c2 - c1)); q = path(0); drawPlane(S, Sp, k, k, P0[0], P0[1], lerp(1, sc, k), L * (1 + k * .5), 0, q.tx, q.ty, 1, planeTex); }
      else if (p < d1) {
        var t = (p - c2) / (d1 - c2), tq = lerp(t, EASE.sine(t), 0.35), r = T.W / S.W, fT = EASE.sine(clamp((tq - 0.4) / 0.2)), lf = L * (1.5 + Math.sin(PI * t)); q = path(tq);
        drawPlane(S, Sp, 1, 1, q.x, q.y, sc * lerp(1, r, tq), lf, t, q.tx, q.ty, 1 - fT, planeTex);
        drawPlane(T, Tp, 1, 1, q.x, q.y, sc * lerp(1 / r, 1, tq), lf, t, q.tx, q.ty, fT, planeTex);
      } else if (p < d2) { k = 1 - EASE.inOut((p - d1) / (d2 - d1)); q = path(1); drawPlane(T, Tp, k, k, P1[0], P1[1], lerp(1, sc, k), L * (1 + k * .5), 1, q.tx, q.ty, 1, planeTex); }
      else { e = (1 - p) / (1 - d2); drawFolds(T, Tp, e, L * EASE.out(e), flatTex(e), ease); }
    }

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
      act.forEach(function (m) { ctx.save(); draw(m, m.p); ctx.restore(); });
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

  var api = { create: create, version: '1.2.0' };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.OrigamiMorph = api;
})(typeof window !== 'undefined' ? window : this);
