# Design

## Direction

**Operations ledger.** The interface reads like a calm service desk: a compact slate
navigation rail, pale paper work surfaces, ruled data regions, and a cyan signal color
that marks action and live state. It is deliberately not a terminal costume, not a
card catalog, and not a black dashboard with neon accents.

## Palette

- `--canvas: #eef1f2` cool paper background
- `--surface: #f9faf8` primary work surface
- `--surface-raised: #ffffff` focused panels and overlays
- `--ink: #172126` primary text
- `--muted: #66757b` secondary text
- `--line: #d7dedf` structural rule
- `--rail: #15333b` navigation rail and high-trust context
- `--signal: #087f8c` action, current state, focus
- `--signal-soft: #d9f0f0` selected and highlighted states
- `--ok: #23865f` healthy state
- `--warn: #b56b16` degraded or attention state
- `--danger: #c44545` failure and destructive state
- `--info: #4669a8` neutral information

State colors are semantic only. The signal color is not used as decoration.

## Type

Use one legible sans family stack for all UI: `"IBM Plex Sans", "Segoe UI", "Microsoft YaHei", sans-serif`.
Use `"IBM Plex Mono", "Cascadia Code", Consolas, monospace` only for identifiers,
code, and tabular measurements. The scale is compact: 12, 13, 14, 16, 20, and 28px.
Headings use weight and spacing rather than oversized display type.

## Layout

Desktop uses a fixed 234px left rail and a fluid work area. The top of each page is a
context bar with title, current status, and page actions; it is not a decorative hero.
Content uses full-width ruled sections, tables, split work panes, and form grids.
Primary content is left aligned. Tables may scroll horizontally on small screens.

```text
+--------------+----------------------------------------------+
| product mark | page title            status        actions |
+--------------+----------------------------------------------+
| primary nav  | summary strip / alerts when needed           |
|              |                                              |
| status       | primary data region                          |
| account      |                                              |
|              | supporting detail                            |
+--------------+----------------------------------------------+
```

Mobile turns the rail into a compact horizontal control strip, keeps page actions
sticky below it, and converts wide tables into scroll regions. No element may overlap
or push the primary action outside its container.

## Components

- Buttons use a 6px radius, one icon vocabulary, and clear default, hover, focus,
  active, disabled, and loading states.
- Cards are reserved for individual repeated items, modals, or genuinely framed tools.
  Different page sections are unframed bands separated by rules and spacing.
- Tables are first-class: sticky headers, zebra-free ruled rows, tabular numerals,
  clear selected and hover states.
- Badges use a dot plus concise label. They do not substitute for explanatory state text.
- Inputs use a visible label, a 1px rule, and a cyan focus ring.
- Modals are compact; a right-side drawer is used for request-log detail.
- Alerts are inline, specific, and dismissible when transient. No left accent bars.

## Motion

Motion is limited to 160-220ms state feedback and one drawer transition. No page-load
choreography, no reveal-on-scroll, and no decorative looping animation. Reduced-motion
preferences remove transforms and transitions.

## Principles

1. The table is the interface; keep rows scannable at normal desktop distance.
2. One persistent action color makes primary controls easy to locate.
3. Failure states explain what happened, what is stale, and what the administrator can do.
4. Destructive actions are visually quiet until confirmed.
5. Every dense desktop layout has a mobile reading order, not merely a narrower canvas.
