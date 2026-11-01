# Design system

Isolator is used by the person who carries an ISMS: often an IT lead or office manager doing security on the side, sometimes a consultant or an auditor looking over their shoulder. The interface should feel like a well-kept audit file: calm, exact, and easy to defend. Nothing decorative competes with the state of a control or a risk.

Tokens live in [apps/web/src/index.css](../apps/web/src/index.css). Logo artwork lives in [docs/brand/](brand/). Components are [shadcn/ui](https://ui.shadcn.com) on Radix, restyled to these rules, in [apps/web/src/components/ui/](../apps/web/src/components/ui/); our own components sit one level up in [apps/web/src/components/](../apps/web/src/components/).

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

**Ink** is the neutral: cool greys with a slight lean toward glass, from `ink-50` to `ink-950` (dark page).

**Glass** is the brand colour, named after the aqua glass of old telegraph line insulators. Use it for primary actions, focus rings, selection and the logo dot. It is never used to mean "good" or "done"; that's what the success tone is for.

Components use the semantic layer, never primitives directly:

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | ink-75 | ink-950 | Ground: window and navigation |
| `surface` | white | ink-900 | The page sheet, cards, inputs |
| `surface-sunken` | ink-75 | #151b1d | Hover rows, stat tiles, tab tracks |
| `foreground` | ink-900 | ink-50 | Body text |
| `muted-foreground` | ink-600 | ink-400 | Secondary text, control refs |
| `border` / `border-strong` | ink-150 / ink-300 | ink-800 / ink-700 | Dividers / inputs |
| `primary` | glass-600 | glass-400 | Primary buttons, the active nav icon |
| `link` | glass-700 | glass-400 | Text links |
| `selected` | glass-50 | #0d2725 | Active nav item, selected row |
| `ring` | glass-500 | glass-400 | Focus outline |

All text pairs meet WCAG AA (4.5:1) in both themes; primary buttons are 4.8:1.

### Status tones

`success`, `warning`, `info`, `danger`, `neutral`, each with a solid, a `-subtle` background and a `-foreground` text colour. A status reads as a coloured dot beside the word, in a thin outlined pill. Only `danger` keeps its filled background, so it still stands out in a long table.

Domain states map to tones once, in `state-badge.tsx`:

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

17–19 can't occur on a 5 × 5 matrix. Use `riskBand()` and `<RiskScore />` from `components/risk-score.tsx` rather than repeating the thresholds. Scores are tinted chips. Solid band colours are kept for matrix cells that hold risks, so occupied cells stand out from the empty ones; each band has an `-on` token for text on the solid fill. Always show the number as well as the colour.

## Type

| Role | Face | Where |
| --- | --- | --- |
| Headings | Instrument Sans, semibold with tight tracking | `h1`–`h3`, set by base styles |
| Body / UI | Instrument Sans | Everything else |
| Mono | IBM Plex Mono | Control refs (`A.8.13`) and record IDs (`R-03`) |

Fonts are self-hosted through `@fontsource` packages, so the customer's browser never calls Google. Customers in the EU ask about this.

Base styles set the headings: page title 26 px, section 15 px. Body and table text are `text-sm`, labels and badges `text-xs`. Use `tabular-nums` wherever numbers line up, including scores and dates.

## Shape and space

- Radius: `rounded-sm` (6 px) for score chips, `rounded-md` (8 px) for buttons and inputs, `rounded-lg` (12 px) for cards and the page sheet, `rounded-xl` (16 px) for the sign-in card. Status badges are `rounded-full`.
- The navigation sits on the ground and each page is one raised sheet. Borders separate things inside the sheet. Tables sit directly on the sheet, without a box.
- Depth comes from four tokens, so it follows the theme: `shadow-xs` for raised controls, `shadow-button` for primary buttons, `shadow-sheet` for the page sheet, `shadow-float` for things that float.
- Space with flex/grid `gap`, on Tailwind's 4 px scale. Registers and the SoA stay dense, with `py-2` cells; forms use `gap-4`.

## Components

Base components live in `components/ui/`. They started as stock shadcn and are ours to edit. Our own components, which know about the domain, sit in `components/` and build on them.

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `ui/button.tsx` | `default` once per view; `outline` for other actions; `secondary`, `ghost` and `link` where a border is noise; `destructive` for deleting. 36 px tall by default |
| `Badge` | `ui/badge.tsx` | `variant` is a tone: `neutral`, `success`, `warning`, `info`, `danger`. Always has a text label |
| `Table` | `ui/table.tsx` | Registers. Bleeds 10 px past the sheet's padding, so cell text lines up with headings and hover rows reach past it |
| `Alert` | `ui/alert.tsx` | `destructive` for load failures and blocking errors |
| `Skeleton` | `ui/skeleton.tsx` | Loading states. The pulse stops under `prefers-reduced-motion` |
| `Sidebar` | `ui/sidebar.tsx` | App shell, `inset` variant. A 240 px rail on desktop, a sheet on phones |
| `Input`, `Textarea`, `NativeSelect` | `ui/` | 36 px tall to line up with `Button` |
| `Label`, `Card` | `ui/` | `Card` is a bordered section; give it its own layout with `flex flex-col gap-*` |
| `Logo`, `Mark` | `logo.tsx` | Theme-aware SVG |
| `RiskScore`, `RiskChip`, `riskBand` | `risk-score.tsx` | Tinted chip in the risk band's colour |
| `RiskMatrix` | `risk-matrix.tsx` | The fixed 5 × 5 matrix |
| `StateBadge` | `state-badge.tsx` | `Badge` for a domain state. The only place states map to tones |
| `PageHeader`, `SectionHeader` | `page-header.tsx` | Title, description and actions |
| `TabNav`, `RiskTabs`, `useTabFilter` | `tab-nav.tsx` | Segmented tabs made of links: routes, or a filter in the URL |
| `StatGrid`, `StatTile` | `stat-tile.tsx` | Summary numbers on a sunken tile |
| `HistoryList` | `history-list.tsx` | Timeline of Confirmations or Document versions |
| `ConfirmationCard` | `confirmation-card.tsx` | The same card on every record that needs a Confirmation. Give it `form` to save what's on screen as part of confirming |
| `RiskFields` | `risk-fields.tsx` | A risk's fields and live scores. Goes inside a form |
| `TasksTable`, `NewTaskForm` | `tasks-table.tsx`, `new-task-form.tsx` | Tasks on the Tasks page and on a record |
| `FormError` | `form-error.tsx` | Shows why the API refused what a Member tried |
| `LifecycleCard` | `lifecycle-card.tsx` | Closing, ending, reopening or deleting a record, each with a reason |
| `LinkPicker`, `LinkedItem` | `link-picker.tsx` | Linking records to each other and removing the link |
| `SupplierFields`, `AssetFields`, `IncidentFields`, `DocumentFields` | `supplier-fields.tsx`, `asset-fields.tsx`, `incident-fields.tsx`, `document-fields.tsx` | A record's fields. Go inside a form |
| `EvidenceTable`, `EvidenceForm` | `evidence-table.tsx`, `evidence-form.tsx` | Evidence on the Evidence page and on an SoA entry |
| `CopyLink` | `copy-link.tsx` | An invitation link, shown once |
| `Field`, `FieldGrid` | `field.tsx` | Label and control, and a grid of them |
| `EntryPage` | `entry-page.tsx` | Pages outside the app: claim, sign-in, invitation |
| `DetailLayout` | `detail-layout.tsx` | Main column with a side column that drops below it |
| `MainCell`, `DataCell`, `Ref`, `RecordLink`, `TextLink` | `table-parts.tsx` | Cells and links inside registers |

`Sheet`, `Separator` and `Tooltip` are installed as parts of `Sidebar`. Icons are [Lucide](https://lucide.dev): 16 px beside text, in `currentColor`.

### Adding shadcn components

Run `npx shadcn@latest add <component>` from `apps/web`, then review the diff before keeping it:

1. **Check `index.css`.** The CLI can write its own colours into the file. Stock values must not stay: `init` replaced our tokens with neutral greys when we first ran it, so don't run it again.
2. **Map new tokens.** shadcn's names (`card`, `muted`, `accent`, `destructive`, `input`, `sidebar-*`) are aliases of ours in the "shadcn aliases" block. A new one goes there too, pointing at a semantic token, with no dark value of its own.
3. **Fix focus.** Replace `outline-none`, `outline-hidden` and `focus-visible:ring-*` with `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`. Leaving `outline-hidden` in place hides the focus outline entirely. Text fields use a soft halo instead: `focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-ring/30`.
4. **Bring the shape in line.** Buttons and inputs take `rounded-md`, cards, menus and dialogs `rounded-lg`, badges `rounded-full`. Hover uses `bg-muted`, or `bg-neutral-subtle` on the ground, where `muted` doesn't show; the glass tint in `accent` is for selected things. Remove translate and scale effects.

## Dark mode

Dark values follow the OS. Setting `data-theme="light"` or `data-theme="dark"` on `<html>` pins one. Our tokens already switch, so don't write `dark:` variants. The `dark:` variant stays defined with the same rule for the ones that come with stock shadcn components.

## Voice

- Name things the way the standard and the customer do: Statement of Applicability, risk owner, evidence. See [GLOSSARY.md](../GLOSSARY.md).
- Say what happened and what to do next. "Evidence for A.5.15 expires on 12 March. Upload a new access review." Not "Oops!"
- AI never decides. Copy says "Suggested by AI" and "Confirm", and shows who confirmed.
- Never quote ISO/IEC 27001 or 27002 control text. Refs and titles only; descriptions are our own words.
