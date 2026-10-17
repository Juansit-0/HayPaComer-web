# DESIGN.md - HayPaComer Design System v3 ("Pa' comer")

Single source of truth for the visual language of the web app and the landing. It implements `brand/identity.md` v3 in the docs repository. Components reference tokens from `tokens.css` only; raw hex values never appear in `app/*.js` or `app/app.css`.

## Files

| File | Purpose |
|---|---|
| `assets/tokens.css` | Design tokens as CSS custom properties: primitives, semantic roles, chapters, motion, components. Light only. |
| `assets/theme.md` | One-page theme summary |
| `assets/logo-mark.svg`, `assets/logo-lockup.svg` | The H-and-tray mark and the Anton lockup |

`tokens.json` (v1 and v2, DTCG) is retired; `tokens.css` is the only token source.

## Design principles

- **Numbers first.** The largest element on every screen is a measurement: grams, days, degrees, money.
- **One chapter per screen.** Each tab owns one produce colour; it fills the screen header band and the active tab.
- **Motion explains change.** Movement happens when something loads or changes, never as decoration, and always respects `prefers-reduced-motion`.
- **Honest states.** Unknown, estimated and stale data say so in words; skeletons show the shape of what is coming, never fake content.

## Colour

| Token | Hex | Role | Text on it | Contrast |
|---|---|---|---|---|
| `--color-arroz` | `#fbfbf8` | Ground | Tinta | 18.07:1 |
| `--color-blanco` | `#ffffff` | Tiles and surfaces | Tinta | 18.7:1 |
| `--color-meson` | `#efeee9` | Tone step between surfaces, skeletons, secondary buttons | Tinta | 16.13:1 |
| `--color-tinta` | `#121212` | Ink | Arroz | 18.07:1 |
| `--color-piedra` | `#55534e` | Secondary text on arroz and blanco | (on arroz) | 7.41:1 |
| `--color-papa` | `#f3c443` | Chapter Ahora; at-risk state | Tinta | 11.41:1 |
| `--color-tomate` | `#c8432a` | Chapter Mercado; expired, door open | Arroz | 4.72:1 |
| `--color-cilantro` | `#2f7a4a` | Chapter Nevera; fresh, enough, done | Arroz | 5.06:1 |
| `--color-mora` | `#4b1f2e` | Chapter Números; under review | Arroz | 13.2:1 |
| `--color-cobre` | `#a8481f` | Primary action, Chef chapter | White | 5.81:1 |

Chapters by route: `now` papa, `fridge` cilantro, `market` tomate, `numbers` mora, `chef` cobre, `settings` mesón. `main.js` sets `data-chapter` on the root element and `app.css` maps it to `--chapter` and `--chapter-ink`.

Rules: one chapter colour per screen; no tints, no gradients; no shadows on resting elements (only sheets, dialogs and toasts float); copper only on the main action of a screen.

## Typography

| Step | Token | Face | Use |
|---|---|---|---|
| Poster | `--size-poster` clamp(64px, 12vw, 200px) | Anton | Landing headlines, loader |
| Head | `--size-head` clamp(40px, 6vw, 88px) | Anton, uppercase | Screen titles in the chapter band |
| Figure | `--size-figure` clamp(40px, 5vw, 72px) | Hanken Grotesk 600 to 700, tabular | The number of a tile |
| Body | `--size-body` 17px | Hanken Grotesk 400 | Reading, controls |
| Small | `--size-small` 14px | Hanken Grotesk 500 | Secondary notes |

Headlines stay within two lines. Every number uses `font-variant-numeric: tabular-nums`. No monospace, no italics, no uppercase letter-spaced labels.

## Shape and space

Spacing 8, 16, 24, 32, 48, 96 px. Radius 4, 8, 12, 16 px and full. Buttons and chips are pills; tiles are 16 px. Controls are at least 52 px tall (touch targets 48 px or more).

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 140ms | Press, hover |
| `--duration-base` | 240ms | Tabs, view transition cross-fade |
| `--duration-slow` | 480ms | Entrances, chapter band |
| `--duration-shutter` | 900ms | Loader shutter |
| `--ease-emphasized` | cubic-bezier(0.3, 0, 0, 1) | Entrances and the shutter |
| `--stagger` | 70ms | Delay between siblings |
| `--rise` | 24px | Entrance travel |

Patterns:

- **Loader.** The wordmark at full width fills from the bottom with real progress (texts, fonts, session, first data), then the destination chapter rises as a shutter and the page slides away.
- **Skeleton.** On every route change `skeleton(route, title)` in `ui.js` paints the chapter band with the real title and pulsing blocks shaped like that screen's tiles; `main` carries `aria-busy` until data arrives.
- **Entrance.** When a view renders, its header and tiles rise in sequence (`data-enter`, `--i`, `--stagger`).
- **Tab transition.** View Transitions API between routes; the chapter band morphs as `view-transition-name: chapter`.
- **Busy buttons.** `busy(button, task)` disables the button and shows a spinner while the request runs.

All of it collapses to instant changes under `prefers-reduced-motion: reduce` (durations, stagger and rise are zero).

## Accessibility

AA contrast on every pair above; visible 2 px focus outline in tinta; skeletons are `aria-hidden` and `main` announces `aria-busy`; the loader is decorative (`aria-hidden`); status is never told by colour alone.
