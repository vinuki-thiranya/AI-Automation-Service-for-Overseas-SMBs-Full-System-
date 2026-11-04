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

## Colour

A eucalyptus and paper day palette. Dark mode is "after hours" dusk, not black.

| Token | Light (day) | Dark (after hours) | Use |
|---|---|---|---|
| `paper` | `#F6F7F4` | `#131B2E` | Page background |
| `surface` | `#FFFFFF` | `#1A2440` | Raised panels, the conversation pane |
| `ink` | `#18231F` | `#E9EEF5` | Body text (≥ 12:1 on paper) |
| `ink-muted` | `#55635D` | `#A9B4C6` | Secondary text (≥ 5:1) |
| `rule` | `#DCE3DE` | `#2B3757` | Hairlines between figures, table rows |
| `eucalyptus` | `#2F6B5A` | `#7FC4AE` | Brand, primary actions, the main series in charts |
| `gumleaf` | `#E2EEE8` | `#20393A` | Selected rows, the business-hours band, quiet fills |
| `dusk` | `#33407A` | `#AEB8F2` | After-hours activity: the second chart series, after-hours badges |
| `signal` | `#9A5B00` | `#F2B661` | Needs attention: open escalations, pending approvals (text-safe amber) |
| `danger` | `#B42318` | `#FF8A80` | Failures and rejections only |

**Rules**
- **No raw hex in components.** Use the CSS variables (`--paper`, `--ink`, …) mapped to Tailwind theme colours.
- **The two series:** eucalyptus means business hours and dusk means after hours. That's the one colour story the charts tell. Lead grades use eucalyptus (hot), dusk (warm) and `ink-muted` (cold), always labelled and never told by colour alone.
- **Signal amber is rationed.** It appears only where a person has to act.

## Type

- **One family: Atkinson Hyperlegible Next** (Braille Institute, OFL), variable 200–800, self-hosted through `next/font`.
  - It was designed so similar characters can't be confused: 0/O, 1/l/I. That matters for phone numbers, booking times and invoice amounts read in a hurry.
  - It looks plainly unlike the usual SaaS families.
- **Scale:** 1.25 ratio from 16 px.
  - **Dashboard:** 13 / 14 / 16 / 20 / 25 / 31.
  - **Site:** adds 39 / 49 / 61 for display.
- **Weights:** 400 body, 600 labels and table headers, 700 figures and headings, 800 site display only, set at -2% tracking.
- **Figures:** `font-variant-numeric: tabular-nums` wherever numbers line up (KPIs, tables, invoices).
- **Line length:** body ≤ 72 ch. Line height 1.5 for body, 1.15 for display.
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
  - Customer turns sit left on `surface`. Assistant turns sit right on `gumleaf`. Staff turns sit right with the staff name.
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
│  dusk band: "41% of clinic enquiries arrive after close"  (sourced claim)  │
│  How it works: 3 steps (a true sequence: discovery → 14-day build → live)  │
│  Packages with prices (A B C D + bundle), care plans in a plain table      │
│  ...                                                                      │
└───────────────────────────────────────────────────────────────────────────┘
```
- **Hero:** the type *is* the hero. The headline is set in Atkinson Next 800 at 61 px or more, next to a live-looking transcript.
  - The single orchestrated motion moment: the messages arrive one by one and the calendar slot fills, once, about 2.5 s in total.
  - With reduced motion, the final state renders immediately.
  - The `HeroVideo` slot takes a looping video later. The poster is this static final state.
- **Sections** alternate `paper` and `surface`. One dusk-coloured band carries the after-hours point.
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

- **Focus:** a 2 px eucalyptus ring with a 2 px offset, always visible on keyboard focus.
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
