# GPTBot Market visual QA

Status: immutable production visual matrix passed for deployment
`68747046-8e1e-492a-8b81-dc4e4065916f`, 2026-08-01.

## Reviewed surfaces

- RU: 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1728px.
- Uzbek Latin: 390 and 1440px.
- Trust Center: RU mobile and desktop.
- 404: mobile and desktop.
- visible keyboard focus and reduced-motion context.
- 200% zoom reflow equivalent at a 360px layout viewport.
- RU OG preview at 1200×630.

All final captures and a contact sheet live in
`docs/agents-platform/evidence/gptbot-market-productization-2026-08-01/`.

## Verdicts

| Area | Verdict | Evidence |
| --- | --- | --- |
| Brand hierarchy | pass | mark/wordmark stay legible from mobile to wide |
| Buyer-first comprehension | pass | promise, example query and demo precede seller pitch |
| Synthetic truth | pass | demo/not-real-store label adjacent to cards |
| Commerce proof | pass | media, integer UZS, stock, source, freshness, match reason |
| Request clarity | pass | dark timeline repeats request-not-payment and next actor |
| Seller path | pass | separate verified-catalog pitch and exception-first cockpit |
| RU/UZ structural parity | pass | same IA, cards, comparison, seller, facts and FAQ |
| Mobile layout | pass | no overflow at all nine checked widths; header CTA hides only at 320px while hero CTA remains |
| Focus/reduced motion | pass | visible focus capture; reduced-motion audit zero failures |
| Error surface | pass | centered noindex 404, measurable solid contrast, clear recovery |
| OG | pass | final CTA fully visible after width/font correction |

## Before / after

Before productization, the public surface read as a long technical service
article with conflicting self-service seller and analytics claims. The final
surface is an editorial commerce narrative with two explicit paths, grounded
synthetic proof, Trust Center and a compact pilot CTA. Earlier baseline captures
remain in the same evidence folder; `*-final` files are the release candidates.

## Known visual evidence gaps

- Telegram runtime screenshots require the owner UX canary after deployment.
- Authenticated Owner Control Center views require an authorized session; no
  protected state was fabricated.
- Real seller/category photography and proof do not exist before Store Pilot #1.
- Human screen-reader and native Uzbek reviews remain separate gates.

