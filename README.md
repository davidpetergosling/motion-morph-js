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
| **VacuumMorph** | [effects/vacuum-morph.js](effects/vacuum-morph.js) | A swirl of wind streaks sucks the source in as tiles, then reverses and blows the target back out. |
| **ShatterMorph** | [effects/shatter-morph.js](effects/shatter-morph.js) | The source cracks and breaks into glass shards that tumble into a cloud, then fly in and lock together as the target. |
| **GlitchMorph** | [effects/glitch-morph.js](effects/glitch-morph.js) | The colour channels split apart, slices tear sideways, then a burst of digital noise reveals the target. |
| **InkMorph** | [effects/ink-morph.js](effects/ink-morph.js) | The source dissolves like ink in water. Soft clouds drift across and condense as the target. |
| **SandMorph** | [effects/sand-morph.js](effects/sand-morph.js) | The source crumbles into grains that pour across and pile up into the target from the bottom. |
| **TeleporterMorph** | [effects/teleporter-morph.js](effects/teleporter-morph.js) | A beam of light switches on and the source shimmers into sparkles. The target beams in the same way. |
| **BubbleMorph** | [effects/bubble-morph.js](effects/bubble-morph.js) | The source floats off in soap bubbles, each carrying a magnified piece of the content. They pop into place as the target. |
| **ElectricityMorph** | [effects/electricity-morph.js](effects/electricity-morph.js) | Arcs crackle over the source, then a branching lightning bolt zaps it across and the target flickers on. |
| **SmokeBombMorph** | [effects/smokebomb-morph.js](effects/smokebomb-morph.js) | A smoke bomb hides the source. A trail of puffs dashes across, and the target appears as a second bomb clears. |

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

Every effect except ParticleMorph and OrigamiMorph also takes these options:

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

### VacuumMorph

| Option | Default | Notes |
| --- | --- | --- |
| `radius` / `position` | `'auto'` / `'between'` | Size of the wind circle in px (`'auto'` is half the distance between the elements), and where it sits. |
| `color` / `wind` / `streaks` | `'#dff4ff'` / `1` / `110` | Wind colour, how strong the streaks look (0 hides them), and how many there are. About a third are dust specks. |
| `swirl` / `spin` / `direction` | `0.9` / `0.5` / `'cw'` | Turns the wind makes on its way in, turns each tile makes, and which way they turn. |
| `stretch` / `tile` / `stagger` | `2` / `10` / `0.5` | How far tiles stretch toward the centre, tile size in px, and how spread out the departures are. |
| `ease` | `'in'` | Pull ease. Blowing out plays it in reverse. |

### ShatterMorph

| Option | Default | Notes |
| --- | --- | --- |
| `shards` / `impact` | `90` / `'center'` | Roughly how many shards each element breaks into, and where the break starts (`'center'` or `[fx, fy]`). |
| `force` / `spread` | `1` / `1` | How hard the shards fly outward, and the size of the cloud between the elements. |
| `spin` / `gravity` | `1` / `0.4` | How much the shards tumble, and how much they sag mid-flight. |
| `sheen` / `cracks` / `edgeColor` | `0.6` / `true` / `'rgba(255,255,255,.7)'` | Light catching the shards, crack lines before the break, and the colour of the shard edges. |
| `ease` | `'inOut'` | Flight ease. |

### GlitchMorph

| Option | Default | Notes |
| --- | --- | --- |
| `intensity` | `1` | Overall glitch strength. |
| `split` / `slices` / `tear` | `8` / `16` / `60` | Max colour-channel separation in px, slices per element, and the max sideways tear in px. |
| `noise` / `scanlines` / `burst` | `true` / `true` / `true` | Noise blocks, dark scanlines, and the noise burst between the elements. |
| `colors` | `['#00f0ff', '#ff2bd6', '#f5f7ff']` | Noise block colours. |
| `rate` | `90` | Glitch frames over the whole morph. The glitches are generated from the progress value, so scrubbing back and forth gives the same frames every time. |

### InkMorph

| Option | Default | Notes |
| --- | --- | --- |
| `puffs` / `size` / `density` | `240` / `46` / `0.16` | Number of ink clouds, their max radius in px, and how opaque each one is. |
| `swirl` / `drift` | `1` / `50` | How much the clouds curl, and how many px they rise as they travel. |
| `origin` / `roughness` / `soft` | `'edges'` / `0.6` / `0.12` | Where the content dissolves first, how blotchy the dissolve is, and how soft its edge is. |
| `bleed` / `brighten` | `0.8` / `0.15` | Blurred bleed around the dissolving content, and how much the ink colours are lightened. |
| `ease` | `'sine'` | Cloud flight ease. |

### SandMorph

| Option | Default | Notes |
| --- | --- | --- |
| `grain` / `step` / `maxGrains` | `2` / `3` / `6000` | Grain size in px, and the sampling grid in px (one grain per grid cell). The grid gets coarser until the grain count fits under `maxGrains`. |
| `crumble` / `roughness` | `'bottom'` / `0.3` | Where the source crumbles first (`'bottom'` \| `'top'` \| `'left'` \| `'right'` \| `'random'`), and how ragged the edge is. |
| `gravity` / `drop` / `spread` | `1` / `90` / `40` | How far grains fall first, how far in px they drop onto the target, and how far the stream scatters sideways in px. |
| `ease` | `'inOut'` | Grain flight ease. |

### TeleporterMorph

| Option | Default | Notes |
| --- | --- | --- |
| `color` | `'#9fd8ff'` | Colour of the beam and sparkles. |
| `sparkles` / `sparkleSize` / `rise` | `420` / `2.5` / `16` | Sparkles per element, their size in px, and how far in px they drift upward. |
| `shimmer` / `band` | `1` / `3` | Strength of the flickering bands (0–1.5), and their height in px. |
| `beam` / `pads` | `true` / `true` | The column of light, and the bright lines above and below the element. |
| `rate` | `60` | Flicker frames over the whole morph. |

### BubbleMorph

| Option | Default | Notes |
| --- | --- | --- |
| `bubble` | `22` | Grid cell size in px. The bubbles are slightly larger, so they overlap. |
| `rise` / `wobble` | `120` / `1` | How far in px bubbles float up as they leave (and rise into place at the end), and how much they wander and wobble. |
| `magnify` / `iridescence` / `colors` | `1.15` / `0.6` / `['#00f0ff', '#ff2bd6', '#ffe14d']` | How much the bubbles magnify the content, and the strength and colours of the rainbow rim. |
| `stagger` / `pop` | `0.32` / `true` | How spread out the departures are (top rows leave first), and the pop with droplets when bubbles land. |
| `ease` | `'sine'` | Flight ease. |

### ElectricityMorph

| Option | Default | Notes |
| --- | --- | --- |
| `color` | `'#8fd3ff'` | Electric colour. |
| `arcs` / `branches` | `10` / `3` | Arcs crackling over an element at full charge, and side branches on the main bolt. |
| `jag` / `width` | `1` / `2` | How jagged the bolts are, and the width of the bolt's bright core in px. |
| `sparks` / `flicker` / `flash` | `140` / `1` / `true` | Sparks that race along the bolt, how much the content flickers, and a screen flash when the bolt strikes. |
| `rate` | `50` | How many times the bolts are redrawn over the whole morph. The bolts are generated from the progress value, so scrubbing back and forth gives the same bolts every time. |

### SmokeBombMorph

| Option | Default | Notes |
| --- | --- | --- |
| `color` / `shade` | `'#cfcbd9'` / `'#5d5870'` | Colours for the light and shadow sides of the smoke. |
| `puffs` / `size` / `density` | `60` / `1` / `0.85` | Smoke puffs per bomb, cloud size relative to the element, and how opaque the smoke is. |
| `drift` | `40` | How far in px the smoke rises as it clears. |
| `flash` / `flashColor` / `sparks` | `true` / `'#ffd9a0'` / `20` | The flash when each bomb goes off, its colour, and the sparks it sprays. |
| `trail` | `true` | A trail of puffs dashing from the source to the target. |
| `ease` | `'out'` | Smoke expansion ease. |

BurnMorph, WaterMorph, InkMorph and SandMorph read the content's pixels. If an element contains a cross-origin image, the browser blocks this, and those effects fall back to a crossfade.

## Demo pages

- **index.html (Motion Lab)** is an effect explorer and the demo site's homepage. It includes all fifteen effects. Pick an effect, tune its options with live controls, then copy the generated usage snippet, browse the options and source, or download the file.
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
