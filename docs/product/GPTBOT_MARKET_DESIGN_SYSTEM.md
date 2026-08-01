# GPTBot Market design system — Warm Market Signals

Version: 1.0, 2026-08-01.

## Intent

Warm Market Signals makes catalog facts calm and legible while reserving one
small coral signal for the next item that needs attention. It is product-led,
not a Telegram clone and not a generic “AI” visual language.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--market-ivory` | `#FFF8EC` | primary canvas |
| `--market-paper` | `#FFFDF7` | elevated cards |
| `--market-ink` | `#1D1A17` | primary text |
| `--market-muted` | `#625B52` | secondary text |
| `--market-teal` | `#0B3B36` | primary actions and trust surfaces |
| `--market-teal-2` | `#164E47` | teal hover/secondary surface |
| `--market-coral` | `#B83F2D` | one active signal, warning or seller CTA |
| `--market-sand` | `#E8DCCB` | section separation |
| `--market-line` | `#D8CDBD` | borders and table rules |
| `--market-focus` | `#156BFF` | three-pixel keyboard focus |

Status never relies on color alone. Every status carries a label and, when it
changes the next action, explanatory text.

## Type and numbers

- Geist variable is the product face for Cyrillic and Latin.
- Browser body copy starts at 16px; explanatory copy uses 1.05rem with 1.6+
  line height.
- H1 uses balanced wrapping and a fluid clamp, never an ultralight weight.
- UZS prices and operational counters use tabular numerals.
- Interfaces must remain readable and operable at 200% browser zoom.

## Spacing and shape

- 8px base rhythm; component spacing is expressed in 0.5rem increments where
  practical.
- Compact control: minimum 44×44px. Primary controls are 48px or taller.
- Three radii: 12px utility, 20px card, 32px flagship composition.
- Shadows are used only on the main demo or seller cockpit, not every card.

## Core components

- Brand header with buyer, seller, trust and FAQ destinations.
- Buyer query bubble that reflects interpreted constraints.
- Product card with synthetic/live label, media, title, integer UZS price,
  availability, source store, match reason and no more than two primary
  actions in Telegram.
- Comparison table with 2–3 factual dimensions and explicit missing data.
- Request timeline naming the next actor and repeating “request is not
  payment”.
- Seller cockpit ordered by exceptions before totals.
- FAQ button with `aria-expanded`, controlled region and no-JS visible answer.
- Trust article with role table, complaint path and legal-review disclaimer.

## Brand mark

The mark is a three-line catalog signal with one coral selection point. It is
not a robot, brain, shopping cart, coin, OpenAI knot or Telegram imitation.

Safe area: keep at least one quarter of the mark width clear on every side.
Minimum digital size: 24px for the mark; 150px wide for the full wordmark.

Use:

- dark wordmark on ivory/paper;
- light wordmark on deep teal;
- mono only where color is unavailable;
- supplied avatar inside its original safe area.

Do not:

- recolor the coral selection point as a success state;
- add a bot face, sparkles, cart handle, OpenAI or Telegram geometry;
- place the wordmark on noisy product photography without a solid field;
- compress, skew, outline or recreate the lettering with another typeface.

## Accessibility contract

- WCAG 2.2 AA target: normal text 4.5:1; large text and UI boundaries 3:1.
- Skip link targets `#main`.
- Focus follows DOM order and stays visible above sticky UI.
- Interactive targets are at least 44px.
- FAQ buttons expose `aria-expanded` and `aria-controls`; regions carry
  `aria-labelledby`.
- Product imagery that adds no new information is `alt=""` and hidden from
  assistive technology; factual content remains text.
- `prefers-reduced-motion: reduce` collapses animation and transition timing.
- No screen-reader certification is claimed until a human VoiceOver/TalkBack
  pass is performed.

## Source and exports

Editable SVG masters and raster exports live in `public/assets/market/`.
The synthetic product photograph was generated for this demo and is not a
real catalog item. Prompt provenance is recorded in the creative asset index.
