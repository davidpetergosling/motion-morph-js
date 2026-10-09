# MotionMorphJs

Scroll-driven morph effects that move content from one DOM element to another. Each effect is a single file with no dependencies. Drop it in with a `<script>` tag and it works in any modern browser.

| Effect | File | What it does |
| --- | --- | --- |
| **ParticleMorph** | [effects/particle-morph.js](effects/particle-morph.js) | Samples real text, images and outlines at their layout positions, then flies thousands of glowing dots from one element into another. |
| **OrigamiMorph** | [effects/origami-morph.js](effects/origami-morph.js) | Turns an element into a sheet of paper, folds it into a paper plane, flies it across the viewport and unfolds it as the next element. |

Both effects (v1.2.0) can be scrubbed by scroll, run on a timer, or driven by hand. Both also respect `prefers-reduced-motion` by default.

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

Each library sets a global (`ParticleMorph` / `OrigamiMorph`) and also exports via `module.exports` when it is loaded in a CommonJS environment.

## API

Both effects share the same API:

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

## Demo pages

- **Motion Lab.dc.html** is an effect explorer. Pick an effect, tune its options with live controls, then copy the generated usage snippet, browse the options and source, or download the file.
- **Paper Plane Page.dc.html** is a sample landing page that uses OrigamiMorph between sections.

Both pages are built with the Neon Grid design system in `_ds/` and the `support.js` runtime. `image-slot.js` provides a drop-in `<image-slot>` image placeholder. To view a page, serve the folder over HTTP rather than opening it from `file://`, because the pages fetch local files:

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
*.dc.html           demo pages
```
