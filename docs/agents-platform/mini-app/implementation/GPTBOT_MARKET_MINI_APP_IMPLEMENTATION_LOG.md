# GPTBot Market Mini App implementation log

Mode: owner-independent implementation through MA-8 synthetic candidate.

Branch: `feature/gptbot-market-mini-app-synthetic-candidate`.

Started: 2026-08-02.

## Mandatory skill record

### UX/UI

- Exact skill: `app-ui-design`.
- Main instructions:
  `C:/Users/Borinio/.agents/skills/app-ui-design/SKILL.md`.
- Extended references read:
  `reference/extended.md`, `reference/ios-guidelines.md`,
  `reference/material-design.md`, `reference/accessibility.md`,
  `reference/color-theory.md` and `templates/design-system-template.md`.
- Applied methods: user-first IA, semantic design tokens, 8-point spacing,
  one-primary-action hierarchy, 44/48 px touch targets, WCAG 2.2 AA,
  keyboard/screen-reader semantics, 200% text resilience, meaningful motion,
  reduced-motion support, light/dark tonal surfaces and complete async states.
- Stages: MA-2 design foundation; MA-3–MA-6 buyer/seller journeys and component
  composition; MA-7 visual/accessibility/usability QA; MA-8 device/state proof.

### 21.dev

- Exact installed skills:
  `C:/Users/Borinio/.codex/skills/21st-ai/SKILL.md`,
  `21st-cli-use/SKILL.md`, `21st-design-sync/SKILL.md` and
  `21st-registry/SKILL.md` in the same skills root.
- Applied methods: search the current component catalog before hand-writing;
  study interaction anatomy rather than paste source; treat AI takes as design
  specs only; evaluate dependency, WebView, localization, theme, accessibility
  and bundle cost before adoption.
- Stages: catalog/pattern research before MA-2; targeted card, input, sheet,
  tabs, navigation and state-pattern review before MA-3–MA-6; rejection and
  dependency record during MA-7.
- Explicitly out of scope: publishing a component/theme/profile or installing
  an outward-facing registry item. `21st-design-sync` and `21st-registry` are
  read but not executed because the owner did not authorize public publishing.

## Initial pattern decisions

- Adapt, do not paste, catalog patterns.
- Prefer native semantic React/CSS primitives when a catalog pattern adds a
  runtime dependency without measurable user value.
- Reject generic dashboards, desktop sidebars, hover-only actions, nested
  carousels, glass over product imagery and gesture-only destructive commands.
- Use bottom navigation for buyer destinations, compact role-aware seller
  navigation, ordinary dialogs/sheets with focus management, and visibly
  labelled form controls.

## 21st.dev catalog research

- The installed CLI reached the service but could not search without an
  authenticated 21st.dev session or `TWENTYFIRST_TOKEN`. No login was started
  and no token was requested or exposed. Public catalog pages were used as the
  documented fallback.
- Product card anatomy adapted from the catalog: a stable media area, product
  name, factual price/availability, and one primary action. Carousels, ratings,
  "best seller" badges, wishlist affordances, hover shadows and conversion
  overlays were rejected because the current source of truth does not support
  those claims and Telegram WebView must remain touch- and keyboard-complete.
- Bottom navigation anatomy adapted: icon plus persistent text label and a
  clearly selected destination. Floating docks, sliding motion indicators and
  icon-only compact mode were rejected because they consume safe-area space,
  obscure content or weaken 200% text and reduced-motion behavior.
- Sheet anatomy adapted for bounded filters: labelled title/description,
  explicit apply/reset actions, focus management and a scrollable body.
  Desktop side drawers and nested multi-level navigation were rejected.
- Order-history anatomy adapted as a semantic ordered timeline with completed,
  current and pending states. Decorative animation and invented shipping
  milestones were rejected; the UI renders only lifecycle facts returned by
  the existing order domain.
- Sales-dashboard templates were reviewed and rejected. The seller home uses
  exact operational counts, work queues and direct safe actions instead of
  real-time charts, revenue claims or drag-and-drop management.

## Running status

- MA-0: complete — Git/repository/schema/production-doc preflight and ADR
  conflict check passed; implementation branch is isolated from `main`.
- MA-1: complete — shared Sotuvchi composition, official Telegram HMAC,
  short memory-only session and versioned BFF.
- MA-2: complete — isolated React/Vite package, Telegram adapter, RU/UZ,
  theme/safe-area tokens, offline shell and default-off capability flags.
- MA-3: complete — buyer catalog, search/filter, detail and comparison.
- MA-4: complete — checkout, buyer orders and handoff/recovery flows.
- MA-5: complete — verified seller dashboard, orders, questions, products and
  inventory reads with database-derived authority.
- MA-6: complete — versioned/idempotent order, handoff, product, category and
  inventory commands with notification dispatch reuse.
- MA-7: complete — responsive/light/dark async-state productization, zero axe
  violations or incomplete results, 320/390/200% geometry and bundle gates.
- MA-8: complete locally — reproducible build, contract/auth/regression tests,
  synthetic browser journeys, evidence manifest and rollback runbook.
- Production/BotFather/D1/public cutover operations: not authorized and not
  performed.

`UX_UI_SKILL_USED=YES`

`21_DEV_SKILL_USED=YES`
