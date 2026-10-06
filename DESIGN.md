# Design

## Direction

**Quiet glass control center.** A bright iOS-inspired operations console: a soft
system-gray canvas, white grouped panels, translucent toolbar materials, generous
but disciplined radii, Apple-like system colors, and one continuous bottom action
surface on mobile. It preserves the density and utility of the existing gateway
console while replacing the previous operations-ledger look completely.

## Palette

- `--ios-canvas: #f2f2f7` grouped background
- `--ios-surface: #ffffff` cards, sheets, and grouped rows
- `--ios-surface-2: #f7f7fa` inset controls and secondary panels
- `--ios-ink: #1c1c1e` primary label
- `--ios-ink-2: #3a3a3c` secondary label
- `--ios-muted: #8e8e93` tertiary label
- `--ios-line: rgba(60, 60, 67, 0.16)` separators
- `--ios-blue: #007aff` primary action and selection
- `--ios-green: #34c759` healthy
- `--ios-orange: #ff9500` attention
- `--ios-red: #ff3b30` destructive and failure
- `--ios-teal: #30b0c7` informational accent

State colors are semantic. Materials use translucent white and system blur only for
navigation, toolbars, sheets, and floating action surfaces.

## Type

Use the platform system UI stack, led by `-apple-system` and `SF Pro` where available,
then `Segoe UI`, `PingFang SC`, and `Microsoft YaHei`. The scale is compact and
hierarchical: 11, 13, 15, 17, 22, 34px. Display headings use 34px large-title
semantics on desktop and 28px on mobile. Numeric data uses tabular figures.

## Layout

Desktop keeps a persistent left navigation column, but it becomes a light translucent
surface rather than a dark rail. Content is a centered, wide grouped canvas with
large titles, rounded grouped panels, inset rows, and sheets that rise from the
bottom or right. Primary information remains left-aligned and scan-friendly.

```text
+------------------+-----------------------------------------------+
| account / brand  | large title                    toolbar actions |
| navigation       |                                               |
|                  | grouped panel                                 |
|                  | inset rows / tables / charts                  |
| status           | grouped panel                                 |
+------------------+-----------------------------------------------+
```

Mobile moves navigation into a translucent top strip and uses a floating bottom action
surface for primary actions. Sheets and alerts cover the viewport with one clear
dismiss affordance.

## Components

- Buttons use filled system-blue, tinted, bordered, or plain variants with 10-14px
  radii and 44px minimum touch height on mobile.
- Panels are grouped surfaces with one outer radius and inset separators; cards are
  not nested inside cards.
- Tables become inset grouped lists: no heavy header plates, stronger row rhythm,
  and readable text before hover.
- Badges use compact rounded labels with system semantic colors.
- Inputs use inset grouped fields, a 1px separator, and a blue focus ring.
- Sheets use a top grabber, large title, and bottom toolbar. The request log uses a
  right-side sheet on desktop and full-screen sheet on mobile.
- Alerts use filled system tints with a clear icon and close affordance.

## Motion

Use 180-240ms spring-like easing for sheets, selection, and state transitions. Respect
reduced motion. Avoid decorative page-load choreography.

## Principles

1. Calm materials carry the hierarchy; color is reserved for meaning.
2. Familiar iOS controls make dense operations feel immediately learnable.
3. Large titles orient the user before data begins.
4. Grouped rows keep scanning fast without losing the product's density.
5. Every destructive or write action has a clear state before it is confirmed.