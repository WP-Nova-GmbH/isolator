# Design system

Isolator is used by the person who carries an ISMS: often an IT lead or office manager doing security on the side, sometimes a consultant or an auditor looking over their shoulder. The interface should feel like a well-kept audit file: calm, exact, and easy to defend. Nothing decorative competes with the state of a control or a risk.

Tokens live in [apps/web/src/index.css](../apps/web/src/index.css). Logo artwork lives in [docs/brand/](brand/). Components that encode the rules below live in [apps/web/src/components/](../apps/web/src/components/).

## Logo

The mark is a lowercase **i** inside four corner brackets.

- The brackets are the ISMS **scope** (clause 4.3): the boundary the organization decides to protect.
- The **i** is information, the thing inside that boundary.
- The glass-coloured square is the asset being protected. It is the only coloured part of the logo, and it also dots the i in the wordmark.

The wordmark is drawn, not typeset: monoline strokes on a 20-unit x-height, butt ends, true circles for o and a. Don't recreate it with a font.

| File | Use |
| --- | --- |
| `isolator-logo.svg` / `-dark.svg` | Default lockup, mark + wordmark |
| `isolator-mark.svg` / `-dark.svg` | Mark alone, where the name is already visible or space is under 120 px |
| `isolator-wordmark.svg` / `-dark.svg` | Wordmark alone, for running text such as a document footer |
| `isolator-app-icon.svg` | Favicon, app icon, avatars. Heavier strokes on an ink tile so it holds at 16 px |
| `png/` | Raster exports of the above for tools that can't take SVG |

In the app, use `<Logo />` and `<Mark />` from `components/logo.tsx`. They draw ink in `currentColor` and the dot in `--brand-dot`, so they follow the theme.

Rules:

- Clear space on every side: the width of the mark's dot (about a sixth of the mark's height).
- Minimum size: lockup 20 px tall, mark 16 px, app icon 16 px.
- On photos or coloured grounds, use the app icon rather than placing the bare mark.
- Don't recolour the dot, rotate the mark, close the brackets, or add a shield. Security brands lean on shields; we don't.

## Colour

Two primitive families, plus semantic tones. Tailwind's default palette is disabled, so every colour in the app comes from here.

**Ink** is the neutral: cool greys with a slight lean toward glass, from `ink-25` (page) to `ink-950` (dark page).

**Glass** is the brand colour, named after the aqua glass of old telegraph line insulators. Use it for primary actions, focus rings, selection and the logo dot. It is never used to mean "good" or "done"; that's what the success tone is for.

Components use the semantic layer, never primitives directly:

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | ink-25 | ink-950 | Page |
| `surface` | white | ink-900 | Cards, tables, sidebar |
| `surface-sunken` | ink-50 | #151b1d | Hover rows, wells |
| `foreground` | ink-900 | ink-50 | Body text |
| `muted-foreground` | ink-600 | ink-400 | Secondary text, control refs |
| `border` / `border-strong` | ink-200 / ink-300 | ink-800 / ink-700 | Dividers / inputs |
| `primary` | glass-700 | glass-400 | Primary buttons, links |
| `selected` | glass-50 | #0d2725 | Active nav item, selected row |
| `ring` | glass-500 | glass-400 | Focus outline |

All text pairs meet WCAG AA (4.5:1) in both themes; primary buttons are 6.7:1.

### Status tones

`success`, `warning`, `info`, `danger`, `neutral`, each with a solid, a `-subtle` background and a `-foreground` text colour. Map domain states to tones once, in one place:

| Domain state | Tone |
| --- | --- |
| Control implemented | success |
| Control partially implemented | warning |
| Control planned | info |
| Control not started | neutral |
| Control not applicable (SoA) | neutral, with the justification shown |
| Evidence expired, nonconformity open | danger |
| AI draft awaiting sign-off | info, labelled "Draft" |

### Risk bands

Risk is likelihood × impact, each 1–5, so scores run 1–25. Bands:

| Band | Scores | Token |
| --- | --- | --- |
| Low | 1–4 | `risk-low` |
| Medium | 5–9 | `risk-medium` |
| High | 10–16 | `risk-high` |
| Critical | 20–25 | `risk-critical` |

17–19 can't occur on a 5 × 5 matrix. Use `riskBand()` and `<RiskScore />` from `components/risk-score.tsx` rather than repeating the thresholds. Each band has an `-on` token for text on the solid fill. Always show the number as well as the colour.

## Type

| Role | Face | Where |
| --- | --- | --- |
| Display | Archivo, semi-expanded (`font-stretch: 112.5%`) | `h1`–`h3`, set by base styles |
| Body / UI | Instrument Sans | Everything else |
| Mono | IBM Plex Mono | Control refs (`A.8.13`), scores, IDs, dates in tables |

Fonts are self-hosted through `@fontsource` packages, so the customer's browser never calls Google. Customers in the EU ask about this.

Scale, using Tailwind's defaults: page title `text-2xl`, section `text-lg`, body and table text `text-sm`, labels and badges `text-xs`. Use `tabular-nums` wherever numbers line up.

## Shape and space

- Radius stays small: `rounded-sm` for badges and score chips, `rounded-md` for buttons, inputs and cards. The logo is square; the UI follows it.
- Borders separate things; shadows are for things that float (menus, dialogs) and nothing else.
- Space with flex/grid `gap`, on Tailwind's 4 px scale. Dense views (registers, the SoA) use `p-2` cells; forms use `gap-4`.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `Logo`, `Mark` | `logo.tsx` | Theme-aware SVG |
| `Button` | `button.tsx` | `primary` once per view, `secondary`, `ghost`, `danger` |
| `Badge` | `badge.tsx` | Takes a `tone`; always has a text label |
| `RiskScore`, `riskBand` | `risk-score.tsx` | Score chip coloured by band |

## Dark mode

Dark values follow the OS. Setting `data-theme="light"` or `data-theme="dark"` on `<html>` pins one. Because components only use semantic tokens, they don't need `dark:` variants.

## Voice

- Name things the way the standard and the customer do: Statement of Applicability, risk owner, evidence. See [GLOSSARY.md](../GLOSSARY.md).
- Say what happened and what to do next. "Evidence for A.5.15 expires on 12 March. Upload a new access review." Not "Oops!"
- AI never decides. Copy says "Suggested by AI" and "Confirm", and shows who confirmed.
- Never quote ISO/IEC 27001 or 27002 control text. Refs and titles only; descriptions are our own words.
