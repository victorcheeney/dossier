# Design

Dossier's look is adapted from the visual foundation of [victorc.dev](https://victorc.dev), made into a working tool. Update this file with each design decision.

## Foundation

- **Canvas and type:** neutral white canvas, near-black text, true neutral greys (no warm or green tint). Instrument Serif for page titles only; Inter for everything else. Fonts ship as files in the repo, not as packages.
- **Color:** the interface is black, white and grey only. Buttons and links are black. The one exception is the Highlight color, which marks the person's own passages in a Posting.
- **Surfaces:** soft grey rounded cards (`card` at rest, `card-hover` on hover), thin rules, black pill buttons with a secondary chip-grey pill. Labels are black pills with no hover state.
- **Buttons:** an icon appears only on hover or keyboard focus; never a static arrow in a button.
- **Application page:** three columns filling the screen, each scrolling on its own: Posting and its tabs (left, at least 370px so the five tabs fit), the form (middle), the Résumé (right).
- **Profile page:** the document list on the left (280px) with word counts and a quiet Suggested list of missing starters; the selected document on the right with its name as an Instrument Serif title and its text in a monospace grey box.
- **Résumé:** one template (`public/resume.css`): a US Letter page, Inter 9.6pt, the name in Instrument Serif, uppercase grey section rules, dates right-aligned. The right column shows the page itself, scaled to fit, with no viewer chrome; a dashed line marks the end of page 1 when it overflows.
- **Motion:** transform and opacity only, short, and none with reduced motion.

## Tokens

| Token | Value |
| --- | --- |
| canvas, surface | #ffffff |
| card | #f8f8f8 |
| card-hover, chip | #f2f2f2 |
| ink | #0a0a0a |
| muted | #6b6b6b |
| rule, selection | #e5e5e5 |
| action | #171717 |
| action-hover | #333333 |
| focus | #525252 |
| radius-control | 6px |
| radius-panel | 12px |
| highlight, highlight-hover | #fff1a6, #ffe36e (Highlights only) |

| Role | Size |
| --- | --- |
| Page title | Instrument Serif, 40–56px |
| Section heading | Inter 18px / 500 |
| Body | Inter 16px / 1.65 |
| Small | Inter 14px / 1.6 |
| Label | Inter 13px, uppercase, 0.06em tracking |
| Caption | Inter 12px |
