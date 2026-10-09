# MotionMorphJs

Scroll-driven morph effects that move content from one DOM element to another. Each effect is a single file with no dependencies. Drop it in with a `<script>` tag and it works in any modern browser.

| Effect | File | What it does |
| --- | --- | --- |
| **ParticleMorph** | [effects/particle-morph.js](effects/particle-morph.js) | Samples real text, images and outlines at their layout positions, then flies thousands of glowing dots from one element into another. |
| **OrigamiMorph** | [effects/origami-morph.js](effects/origami-morph.js) | Turns an element into a sheet of paper, folds it into a paper plane, flies it across the viewport and unfolds it as the next element. |
| **BurnMorph** | [effects/burn-morph.js](effects/burn-morph.js) | A glowing front burns the source away, throwing off embers that drift across and ignite the target. |
| **BlackHoleMorph** | [effects/blackhole-morph.js](effects/blackhole-morph.js) | The source breaks into tiles that spiral into a black hole. It collapses in a flash, and a white hole throws the target back out. |
| **PortalMorph** | [effects/portal-morph.js](effects/portal-morph.js) | The source sinks through a portal into the void, and the target steps out of a second portal. |
| **WaterMorph** | [effects/water-morph.js](effects/water-morph.js) | The source melts into liquid drops that flow across and fill the target, which ripples as it settles. |

Every effect can be scrubbed by scroll, run on a timer, or driven by hand, and respects `prefers-reduced-motion` by default.

**[▶ Live demos](https://davidpetergosling.github.io/motion-morph-js/)**

## Quick start

```html
<script src="effects/particle-morph.js"></script>
<script>
  const pm = ParticleMorph.create({ colorMode: 'blend', motion: 'swirl' });
  pm.scroll({ from: '#intro h2', to: '#features h2' });
</script>
```

```html
<script src="effects/origami-morph.js"></script>
<script>
  const om = OrigamiMorph.create({ color: '#ece6d6' });
  om.scroll({ from: '#a .card', to: '#b .card' });
</script>
```

The other effects work the same way:

```js
BurnMorph.create({ origin: 'bottom' }).scroll({ from: '#a h2', to: '#b h2' });
BlackHoleMorph.create({ spin: 1.2 }).scroll({ from: '#a h2', to: '#b h2' });
PortalMorph.create({ style: 'ring', color: '#00f0ff' }).scroll({ from: '#a .card', to: '#b .card' });
WaterMorph.create({ color: 'source', path: 'arc' }).scroll({ from: '#a .card', to: '#b .card' });
```

Each library sets a global named after the effect (for example `BurnMorph`) and also exports via `module.exports` when it is loaded in a CommonJS environment.

## API

All the effects share the same API:

| Call | Description |
| --- | --- |
| `X.create(options)` | Creates an instance. Its options become the defaults for every morph it runs. |
| `inst.scroll({ from, to, trigger, edge, start, end })` | A morph scrubbed by scroll. `trigger` defaults to `to`, and `edge` is `'top'` (default) or `'bottom'`. `start` and `end` are viewport fractions for where that edge sits (defaults `0.95` → `0.35`). |
| `inst.morph({ from, to })` | A morph you control by hand. Call `.progress(p)` on the returned morph with `p` from 0 to 1. |
| `inst.play({ from, to, duration, delay })` | A timed morph that returns a Promise. With ParticleMorph you can leave out `from` and the dots gather from `scatter`, which suits a page-load intro. |
| `inst.refresh()` | Re-measures and re-samples after layout changes. |
| `inst.destroy()` | Removes the canvas layers and listeners and restores the content. |

`from`, `to` and `trigger` take a selector, an element or a list of elements. Any option can also go in a single morph's spec to override the instance default.

```js
// Start only once the bottom of #s1 has risen past 2/3 of the viewport
pm.scroll({ from: '#s1', to: '#s2 h2', trigger: '#s1', edge: 'bottom', start: .667, end: .2 });

// Page-load intro
await pm.play({ to: '#hero', duration: 3000, scatter: 'viewport' });
```

## Options

### ParticleMorph

| Option | Default | Notes |
| --- | --- | --- |
| `count` | `null` | Number of dots per morph. `null` means 1700 on desktop and 750 on small screens. |
| `colorMode` | `'palette'` | `'palette'` \| `'source'` \| `'target'` \| `'blend'` |
| `colors` | `['#9184d9', '#f2f0ff', '#c9c2f0']` | The colours used in `palette` mode. |
| `brighten` | `0.15` | Lifts sampled colours toward white (0–1). |
| `motion` | `'swirl'` | `'swirl'` \| `'vortex'` \| `'galaxy'` \| `'explode'` \| `'wave'` \| `'drift'` \| `'direct'` \| `function(q)` |
| `direction` | `'cw'` | `'cw'` \| `'ccw'` \| `'alternate'` |
| `center` | `'between'` | `'between'` \| `'viewport'` \| `[fx, fy]` |
| `swirl` / `wobble` / `stagger` | `1.1` / `160` / `0.22` | Rotation strength, orbit radius in px, and how spread out the departures are. |
| `ease` | `'inOut'` | `'inOut'` \| `'out'` \| `'in'` \| `'linear'` \| `'expo'` \| `function(t)` |
| `step` / `imageStep` | `3` / `4` | Sampling grid in px for text and outlines, and for images. |
| `size` | `2.6` | Base dot size in px. |
| `glow` / `nebula` | `true` / `true` | Turns on additive glow sprites and a rotating conic backlight. |
| `outlines` | `''` | A selector for boxes to trace (for example `'.btn'`). |
| `fadeFrom` / `fadeTo` | `[0, .32]` / `[.78, .92]` | The progress windows where the real content fades out and back in. |
| `hideTarget` | `true` | Keeps the target hidden until the morph starts. |
| `scatter` | `'viewport'` | Where the dots start when there is no `from`: `'viewport'` \| `'center'` \| `'edges'` \| `'ring'` |
| `maxDpr` / `zIndex` / `respectReducedMotion` | `1.5` / `45` / `true` | |

To write a custom `motion`, pass a function that changes `q.x` / `q.y`. It receives the eased position, its start and end points, `e` (eased progress), `s` (a 0→1→0 bell curve), the centre `cx`/`cy`, and per-dot random values `a`, `r` and `d`. The built-in motions are available as `ParticleMorph.motions`.

### OrigamiMorph

| Option | Default | Notes |
| --- | --- | --- |
| `color` | `'#ece6d6'` | Paper colour. |
| `content` | `false` | Keeps the element's content printed on the paper. |
| `paper` / `pad` | `'auto'` / `'auto'` | The sheet colour and margin around the content. |
| `scale` | `1` | Plane size in flight. |
| `keel` / `dihedral` | `0.13` / `8` | Keel depth (as a fraction of the sheet) and wing tilt in degrees. |
| `arc` / `roll` | `0.5` / `0.3` | Height of the flight arc and how much the plane banks. |
| `rolls` / `loops` / `loopSize` | `0` / `0` / `1` | Barrel rolls and loop-the-loops. |
| `meander` / `meanderSize` | `0` / `60` | A sine-wave weave across the flight path. |
| `wobble` / `wobbleAngle` | `0` / `20` | Roll wobble around the plane's length. |
| `lift` | `60` | How many px the paper rises toward the viewer while folding. |
| `shade` / `grain` | `0.7` / `0.35` | Facet shading and paper texture. |
| `creases` / `crease` | `true` / `'rgba(0,0,0,.22)'` | Crease lines and their colour. |
| `shadow` / `perspective` | `true` / `1100` | |
| `ease` | `'inOut'` | `'inOut'` \| `'out'` \| `'in'` \| `'linear'` \| `'sine'` |
| `hideContent` | `true` | Hides the real content while the morph runs. |
| `keepInView` | `true` | Keeps the flight path inside the viewport. |
| `maxDpr` / `zIndex` / `respectReducedMotion` | `2` / `45` / `true` | |

### Options shared by the newer effects

BurnMorph, BlackHoleMorph, PortalMorph and WaterMorph also take these options:

| Option | Default | Notes |
| --- | --- | --- |
| `pad` | `4`–`8` | px of margin captured around each element. |
| `maxPixels` | varies | Pixel budget for each element's snapshot. Lower it to speed up very large elements. |
| `hideContent` | `true` | Hides the real content while the morph runs. |
| `maxDpr` / `zIndex` / `respectReducedMotion` | `2` / `45` / `true` | With reduced motion turned on, the effect becomes a simple crossfade. |

### BurnMorph

| Option | Default | Notes |
| --- | --- | --- |
| `origin` | `'bottom'` | Where the burn starts: `'bottom'` \| `'top'` \| `'left'` \| `'right'` \| `'edges'` \| `'center'` \| `[fx, fy]` (fractions of the element) |
| `roughness` / `noiseScale` | `0.45` / `1` | How ragged the burn front is (0 is a straight line), and the size of its blotches. |
| `edge` / `char` | `0.06` / `0.08` | Width of the glowing front, and of the charred band ahead of it. |
| `colors` | `['#fff6c2', '#ffc04a', '#ff6a1a', '#b3240b']` | Ember colours, hottest to coolest. |
| `glow` / `smoke` | `true` / `true` | Soft halo around the front, and smoke puffs. |
| `embers` / `emberSize` / `rise` | `260` / `2.2` / `120` | Ember count, ember size in px, and how far embers float up before travelling. |
| `reveal` | `'ignite'` | How the target appears: `'ignite'` (it burns in and cools) \| `'fade'` |
| `ease` | `'inOut'` | Ember flight ease. |

If the source or target contains a cross-origin image, the browser won't let BurnMorph read its pixels. In that case it falls back to a crossfade.

### BlackHoleMorph

| Option | Default | Notes |
| --- | --- | --- |
| `size` | `'auto'` | Radius of the black hole in px. `'auto'` is 6% of the smaller side of the viewport (28–72px). |
| `position` | `'between'` | Where the hole opens: `'between'` (midway between the two elements) \| `'viewport'` \| `[fx, fy]` |
| `spin` / `direction` | `1.2` / `'cw'` | Turns each tile makes as it falls in, and which way it turns. |
| `stretch` | `2.5` | How far tiles stretch out along their path near the hole. |
| `tile` / `stagger` | `10` / `0.5` | Tile size in px, and how spread out the departures are (nearest tiles go first). |
| `diskColors` / `tilt` | `['#fff4d6', '#ffb347', '#ff4f1a', '#7a1cff']` / `0.28` | Colours of the glowing ring around the hole (inner to outer), and how flat it looks. |
| `redshift` / `blueshift` | `0.7` / `0.5` | How strongly tiles turn red as they fall in, and blue-white as they come out. |
| `flash` | `true` | A flash when the hole collapses. |
| `ease` | `'in'` | Fall ease. Tiles coming out play it in reverse. |

### PortalMorph

| Option | Default | Notes |
| --- | --- | --- |
| `style` | `'sparks'` | `'sparks'` (a spinning ring of sparks) \| `'ring'` (a clean neon ring) \| `'rift'` (a jagged tear) |
| `color` / `voidColor` | `'#ff9a2e'` / `'#05050a'` | Portal colour, and the colour seen through it. |
| `size` / `tilt` | `1` / `0` | Portal size relative to the element, and how flat it lies (0 is facing you). |
| `sparks` / `spin` / `direction` | `140` / `1` / `'cw'` | Sparks per portal, how fast they rotate, and which way. |
| `twist` | `0.7` | How far the content turns, in radians, as it sinks and emerges. |
| `dual` | `false` | Opens both portals at once, so the content passes straight between them. |
| `ease` | `'inOut'` | Sink ease. The target overshoots slightly as it emerges. |

### WaterMorph

| Option | Default | Notes |
| --- | --- | --- |
| `color` / `brighten` | `'source'` / `0.2` | Liquid colour: `'source'` (taken from the content) or any CSS colour. `brighten` lightens taken colours so they show up on dark backgrounds. |
| `blobs` / `blobSize` | `70` / `10` | Number of drops in flight, and their size in px. |
| `viscosity` | `0.5` | 0 gives short, runny drips; 1 gives long, stretchy ones. |
| `path` / `arc` | `'arc'` / `0.35` | `'arc'` \| `'stream'` \| `'splash'`, and how high the drops arc. |
| `ripples` / `gloss` / `tint` | `6` / `0.6` / `0.6` | Ripple size in px as the target settles, highlight on the liquid, and how strongly the liquid tints the target. |
| `resolution` | `0.5` | Render scale for the liquid. Lower is faster and softer. |
| `ease` | `'sine'` | Drop flight ease. |

## Demo pages

- **index.html (Motion Lab)** is an effect explorer and the demo site's homepage. It includes all six effects. Pick an effect, tune its options with live controls, then copy the generated usage snippet, browse the options and source, or download the file.
- **[Paper Plane Page.dc.html](https://davidpetergosling.github.io/motion-morph-js/Paper%20Plane%20Page.dc.html)** is a sample landing page that uses OrigamiMorph between sections.

You can try both pages on the [live demo site](https://davidpetergosling.github.io/motion-morph-js/). Both are built with the Neon Grid design system in `_ds/` and the `support.js` runtime. `image-slot.js` provides a drop-in `<image-slot>` image placeholder. To run them locally, serve the folder over HTTP rather than opening it from `file://`, because the pages fetch local files:

```sh
npx serve .
# or
python -m http.server
```

## Project layout

```
effects/            the morph libraries (standalone, no dependencies)
_ds/                Neon Grid design system tokens and bundle
support.js          runtime for the .dc.html pages (generated, do not edit)
image-slot.js       <image-slot> web component
index.html          Motion Lab effect explorer (demo site homepage)
*.dc.html           other demo pages
```
