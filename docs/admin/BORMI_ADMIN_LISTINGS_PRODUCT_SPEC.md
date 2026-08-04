# Bormi Admin · ADMIN-3A product spec

Date: 2026-08-04
Stage: **ADMIN-3A · Listings and Categories — Read-only Operations**
Branch: `feature/bormi-admin-listings`

The principle this stage was built under: **visibility and diagnosis first,
commands second.** No publish, archive, unpublish or edit control exists here —
not even a disabled one — until the read model, the filters, the preview and the
data truth have been proven against real contracts.

## 1. The questions the screen answers

In this order, within the first screen:

1. How many listings exist.
2. How many are published, drafts, archived.
3. How many need a person, and why.
4. How to find one specific listing.
5. Which store and category it belongs to.

Anything that does not answer one of those is below the fold or not there.

## 2. Information architecture

```
ОБЗОР        Командный центр
КОНТЕНТ      Объявления          ← new
             Категории           ← new
ПРОДАВЦЫ     Магазины и доступы
БЕЗОПАСНОСТЬ Аудит
СИСТЕМА      Состояние
```

Routes, following the existing router contract (basename `/admin`):
`/listings`, `/listings/:id`, `/categories`.

Nothing was added for a stage that has not happened: no Модерация, Медиа,
Пользователи, Заказы or QuickPost entry. A test asserts their absence.

## 3. Listings screen

**Header** — title, the read-only sentence, freshness, refresh. The synthetic
badge is the shell's and is always present in a fixture build.

**Attention strip** — shown only when something needs attention, with the four
counts that make it actionable. Absent at zero.

**Four tiles** — всего, опубликовано, черновики, в архиве. A decomposition of
one number, so none of them is a decorative zero. Two columns at 320px: four
full-width tiles filled the entire first screen and pushed the catalogue below
the fold.

**Filter panel** — a disclosure, open on a wide screen and closed on a phone,
with the active-filter count in the summary line.

Deviation from the brief, recorded: the brief asked for a bottom sheet or drawer
on mobile. This is a `<details>` disclosure instead. It is keyboard-operable and
announced as expandable by the browser itself; a hand-built drawer would need a
focus trap, an Escape handler and a focus restore to arrive at the same place,
and every one of those is a thing to get wrong. The goal — the table is visible
immediately on a phone — is met.

**Table** (≥768px) — thumbnail-free by design; the photo count is a word in the
name cell, because a 40px thumbnail of a product photo tells a reader less than
"без фотографии" does. Columns: название, категория, магазин, цена, наличие,
статус, качество, изменено, действие. No primary id: it lives in the detail's
technical section.

Column widths are set explicitly. Nine columns of automatic width gave the
longest content the least room — the product name wrapped to three lines while
the quality reasons took the space.

**Cards** (<768px) — the same fields, stacked. A nine-column table at 320px is a
table nobody reads.

**Pagination** — 25 per page, labelled `nav`, with an `aria-live` count.

## 4. Listing detail

A page, not a drawer. The drawer that Audit uses is right for one event with six
fields; this carries a buyer preview, a gallery, diagnostics and a metadata
section, and at 320px a drawer holding that is a page with extra steps.

Sections: buyer preview · main fields · photos · quality · description and
specifications · technical fields (collapsed).

**No actions.** Not disabled ones. A greyed-out publish button still tells the
reader the capability is on this screen and merely withheld, and the next
session only has to remove an attribute.

## 5. Buyer preview

Rendered **by the buyer's own presenter**, server-side: `formatBuyerPrice`,
`formatBuyerAvailability` and `boundedBuyerDescription` from
`functions/agents/sotuvchi/buyer/cards.ts` — the same functions the Mini App
renders with. The admin screen prints what the server produced; it does not
format the raw columns a second time.

This is what caught the price defect. The admin's own `money()` divided by 100
while the buyer's presenter did not, so the panel had been showing every price
at a hundredth of the quoted value. Two implementations of the same thing agree
until they don't; one implementation cannot disagree with itself.

The preview shows only what a buyer sees: photo, name, price, availability,
category, description, store. It invents no views, rating, verified badge,
delivery, discount or popularity, and a test enumerates those by name.

Difference from the Mini App, recorded honestly: this is the admin's own layout
using the buyer's *data and formatting*, not the Mini App's React component. The
admin app cannot import from the Mini App bundle — separate app, separate design
system — so the shared contract is the presenter, which is where the business
meaning lives. The visual arrangement differs; every string does not.

## 6. Categories screen

Justified, and here is the justification: it is the only place that shows which
categories are empty, which hold only drafts, which are full of photo-less
cards, and how many products belong to no category at all. The Command Center
knows one number of that set. The listings table can be filtered to find each
one by hand, one filter at a time.

Read-only. No create, rename, merge, reorder or delete: those change what buyers
browse and what a seller has organised, and they need a domain and security
stage of their own.

Products with no category appear as one synthetic row, marked as not a real
category, because that is the answer to the question the screen exists to ask.

Diagnostics are stated, never judged: "Пустая", "Только черновики и архив",
"N без фото". No category is called bad.

## 7. Vocabulary

No raw key reaches a screen. `draft/published/archived`,
`available/unavailable/preorder` and `good/needs_attention/incomplete` all have
Russian labels, and `label()` falls back to the key itself rather than to
`undefined` when a value is unmapped.

Status is carried by a word, with colour as the second signal. No status is
colour-only.

## 8. States

| State | Listings | Detail |
|---|---|---|
| Loading | tile and table skeletons | two-column skeleton |
| Empty, no filters | "Объявлений пока нет" | — |
| Empty, filtered | "По этим фильтрам ничего не найдено" + reset | — |
| Error | code + retry | code + retry |
| Not found | — | safe 404 with a link back, filters preserved |
| Stale | previous data stays, freshness + refresh | same |

Filters survive opening a card and coming back: the row link carries the current
query string, and the detail's back link sends it on.

## 9. Out of scope, deliberately

Publish, archive, unpublish, edit, delete, bulk actions, moderation, seller
impersonation, direct D1 from the browser, migrations, feature-flag editing,
product analytics, views, conversion, revenue, AI, QP-1B, QP-2.

Also out, and for a stated reason rather than an oversight: sorting and
filtering by "обновлено" (no index covers `updated_at`; see the data contract),
and stock levels (`sotuvchi_inventory` exists but joining it would cost a lookup
per row for a number `availability` already summarises).

## 10. Next

**ADMIN-3B · Controlled Listing Commands.** Not started. Its scope, when the
owner opens it: publish, archive, unpublish — each with a closed-list reason, a
typed confirmation for the destructive ones, an idempotency key, an
`owner_audit_events` row and a rollback path. Note the blocker already on
record: `owner_audit_events.action` has a CHECK that allows five verbs, so any
new audited verb needs a migration.
