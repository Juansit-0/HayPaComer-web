# DESIGN.md - HayPaComer Design System v3 ("Pa' comer")

Single source of truth for the visual language of the web app and the landing. It implements `brand/identity.md` v3 in the docs repository. Components reference tokens from `tokens.css` only; raw hex values never appear in `app/*.js` or `app/app.css`.

## Files

| File | Purpose |
|---|---|
| `assets/tokens.css` | Design tokens as CSS custom properties: primitives, semantic roles, chapters, motion, components. Light only until the night paper theme lands. |
| `assets/theme.md` | One-page theme summary |
| `assets/logo-mark.svg`, `assets/logo-lockup.svg` | The H-and-tray mark and the lockup (the lockup keeps its original Anton drawing until it is redrawn in Fraunces) |

`tokens.json` (v1 and v2, DTCG) is retired; `tokens.css` is the only token source.

## Design principles

- **Numbers first.** The largest element on every screen is a measurement: grams, days, degrees, money.
- **One chapter per screen.** Each tab owns one produce colour; it fills the screen header band and the active tab.
- **Motion explains change.** Movement happens when something loads or changes, never as decoration, and always respects `prefers-reduced-motion`.
- **Honest states.** Unknown, estimated and stale data say so in words; skeletons show the shape of what is coming, never fake content.

## Colour

| Token | Hex | Role | Text on it |
|---|---|---|---|
| `--color-papel` | `#f3ecdf` | Ground: the sheet of paper (`--color-bg`, `--sheet`) | Tinta |
| `--color-carta` | `#fbf6ec` | Cards, fields and chips laid on the paper (`--color-surface`, `--card`) | Tinta |
| `--color-papel-paso` | `#e9dfcb` | Tone step, skeletons, the Ajustes band | Tinta |
| `--color-tinta` | `#1c1712` | Ink: text, borders, hard shadows (`--color-line`, `--line`) | Papel |
| `--color-piedra` | `#5c554c` | Secondary text on paper | (on papel) |
| `--color-papa` | `#f3c443` | Chapter Ahora; at-risk state | Tinta |
| `--color-tomate` | `#c8432a` | Chapter Mercado; expired, door open | Arroz |
| `--color-cilantro` | `#2f7a4a` | Chapter Nevera; fresh, enough, done | Arroz |
| `--color-mora` | `#4b1f2e` | Chapter Números; under review | Arroz |
| `--color-cobre` | `#a8481f` | Primary action, Chef chapter | White |

Chapters by route: `now` papa, `fridge` cilantro, `market` tomate, `numbers` mora, `chef` cobre, `settings` papel paso. `main.js` sets `data-chapter` on the root element and `app.css` maps it to `--chapter` and `--chapter-ink`.

Rules:
- One chapter colour per screen; it fills the band, the active tab, the leader line and at most one data mark. No tints, no gradients.
- Status colours are semantic and always come with words: papa at risk, tomate expired or danger, cilantro fresh or done. On the Mercado screen, danger is told apart from the chapter by its stamp and text.
- Copper only on the main action of a view; every other button is an ink outline; destructive buttons are an ink outline that fills with tomate while held.
- **Card or row.**
  - A card (2 px ink border, 6 px radius, `--shadow-press` 4 px offset ink shadow) is an object acted on as a whole: a dish, a "use today" item, a pending AI confirmation, an unread alert. A card never holds another card.
  - A row (an `--color-border` hairline, no shadow) is a list of the same kind.
  - Sheets and toasts use `--shadow-raised`.
- `app.css` and `app/*.js` never hold raw hex for the interface. Illustrations (food shapes, the drawn fridge, 3D materials) are exempt.

## Typography

| Step | Token | Face | Use |
|---|---|---|---|
| Poster | `--size-poster` clamp(64px, 12vw, 200px) | Fraunces 900, SOFT 100, WONK 1 | Landing headlines, loader |
| Head | `--size-head` clamp(40px, 6vw, 88px) | Fraunces 900, uppercase | Screen titles in the chapter band |
| Figure | `--size-figure` clamp(40px, 5vw, 72px) | Hanken Grotesk 600 to 700, tabular | The number of a tile |
| Body | `--size-body` 17px | Hanken Grotesk 400 | Reading, controls |
| Small | `--size-small` 14px | Hanken Grotesk 500 | Secondary notes |

Fraunces is set at its heaviest optical size with the soft, slightly wonky cut, so headlines read like an engraved poster. It is about 40% wider than the old Anton: tight spots (the drawn fridge, the 3D note) size their text to fit. Headlines stay within two lines. Every number uses `font-variant-numeric: tabular-nums`. No monospace, no italics, no uppercase letter-spaced labels.

## Shape and space

Spacing 8, 16, 24, 32, 48, 96 px on an 8 pt rhythm: 8 inside a control, 16 between elements of a card or row, 24 card padding, 32 between sections, 48 from the band to the first section. Cards, tiles, fields and sheets have a 6 px radius (fields 4 px); buttons and chips are pills. Controls are at least 52 px tall, rows at least 56 px, and every touch target at least 44 px.

## Motion v2

Motion explains a change, answers an action, or tells the story; nothing moves to decorate. Every duration and curve comes from a token or a spring below, never from a literal in code. The parameters were set after studying how Santioni Spirits moves (`HayPaComer-docs/docs/design/santioni-motion-analysis.md`); the techniques are re-implemented from scratch.

### Tokens

| Token | Value | Use |
|---|---|---|
| `--duration-press` | 100ms | Press feedback |
| `--duration-fast` | 160ms | Hover, small state changes |
| `--duration-base` | 240ms | Tabs, chapter band, toasts |
| `--duration-slow` | 420ms | Entrances, sheets |
| `--duration-withdraw` | 180ms | Panel ink withdraws before a route change |
| `--duration-spring` | 745ms | Length of the `surface` spring in CSS |
| `--duration-shutter` | 600ms | Loader exit, Pasto photo shutter |
| `--duration-caption` | 800ms | Story caption box opens |
| `--duration-hold` | 800ms | Press and hold in the app (never zeroed) |
| `--ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Colour and opacity |
| `--ease-emphasized` | cubic-bezier(0.3, 0, 0, 1) | Entrances |
| `--ease-exit` | cubic-bezier(0.5, 0, 0.9, 0.4) | Things leaving |
| `--ease-out-back` | cubic-bezier(0.34, 1.4, 0.64, 1) | Labels that pop |
| `--ease-spring` | `linear()` of the `surface` spring | CSS that must land with JS springs |
| `--stagger` | 40ms, at most 6 items | Delay between siblings |
| `--rise` | 16px | Entrance travel |

### Springs (`app/motion.js`, Motion `visualDuration` and `bounce`)

| Spring | Duration | Bounce | Settles | Use |
|---|---|---|---|---|
| `snappy` | 0.24 s | 0 | 425 ms | Tab indicator, list moves, kit stamps |
| `surface` | 0.42 s | 0 | 745 ms | Panel reveal, sheets |
| `camera` | 0.6 s | 0 | 1060 ms | 3D camera between routes |
| `door` | 0.7 s | 0.25 | 1070 ms | Fridge door and freezer |
| `drop` | 0.45 s | 0.2 | 730 ms | A food flying to the pot, bin or shelf |

The 3D integrator uses the same stiffness and damping as the DOM springs, so the camera and the panel settle together.

### Story parameters (`app/story/story.json`)

| Parameter | Value |
|---|---|
| Wheel | 0.3 x pixel delta on every device, 16 to 40 px per line in line mode |
| Smoothing | time-based, about 140 ms to follow on desktop and 60 ms on phones; one notch settles within about 1.2 s |
| Inertia | 0.9 per 60 Hz frame, scaled by time; touch release glides 1.5 to 2.5 s |
| Momentum block | 200 ms after a jump |
| Keys | arrows 150 px, Page and Space one caption, 400 ms |
| Camera | fov 35; parallax 0.5 world units on desktop only, lerp 0.05; pitch from scroll speed 0.002 rad per px, at most 0.2 rad |
| Hatching boil | 8 steps per second, frozen 5 s after the last interaction |
| Ink cover | 2 screens (1.5 on phones), threshold 0.4, edge drift 0.1 per second |
| Captions | box opens in 800 ms; lines come in over 1.2 to 2 s, 100 to 200 ms apart |
| Door gate | hold 3 s to open the fridge, rewinds three times faster when released |

### Choreography

| Where | Trigger | What moves | Motion | Reduced motion |
|---|---|---|---|---|
| Story | Loader exits | Intro title and hint | Words rise, `--duration-slow`, stagger | Shown at once |
| Story | Scroll | Camera along its keys, worlds, hatching | Virtual scroll, smoothing above | Not mounted: engravings and captions on native scroll |
| Story | Chapter cut | Ink cover sweeps the screen | Scrubbed by progress | None |
| Story | Caption cue | Caption box, then its words | `--duration-caption`, words by progress | Plain text |
| Story | Kitchen door | Hold button fills; door opens | 3 s hold, `door` spring | Hold kept, door jumps |
| Story | End | Header returns, page scroll released | `--duration-base` | Instant |
| Landing | In view | Hero lines, stills, kit medallions, Pasto photo, wordmark | Mask reveal, ink fade, `snappy` stamp, shutter | Final state |
| Landing | How it works step | Scene image | Ink blot mask, `--duration-slow` | Swap |
| Landing | Calculator input | Money digits | Digits slide, at most 800 ms | Swap |
| Shell | Ready | Loader | Exit `--duration-shutter`, never blocks clicks | Gone at once |
| Shell | Route change | Camera and panel ink | `camera` spring plus withdraw then `surface` reveal, interruptible | Instant swap |
| Shell | View renders | Header and up to 6 tiles | Rise, `--stagger` | Shown at once |
| Shell | Live refresh | Only the items that changed | Keyed FLIP, `snappy` | Swap |
| Screens | Market check | The item moves to the cart | FLIP `snappy`, undone if the request fails | Swap |
| Screens | Numbers change | Grams, money, rings | Count from the previous value, at most 800 ms | Swap |
| Screens | Chat | Only the new message | Rise | Shown at once |
| Screens | Sheet | Sheet and backdrop | `surface` in, `--ease-exit` out | Instant |
| Screens | Press and hold | Fill, then a stamp | `--duration-hold`, stamp `snappy` | Fill kept, stamp becomes a colour |
| 3D fridge | Drop | The food flies to its target, or back if the drop fails | `drop` spring | Jumps |
| 3D fridge | New food | Pops in | `snappy`, 40 ms apart | Appears |
| 3D fridge | Pointer | Camera parallax | Damped, eases back on leave | Off |
| Everywhere | 5 s idle | Hatching boil, vapor, pulses | Freeze | Never start |

Rules: only `transform`, `opacity`, `clip-path`, masks and filters animate; one WebGL context per area; rendering pauses off screen and while idle; sound is off until the visitor turns it on.

## Accessibility

AA contrast on every pair above; visible 2 px focus outline in tinta; skeletons are `aria-hidden` and `main` announces `aria-busy`; the loader is decorative (`aria-hidden`); status is never told by colour alone.

## Engraving

The 3D fridge is drawn like an engraving, after the woodcut and engraved-poster language of illustrated spirits and food labels. Every material keeps its flat colour, the way a print is filled, and the light only decides how many ink lines cross it: none in full light, wavy diagonal hatching in half shadow, cross-hatching in deep shadow. Lines are drawn in screen space at a fixed pitch so the fridge reads as printed, and colours are mixed in display space so produce keeps its true hue. The fridge body is cream paper (`#f6f1e6`), the interior a pale grey green, and the food is the only saturated colour in the scene, the way a single bottle glows in an engraved label.

