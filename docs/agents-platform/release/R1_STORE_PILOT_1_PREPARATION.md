# R1 Store Pilot #1 — preparation package

Date: 2026-08-01.
Status: prepared and rehearsed against synthetic data only. **No real store is
onboarded, no real product is imported, no payment is enabled and no public
marketplace is launched.** Nothing here authorizes connecting a real seller.

Engineering is not the blocker. Everything outstanding is a business input the
owner has to supply, listed in section 9.

## 1. What "pilot" means here

One consented, verified seller. 10–30 approved real products. Real buyers may
place real orders in Telegram, and the seller fulfils them outside the
platform. GPTBot takes no money, holds no custody, runs no escrow and promises
no delivery it cannot read from D1.

Fewer than 10 products is not a catalogue a buyer can search. More than 30 is
more than one person can approve line by line before launch. Both bounds are
enforced by the import validator, not by convention.

## 2. Seller consent checklist

Record each item before any store is created. All of it is business evidence,
not a database write.

- [ ] Legal or trading name of the business, and the person who signs for it.
- [ ] Written consent to participate in a supervised pilot, with a date.
- [ ] Consent that buyer name, phone and address entered in Telegram are
      forwarded to the seller for fulfilment, and to nobody else.
- [ ] Acknowledgement that GPTBot processes no payments and holds no funds.
- [ ] Acknowledgement that prices, stock and specifications shown to buyers are
      exactly what the seller supplied, and that correcting them is the
      seller's responsibility.
- [ ] Agreement that the pilot can be paused by either side at any time.
- [ ] Named data-protection contact for buyer-data questions.

## 3. Seller Telegram identity verification

The seller's Telegram identity must be verified **out of band** and bound only
to their own store. The platform will not infer it.

1. The owner obtains the seller's Telegram username from the seller through a
   channel already known to be theirs (an existing business phone or email),
   never from an inbound message claiming to be them.
2. The seller starts `@gptbot_market_bot` and completes onboarding themselves,
   from the account that will operate the store.
3. The owner confirms in the Owner Control Center that the new store's owner
   identity matches the expected seller and no other store shares it.
4. Only then is the store activated as a pilot store.

Store-scoped authorization is already enforced: a seller can only read and act
on orders in their own store, and cross-tenant access is masked as not found.
Verification protects against binding the *wrong human*, which no code check
can do for us.

## 4. Store onboarding form

The seller answers four questions inside Telegram. These are the only store
fields the onboarding flow accepts.

| Field | Accepted values |
| --- | --- |
| Store name | 2–120 characters, not a bare URL |
| Primary locale | `ru` or `uz` |
| Delivery mode | `pickup`, `delivery` or `both` |
| Payment methods | one or more of `cash`, `card_transfer`, `cash_on_delivery` |

`card_transfer` and `cash_on_delivery` describe how the seller settles with the
buyer directly. They do not enable any payment integration in GPTBot.

Alongside them the owner records, outside the bot: seller response SLA, support
owner and incident owner. The import validator refuses a file that leaves any
of those empty.

## 5. Product import template

Template: `fixtures/market/store_pilot_1_import_template.json`.

Copy it, replace every placeholder, set `isTemplate` to `false`, then validate:

```bash
npx tsx scripts/market/validate-pilot-import.ts <your-file.json>
```

The validator imports the same normalizers the catalog service uses, so it
cannot drift from what production accepts. It is read-only and touches no
database, no network and no credential.

### 5.1 Required product fields

| Field | Rule |
| --- | --- |
| `key` | unique within the file; used only to link products to categories |
| `categoryKey` | must match a declared category |
| `name` | 2–120 characters, not a bare URL |
| `priceMinor` | **integer UZS only** |
| `currency` | `UZS` — the only accepted value |
| `availability` | `available`, `unavailable` or `preorder` |
| `onHand` | non-negative integer opening balance |

### 5.2 Optional product fields

| Field | Rule |
| --- | --- |
| `sku` | uppercase `A-Z 0-9 . _ / -`, ≤64 chars, starts alphanumeric, unique in the store |
| `description` | ≤600 characters |
| `searchTerms` | ≤12 terms, ≤60 characters each |
| `specifications` | ≤12 entries; label ≤40, value ≤100 characters |
| `mediaRefs` | ≤5 references, see 5.4 |

### 5.3 Integer UZS validation

Prices are integers of UZS. The validator refuses `50000.5`, `"50000"`,
negative values and anything above 1,000,000,000,000. There are no decimals, no
thousands separators, no ranges and no "from" prices. A price the seller cannot
state as one exact integer is not ready for the pilot.

### 5.4 Images — read this before collecting anything

**Image URLs are not supported and must not be collected.** A media reference
must match `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, which contains no `/`, so any
`http://` or `https://` URL is rejected by the catalog contract.

Product images are Telegram photo `file_id` values. The practical consequence
for pilot preparation: ask the seller to send each product photo to the bot and
capture the resulting `file_id`, or launch with `mediaRefs: []` and add photos
after onboarding. Do not ask the seller for a spreadsheet of image links — that
work would be thrown away.

Launching without images is acceptable. The current synthetic catalogue runs
with 11 of 36 products carrying a media reference.

### 5.5 Category mapping

Categories are per store, declared in the same file, and each product points at
one by `key`. Two to six categories is the workable range for 10–30 products.
A product whose `categoryKey` matches nothing is refused.

### 5.6 Inventory baseline

Every product needs an opening `onHand` before a seller can confirm an order
against it: an available product without a balance fails closed at confirm
time. Record who is responsible for correcting balances, and how quickly.

### 5.7 Catalog preview

Before launch, review in the Owner Control Center: category list, every product
card in RU and UZ, prices as integers, availability labels, and that no
specification states anything the seller did not supply. An absent
specification is rendered as unknown and is never invented.

## 6. Operating agreements

| Item | To agree before launch |
| --- | --- |
| Seller response SLA | Target minutes to first reply to an order or question, and the working hours it applies in |
| Support owner | Who answers buyers when the seller does not |
| Incident owner | Who is called when something is wrong with orders, stock or the bot |
| Escalation path | How the incident owner reaches the platform owner |
| Daily review | Who checks orders, handoffs and inventory drift each day of the pilot |

## 7. Pause and rollback

- **Pause the pilot.** The store lifecycle supports suspension from the Owner
  Control Center; a suspended store stops serving buyers and its products stop
  resolving.
- **Roll back the application.** Redeploy the recorded previous deployment. The
  current rollback target is `af73edd9-1c90-418d-83d7-c79d81ae2888` at source
  `a542052`.
- **Data.** Pilot orders are real business records. Pausing does not delete
  them. Any deletion is a separate, explicitly authorized decision.

## 8. Hard stops

Stop the pilot immediately, and do not restart it without the owner, if any of
these occur:

- a buyer's contact data reaches the wrong store;
- a seller can see or act on another store's orders;
- one buyer action produces two logical orders;
- stock is decremented twice for one confirmation;
- a seller notification is lost or duplicated in a way that affects fulfilment;
- the bot states a price, stock level or delivery promise that is not in D1;
- a credential is exposed anywhere;
- the Telegram bot identity does not verify as `gptbot_market_bot`.

## 9. Exactly what is still needed from the owner

This is the complete list. Nothing else blocks Store Pilot #1.

1. **The seller.** Business name, the person who signs, and their Telegram
   username obtained through a channel already known to be theirs.
2. **Recorded consent.** Section 2, signed and dated.
3. **The products.** 10–30 approved items with, for each: name, category,
   integer UZS price, availability, opening stock, and optionally SKU,
   description, RU/UZ search synonyms and verified specifications.
4. **Photos, or an explicit decision to launch without them.** If photos are
   wanted, the seller sends them to the bot; URLs cannot be used.
5. **Store settings.** Primary locale, delivery mode, payment methods.
6. **Operating agreements.** Seller response SLA, support owner, incident
   owner, escalation path and who runs the daily review.
7. **Explicit authorization to onboard a real store.** Separate from everything
   above, and required before any production write.

## 10. Rehearsal evidence

`tests/store-pilot-1-rehearsal.test.ts` runs the whole path against an
in-memory SQLite fixture with obviously synthetic data. 8/8 pass:

- the shipped template is refused until it is filled in — it is flagged as a
  template, fails the 10–30 product rule, and fails the unverified-seller and
  missing-consent checks;
- a complete synthetic 12-product import passes the contract;
- the contract refuses the mistakes that actually matter: a fractional price, a
  price as a string, a negative price, a non-UZS currency, negative opening
  stock, an image URL in `mediaRefs`, an unmapped category, an unverified
  seller identity and missing consent;
- a duplicate SKU inside one import is refused;
- onboarding plus import produces one store, two categories and twelve
  products, every price stored as an exact integer;
- one supervised order runs end to end: RU and Uzbek Latin search both reach
  the catalogue, checkout places the order, exactly one durable seller intent
  is recorded, stock does not move before confirmation, confirmation
  decrements exactly once, a repeated confirm never decrements again,
  completion reaches `done`, and no payment surface appears anywhere;
- a buyer handoff opens with exactly one pending seller notification and
  closes;
- teardown removes child rows before parents, so the foreign keys hold.

No production data was created, read into the fixture, or modified.
