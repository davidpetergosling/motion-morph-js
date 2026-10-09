# Neon Grid — Design System

A neon cyberpunk system: blue-black void surfaces, white type, cyan + magenta light. Built from scratch (no source codebase, Figma, or brand assets were provided) for use across Claude-generated designs.

Source: imported from the uploaded `Neon Grid design system.zip` (`uploads/Neon Grid design system/`). The original runtime loader (`lib/ng-loader.js`) was replaced by the compiled `_ds_bundle.js` (namespace `window.NeonGridDesignSystem_6e94e2`).

## Index
- `styles.css` — single entry point (imports only). Link this.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `motion.css`, `components.css` (component classes, `ng-*`)
- `components/`
  - `core/` Icon, Button, IconButton, Badge, Tag
  - `forms/` Input, Select, Checkbox, Radio, Switch
  - `surfaces/` Card, Dialog, Tooltip
  - `navigation/` Tabs
  - `feedback/` Toast, Progress
- `guidelines/` — foundation specimen cards
- `ui_kits/console/` — sample ops dashboard composing every component
- `SKILL.md` — Agent Skill entry
- `thumbnail.html` — homepage tile

Intentional additions: **Icon** (wraps Lucide so components can render icons by name). **Progress** (signal bars are core to the aesthetic).

## CONTENT FUNDAMENTALS
- **Voice:** terse, technical, confident — a ship's computer, not a hype-man. Second person ("you"), never "we".
- **Casing:** UPPERCASE for display headlines, buttons, tabs, badges, labels. Sentence case for body copy, inputs, tags, toast bodies.
- **Labels:** mono, uppercase, prefixed with `//` for eyebrows/section tags (`// NODE 07`, `// CONFIRM`). Timestamps/IDs in mono.
- **Verbs:** short and physical — Deploy, Jack in, Abort, Purge, Override, Ping. Confirmations state the consequence with a number: "Wipe cache? This purges 2.4 GB."
- **Status:** past-tense facts — "Link established.", "Intrusion blocked." No exclamation marks.
- **No emoji. No leetspeak, no fake Japanese, no "Click here".** Keep world-flavor (sectors, relays, nodes) light; clarity first.

## VISUAL FOUNDATIONS
- **Color:** backgrounds are blue-black (`--ng-void` #05050A → `--ng-surface-3` #1D1D33). Text is near-white `#F5F7FF` with cool grays below. **Cyan #00F0FF** = primary action, focus, active, data. **Magenta #FF2BD6** = secondary/high-energy, toggles-on, focus ring, emphasis. Never fill large areas with accent — accents are *light*, used on strokes, text, small fills. Semantic: success #3DFF9A, warning #FFD23F, danger #FF3B5C.
- **Type:** Chakra Petch (display — angular, techy) uppercase with +0.02–0.12em tracking; IBM Plex Sans for body (readable); JetBrains Mono for labels, data, code.
- **Spacing:** 4px base; card padding 24, gaps 12/16, page gutters 32. Controls 32/40/48 high.
- **Corners:** near-square (2px). Signature motif: **chamfered panels** — top-right and bottom-left corners cut 14px (cards, dialogs). Pills only for switches/dots.
- **Borders:** 1px hairlines (`--ng-line`). Hover → `--border-strong`. Focus/active → full accent + glow. No left-border accent cards.
- **Elevation = light, not shadow.** Interactive elements glow on hover (`--glow-cyan` / `--glow-magenta`: 1px ring + 14px + 36px bloom). Only overlays get a dark drop shadow (`--shadow-overlay`).
- **Backgrounds:** flat void; optional faint 32px cyan grid (`.ng-bg-grid`) on app canvases/heroes; scanlines (`.ng-scanlines`) for imagery/hero overlays. The cyan→magenta `--gradient-signal` is reserved for progress/meter fills and thin rules — never full-bleed backgrounds.
- **Transparency/blur:** overlays use void @78% + 6px backdrop blur. Accent alpha tints (10/20/40/60) for fills and halos.
- **Imagery:** cool, high-contrast, night-lit; cyan/magenta practicals; grain OK. Overlay scanlines for consistency.
- **Motion:** quick ease-out (`cubic-bezier(.2,.8,.2,1)`), 120/200/360ms. Dialogs fade + rise 8px. `ng-pulse` for live dots; `ng-flicker` only for decorative signage. Respects reduced-motion.
- **Hover:** glow bloom + slight fill lighten (primary) or 10% tint (outline/secondary); ghost gets surface-raised bg. **Press:** translateY(1px). **Disabled:** 38% opacity, no glow.
- **Focus:** 2px magenta outline offset 3px on buttons; inputs glow cyan.
- **Cards:** surface-1 fill, 1px hairline, chamfered corners, optional cyan/magenta tone (60% border + 6% top tint). No drop shadows, no nesting.

## ICONOGRAPHY
- **Lucide** line icons via CDN (`https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js`), stroke 1.75, sizes 14/16/18/24. Render with `<Icon name="zap" />` or `<i data-lucide="zap">` + `lucide.createIcons()`.
- Default color = currentColor (white/gray). Active/highlighted icons go cyan or magenta with a matching `drop-shadow` glow.
- No emoji. Unicode used only for `>` prompt prefix and `//` label marks. No icon font, no PNG icons.
- **No logo was provided** — the name is set in type: "NEON/GRID" in Chakra Petch 700, cyan + magenta glow. Replace when a real mark exists.

## Usage in other projects
Link `styles.css`, load React + Lucide + `_ds_bundle.js`, then `const { Button } = window.NeonGridDesignSystem_6e94e2`. Plain HTML can use the `ng-*` classes and tokens directly.

## Fonts
All Google Fonts (Chakra Petch, IBM Plex Sans, JetBrains Mono), loaded by `tokens/fonts.css`. Swap in licensed files if you have them.
