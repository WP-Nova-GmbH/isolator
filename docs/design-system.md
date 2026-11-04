# Design system

Isolator is used by the person who carries an ISMS: often an IT lead or office manager doing security on the side, sometimes a consultant or an auditor looking over their shoulder. The interface should feel like a well-kept audit file: calm, exact, and easy to defend. Nothing decorative competes with the state of a control or a risk.

Tokens live in [apps/web/src/index.css](../apps/web/src/index.css). Logo artwork lives in [docs/brand/](brand/). Components are [shadcn/ui](https://ui.shadcn.com) on Radix, restyled to these rules, in [apps/web/src/components/ui/](../apps/web/src/components/ui/); our own components sit one level up in [apps/web/src/components/](../apps/web/src/components/).

## Pages show, dialogs change

This is the rule every page follows. A page shows the ISMS as it stands. The ISMS is read far more often than it is changed: by the person who keeps it, by colleagues, and by an auditor. So a page reads like the audit file it is: facts, not form fields.

- **A record's page opens read-only.** Its fields are facts, a label above a value. An empty fact says so plainly ("Unknown", "Unassigned", "None yet"), where a blank input would hide it.
- **Changing it is a decision.** **Edit**, in the page header, opens the record's fields in a dialog with Cancel and Save changes. Nothing changes until Save, and Cancel or Escape leaves the record as it was.
- **Everything else that takes input works the same way.** Adding a file, a review, a Task or Evidence, ending or deleting a record, changing a Member's role, inviting someone: each opens a dialog from a button.
- **No inputs sit open on a page.** There are two exceptions. Controls that only change what you see, such as a filter or the language, stay on the page. So do pages whose only job is to create something, such as Add Supplier.
- **Confirming confirms what the page shows,** which is what is saved.

A page full of inputs looks unfinished, invites changes nobody meant to make, and hides which facts are missing. A dialog makes each change deliberate and easy to back out of, and the Audit trail records only what someone meant to do.

Build the read-only view with `Facts`, a record's Edit dialog with `EditDialog`, and any other form with `FormDialog`. Field components such as `SupplierFields` group their fields with `FieldSection`: a card on a create page, a plain group inside a dialog.

A record's page is laid out so that it never feels crowded:

- **Header:** the record's name, with a one-line description under it when there is one (what a Supplier provides). On the right: its state, **Edit**, and a ⋯ menu for rare actions such as ending, closing or deleting it.
- **Facts:** directly on the sheet, without a box.
- **Related records** (files, reviews, Tasks, linked assets): below the facts. When there are several kinds, they go in tabs with a count each, one shown at a time. The open tab's action, such as Add file, sits to the right of the tabs.
- **Side column:** what needs the reader, such as a Confirmation or what needs attention, and the record's History.

### Tabs are routes

Every tab has its own URL, so it can be linked to, bookmarked, sent to an auditor, and reached again with Back. A tab is never state held in a component.

- A tab that shows a part of a page is a nested route. The first tab is the index: `/suppliers/S-03` shows the files, and `/suppliers/S-03/reviews` the reviews. The page's route owns the header, the facts and the tabs, and renders the open tab with `<Outlet>`.
- A tab that filters a single list is a search param on that list's route: `/incidents?tab=closed`, through `useTabFilter`.
- Build both with `TabNav`. A form inside a tab posts to the tab's route, so the tab routes share the page's action.

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
- The navigation sits on the ground and each page is one raised sheet. Borders separate things inside the sheet. Tables and a record's facts sit directly on the sheet, without a box. Cards are for the side column and for small groups of linked records.
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
| `Dialog` | `ui/dialog.tsx` | Every form on a page opens in one. Use it through `FormDialog` |
| `DropdownMenu` | `ui/dropdown-menu.tsx` | The ⋯ menu on a record's page. Use it through `LifecycleMenu` |
| `Skeleton` | `ui/skeleton.tsx` | Loading states. The pulse stops under `prefers-reduced-motion` |
| `Sidebar` | `ui/sidebar.tsx` | App shell, `inset` variant. A 240 px rail on desktop, a sheet on phones |
| `Input`, `Textarea`, `NativeSelect` | `ui/` | 36 px tall to line up with `Button` |
| `Label`, `Card` | `ui/` | `Card` is a bordered section for the side column or a small group of linked records; give it its own layout with `flex flex-col gap-*` |
| `Logo`, `Mark` | `logo.tsx` | Theme-aware SVG |
| `RiskScore`, `RiskChip`, `riskBand` | `risk-score.tsx` | Tinted chip in the risk band's colour |
| `RiskMatrix` | `risk-matrix.tsx` | The fixed 5 × 5 matrix |
| `StateBadge` | `state-badge.tsx` | `Badge` for a domain state. The only place states map to tones |
| `PageHeader`, `SectionHeader` | `page-header.tsx` | Title, description and actions |
| `TabNav`, `RiskTabs`, `useTabFilter` | `tab-nav.tsx` | The only tabs: segmented links, each to its own URL. A part of a page is a route, a filter of one list a search param. Give an item a `count` to show how many records it holds |
| `StatGrid`, `StatTile` | `stat-tile.tsx` | Summary numbers on a sunken tile |
| `HistoryList` | `history-list.tsx` | Timeline of Confirmations or Document versions |
| `ConfirmationCard` | `confirmation-card.tsx` | The same card on every record that needs a Confirmation. Confirms the record as saved, which is what the page shows |
| `RiskFields` | `risk-fields.tsx` | A risk's fields and live scores. Goes inside a form |
| `TasksTable`, `NewTaskForm` | `tasks-table.tsx`, `new-task-form.tsx` | Tasks on the Tasks page and on a record. Adding, committing and cancelling open dialogs |
| `FormError` | `form-error.tsx` | Shows why the API refused what a Member tried |
| `LifecycleMenu` | `lifecycle-menu.tsx` | The ⋯ menu beside Edit: closing, ending, reopening or deleting a record. Asks for the reason in a dialog |
| `LinkPicker`, `LinkedItem` | `link-picker.tsx` | Linking records to each other and removing the link |
| `SupplierFields`, `AssetFields`, `IncidentFields`, `NonconformityFields`, `DocumentFields` | `supplier-fields.tsx`, `asset-fields.tsx`, `incident-fields.tsx`, `nonconformity-fields.tsx`, `document-fields.tsx` | A record's fields. Go inside a form: the create page's, or an `EditDialog` |
| `EvidenceTable`, `EvidenceForm` | `evidence-table.tsx`, `evidence-form.tsx` | Evidence on the Evidence page and on an SoA entry. The form is a dialog |
| `CopyLink` | `copy-link.tsx` | An invitation link, shown once |
| `Field`, `FieldGrid`, `FieldSection` | `field.tsx` | Label and control, a grid of them, and a titled group of them: a card on a page, plain inside a dialog |
| `Facts`, `Fact` | `facts.tsx` | A record's read-only view, laid out like `FieldGrid`. `wide` for notes; `empty` names a missing value |
| `FormDialog`, `FormDialogBody`, `FormDialogFooter` | `form-dialog.tsx` | A form in a dialog. Render it only while open, so it starts from the record as it is. The form inside takes `className="contents"` |
| `EditDialog` | `form-dialog.tsx` | The Edit button on a record's page and the dialog it opens. Posts the fields with intent=save, and closes once saved |
| `InvitationDialog` | `invitation-dialog.tsx` | Creates an invitation link and shows it in the dialog, once |
| `EntryPage` | `entry-page.tsx` | Pages outside the app: claim, sign-in, invitation |
| `ClerkSignIn` | `clerk-sign-in.tsx` | Clerk's sign-in, inside an `EntryPage` |
| `DetailLayout` | `detail-layout.tsx` | Main column with a side column that drops below it |
| `MainCell`, `DataCell`, `Ref`, `RecordLink`, `TextLink` | `table-parts.tsx` | Cells and links inside registers |

`Sheet`, `Separator` and `Tooltip` are installed as parts of `Sidebar`. `DropdownMenu` keeps only the parts we use; add more from shadcn when one is needed. Icons are [Lucide](https://lucide.dev): 16 px beside text, in `currentColor`.

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
