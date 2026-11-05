# Nuvadesk design system (master)

The one source for colour, type, layout and motion in `dashboard/` and `site/`. Page files in
`pages/` override this for one surface only. Written from the frontend-design brief, with
UI UX Pro Max v2.15.0 as input (see "Inputs and what changed" at the end).

## Subject

- **What we make:** an AI front desk for dental and physio clinics, starting in Australia. It answers WhatsApp, SMS and web chat, books into the clinic's calendar, chases leads and hands tricky conversations to staff.
- **Who looks at it:**
  - **Dashboard:** practice owners checking whether it's worth the money, and office managers working through conversations and approvals between patients. Both are busy, not technical, and glance rather than study.
  - **Site:** clinic owners who are tired of missed calls, reading on a phone at night after close.
- **The moment the product exists for:** a patient messages at 9:47 pm, gets an answer, and wakes up booked. The design is built around the clinic **after hours**: the front desk is dark, and Nuvadesk is still working.

## Brand: "Bright & friendly" (v2, 2026-11-05)

v1 was eucalyptus and paper with Atkinson Hyperlegible Next. It read as calm but plain, and the owner asked for something friendlier, with a real logo and more interaction. v2 keeps the subject (the clinic after hours) and the layouts. It changes the palette, type and logo, and adds the interactive pieces listed under "Interaction".

## Logo

**N thread** (`design-system/nuvadesk/logo.svg`). The owner first picked Night bubble, then chose N thread instead on 2026-11-05.
- **Shape:** a teal rounded tile with a white lowercase "n" drawn as one continuous line, finishing in a marigold tick: a message comes in, and it ends booked.
- **Small sizes:** it holds up best of the three options at 16 px (browser tab, app icon).
- **Where it lives:** in components as `LogoMark` / `Wordmark` (`*/src/components/wordmark.tsx`).
- **Colours:** fixed in every theme: tile `#0B5D6B`, n `#FFFFFF`, tick `#F2B33D`. On dark backgrounds the tile gets a 1 px light-teal edge (`--brand` at 60%) so it stays visible against night. Theme-coloured versions lost the marigold tick on the light-teal dark tile.
- **Files:** favicon `src/app/icon.svg` and the 180 px `apple-icon.png`, in both apps.
- **Wordmark:** "Nuvadesk" in Bricolage Grotesque 700, -2.5% tracking, next to the mark.
- **Sizes:** don't use the mark below 16 px. Keep clear space of a quarter of the mark's width around the lockup.
- **Tick colour:** the tick is always marigold, the same colour as the "booked" moment in the product.

## Colour

Bright day pages in teal, mint and marigold. Dark mode is "after hours" night blue, not black.

| Token | Light (day) | Dark (after hours) | Use |
|---|---|---|---|
| `paper` | `#FBFBF8` | `#0E1C2B` | Page background |
| `surface` | `#FFFFFF` | `#15283B` | Raised panels, the conversation pane |
| `ink` | `#14252B` | `#EAF1F2` | Body text (15:1 on paper) |
| `ink-muted` | `#4F6168` | `#A6B6BC` | Secondary text (≥ 5.4:1, also on `brand-soft`) |
| `rule` | `#E1E7E6` | `#24394D` | Hairlines between figures, table rows |
| `brand` / `on-brand` | `#0B5D6B` / `#FFFFFF` | `#5CC3C9` / `#062A30` | Primary actions, links, the logo (7.5:1 / 7.3:1) |
| `brand-soft` | `#D8F1E8` | `#133A40` | Selected rows, search highlights, the assistant's chat bubbles |
| `highlight` / `on-highlight` | `#F2B33D` / `#2A1E00` | `#F5C25B` / `#2A1E00` | **The "booked" moment**: a filled slot, a confirmed booking, the logo dot. Fill only, never text on white. |
| `night` | `#10243A` | `#0A1622` | After-hours bands on the site (`.after-hours`), shadows |
| `signal` / `signal-wash` | `#8A4B00` / `#FDF0D5` | `#F5C25B` / `#2E2716` | Needs attention: open escalations, pending approvals (always with a label) |
| `danger` | `#B42318` | `#FF8A80` | Failures and rejections only |

All text/background pairs were checked with a WCAG contrast script (2026-11-05). Every text pair is ≥ 4.5:1 in both modes, and so are the site's night bands.

**Chart series** (regenerated for v2, all passing `validate_palette.js`: lightness band, chroma ≥ 0.10, CVD and normal-vision separation, ≥ 3:1 against surface):

| Token | Light | Dark | Result |
|---|---|---|---|
| `series-business` / `series-after` | `#008E88` / `#4549B0` | `#009B95` / `#7577E3` | Light: CVD ΔE 18.9, normal 22.1. Dark: CVD ΔE 13.8, normal 19.2. Pass. |
| `grade-hot` / `grade-warm` / `grade-cold` | `#00505A` / `#008E88` / `#6CC4BC` | `#9BE3DC` / `#3DB5AE` / `#1B6F6D` | Ordinal, one hue, monotone, light end ≥ 2:1. Pass. |

**Rules**
- **No raw hex in components.** Use the role tokens (`brand`, `brand-soft`, `highlight`, `night`, …). The only exceptions are the logo, whose colours are fixed, generated images (`opengraph-image.tsx`), which can't read CSS variables, and the static favicons.
- **One colour story in charts:** teal for business hours, indigo for after hours. Lead grades use one hue at three strengths, always labelled.
- **Ration marigold and amber.** Marigold means something got booked; amber means a person has to act. Neither is decoration.

## Type

- **Bricolage Grotesque** (OFL, variable, optical-size axis) is the voice: headings, the summary sentence, KPI figures, prices and the site display type.
  - It has warmth and character at large sizes, and its `opsz` axis tightens it for display and opens it up at UI sizes.
  - Use it for `h1`–`h3` and `.font-display`.
- **Figtree** (OFL, variable) is the reading face: body, UI, tables, forms.
  - It is friendly and round but plain, so long text and dense tables stay calm.
- Both are self-hosted through `next/font`, with no third-party requests.
- **Scale:** 1.25 ratio from 16 px.
  - **Dashboard:** 13 / 14 / 16 / 20 / 25 / 31.
  - **Site:** adds 39 / 49 / 61 for display.
- **Weights:**
  - Figtree: 400 body, 600 labels.
  - Bricolage: 700 headings and figures, 800 site display only, at -3% tracking.
- **Figures:** `tabular-nums` wherever numbers line up.
- **Line length and leading:** body ≤ 72 ch. Line height 1.5 for body, 1.08–1.15 for display.
- **Case:** sentence case everywhere. No all-caps labels, and no eyebrow labels above headings.

## Layout

**Dashboard: the day sheet.** Office managers think in day sheets, so the overview reads like one.

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ Harbourside│  Last 30 days ▾                         compare to prior 30   │
│ Dental  ▾  │                                                              │
│            │  Ava handled 286 enquiries and booked 141 appointments.      │  ← summary sentence = the headline
│ Overview   │  41% of enquiries came in after hours.                       │
│ Conversat. │                                                              │
│ Approvals 3│  286        141        27 / 31 / 12   9 s      4     $35,250  │  ← figures on a hairline grid,
│ Billing    │  enquiries  bookings   hot/warm/cold  median   escal. revenue │     not cards
│ Help       │  +12%       +8%                       reply             est.  │
│            │ ─────────────────────────────────────────────────────────────│
│            │  Enquiries per day (business hours | after hours)  [stacked]  │
│            │  ▁▂▃▅▃▂▆▇▅▃ …                                                 │
│            │ ┌───────────────────────────┐ ┌─────────────────────────────┐ │
│            │ │ When enquiries arrive      │ │ Reply time, median and p95  │ │
│            │ │ hour × weekday, open hours │ │                             │ │
│            │ │ outlined                   │ │                             │ │
│ ☾ After hrs│ └───────────────────────────┘ └─────────────────────────────┘ │
└────────────┴──────────────────────────────────────────────────────────────┘
```
- **Rail:** a left rail at 240 px, which collapses into a top bar with a sheet menu under 900 px.
  - The client switcher sits at the top of the rail.
  - Counts appear next to nav items that need action (approvals, open escalations).
- **Figures:** the KPI figures sit directly on the page, separated by hairline `rule`s. **No card per KPI.** Panels (`surface`, 8 px radius, a 1 px `rule` border and no shadow) are used only where the content is a distinct object: a chart, a transcript, a draft.
- **Memorable element:** the **"when enquiries arrive" heatmap**.
  - It's hour × weekday, with the clinic's opening hours outlined from `business.hours`.
  - It shows the owner, at a glance, the after-hours demand Nuvadesk is catching.
  - Everything else stays quiet.
- **Conversations:** a list on the left and the transcript on the right (stacked on mobile).
  - Customer turns sit left on `surface`. Assistant turns sit right on `brand-soft`. Staff turns sit right with the staff name.
  - System notes are centred small text.
- **Alignment:** left-aligned throughout. Numbers right-align in tables.

**Site: the evening read.**

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Nuvadesk          Packages  For clinics ▾  Case study  Blog   [Book a call]│
│                                                                           │
│  Your front desk,                         ┌──────── 9:47 pm ─────────┐    │
│  still answering                          │ Hi, is there anything     │    │
│  at 9:47 pm.                              │ tomorrow morning?         │    │
│                                           │      Yes, 8:15 with Dr    │    │
│  We install an AI front desk for          │      Chen. Shall I book?  │    │
│  dental and physio clinics in 14 days,    │ Yes please                │    │
│  so you never miss another patient.       │      Booked. See you      │    │
│                                           │      tomorrow at 8:15.    │    │
│  [Book a 20-minute call]  See pricing     └───────────────────────────┘    │
│                                           Tue  ░░▓▓░░  ← slot fills         │
├───────────────────────────────────────────────────────────────────────────┤
│  night band: "41% of clinic enquiries arrive after close"  (sourced claim)  │
│  How it works: 3 steps (a true sequence: discovery → 14-day build → live)  │
│  Packages with prices (A B C D + bundle), care plans in a plain table      │
│  ...                                                                      │
└───────────────────────────────────────────────────────────────────────────┘
```
- **Hero:** the type *is* the hero. The headline is set in Bricolage Grotesque 800 at 61 px or more, next to a live-looking transcript.
  - The single orchestrated motion moment: the messages arrive one by one and the calendar slot fills, once, about 2.5 s in total.
  - With reduced motion, the final state renders immediately.
  - The `HeroVideo` slot takes a looping video later. The poster is this static final state.
- **Sections** alternate `paper` and `surface`. One night-blue band carries the after-hours point.
- **Numbering:** used only where the content really is a sequence ("How it works").
- **Copy:** buttons say exactly what happens ("Book a 20-minute call", "See pricing"), with no `→` glyphs.

## Motion

- Motion (`motion/react`) only. **One orchestrated moment per surface:**
  - **Site:** the hero transcript and the calendar fill.
  - **Dashboard:** the KPI figures count up on first load, at most 600 ms.
- Motion that responds to the user is welcome:
  - a row expanding
  - the approve / reject confirmation
  - the rail sheet opening

  Use 150–250 ms ease-out.
- No scroll-reveal on every section, and no hover lift on cards.
- `prefers-reduced-motion: reduce` turns all of it off and renders the end state.

## Components and states

- **Focus:** a 2 px `brand` ring with a 2 px offset, always visible on keyboard focus.
- **Targets:** at least 44 × 44 px on touch.
- **Empty states** say what's empty and the next step, in the interface's voice:
  - "No conversations match 'invisalign' in the last 90 days. Try a shorter word, or clear the date filter."
  - "Nothing waiting for approval. New drafts from Freshdesk appear here."
- **Errors** say what happened and how to fix it. Never "Oops".
- **Loading:** skeletons shaped like the content. No spinners for whole pages.
- **Icons:** Lucide (SVG) where an icon earns its place. Never emoji. Every icon-only button gets an `aria-label`.

## Accessibility floor (both apps)

- **Contrast:** WCAG 2.2 AA (4.5:1 text, 3:1 large text and UI parts), checked in light and dark.
- **Keyboard:** full keyboard paths. A skip link. Visible focus.
- **Reduced motion and zoom:** respect reduced motion; zoom isn't disabled.
- **Layout:** works at 360 px with no horizontal scroll.
- **Charts** have a text summary (the summary sentence) and a data table toggle.

## Inputs and what changed

### v2 (2026-11-05)

UI UX Pro Max `--design-system` for "AI receptionist SaaS for dental clinics modern friendly interactive" suggested glassmorphism, trust blue `#2563EB` with an orange CTA, and Plus Jakarta Sans.

| Suggested | Kept / changed | Why |
|---|---|---|
| Glassmorphism | **Changed** to flat surfaces with soft brand fills | Frosted glass needs a busy background to read and costs contrast. The friendliness comes from colour, type and interaction instead. |
| Trust blue + orange CTA | **Changed** to deep teal + marigold | Blue + orange is the default SaaS pairing. The owner chose teal / marigold / mint / night. Marigold is kept for one meaning only: booked. |
| Plus Jakarta Sans (one family) | **Changed** to Bricolage Grotesque + Figtree | Jakarta is the tool's default for any SaaS. Bricolage gives headings a recognisable voice; Figtree keeps body text friendly and calm. They are clearly distinct, as frontend-design asks for a two-family system. |
| Toasts auto-dismiss in 3–5 s; skippable onboarding with Back; visible focus in overlays | **Kept** | Used for the approval Undo toast, the dashboard tour and the drawer and command palette. |

Checked again against frontend-design's default traits: the page background is a cool off-white (`#FBFBF8`), not cream; there is no terracotta, no near-black with an acid accent, no ALL-CAPS eyebrows, no `→` in buttons and no single-word headline accents. Panels keep hairline rules, with no shadows on cards.

### v1 (2026-11-04)

UI UX Pro Max `--design-system` was run for the dashboard ("healthcare clinic operations dashboard calm trustworthy data", density 8, motion 3) and the site ("B2B service agency landing healthcare clinics premium", density 3, motion 4).

| UI UX Pro Max suggested | Kept / changed | Why |
|---|---|---|
| Atkinson Hyperlegible for dashboard type | **Kept**, as the newer *Next* variable family for both apps | Legibility of times, numbers and names is the job. One family keeps the two surfaces related. |
| Neumorphism style | **Changed** to flat panels with hairline rules | The tool itself rates neumorphism high accessibility risk, and it's mushy for data. |
| Cyan `#0891B2` + health green | **Changed** to eucalyptus + dusk | Every dental site is teal/cyan. Eucalyptus is calm, Australian and specific. Dusk carries the after-hours story. |
| Site: navy + blue CTA, Figtree / Noto Sans | **Changed** | Navy plus a blue CTA is the default B2B look for any product. The site shares the dashboard's palette and type so the sales promise and the product look like the same thing. |
| Testimonial carousel, logo wall, stats strip | **Dropped for now** | No real clients yet. We won't invent testimonials, logos or results. The case-study page shows a labelled demo build. |
| Accessibility rules, reduced motion, 44 px targets, skeletons, no emoji icons | **Kept** | — |

Checked against frontend-design's default traits:
- no cream + terracotta
- no near-black + acid accent
- no identical rounded cards with soft shadows
- no all-caps eyebrows, no `A · B · C` meta strings, no `→` in buttons
- no monospace data labels
- no single-word italic headline accents
