# GPTBot Market marketing and acquisition kit

Status: launch system prepared; outreach, ads and public marketplace launch are
not authorized.

## Core messages

- Category: Telegram product-finding assistant for connected local-store
  catalogs.
- Buyer: “Напишите, что Вам нужно, — GPTBot найдёт подходящие товары в
  каталогах подключённых магазинов.”
- Seller: “Подключите проверенный каталог — GPTBot поможет покупателям находить
  подходящие товары и передаст Вам запросы, где нужен человек.”
- Partner explanation: GPTBot Market is a controlled discovery and request
  layer over verified store catalogs; the store remains merchant and fulfils
  the request.
- Thirty-second explanation: a buyer writes a need, receives a grounded
  shortlist with source/price/stock, compares known facts and can send one
  request. GPTBot does not take payment; a verified seller handles the next
  step.

Full RU/UZ message rules, objections and prohibited claims are in
`GPTBOT_MARKET_POSITIONING_RU_UZ.md` and `GPTBOT_MARKET_TRUTH_MATRIX.md`.

## CTA library

| Stage | Buyer | Seller |
| --- | --- | --- |
| Awareness | Открыть демо в Telegram | Узнать о подключении |
| Consideration | Посмотреть, как работают факты | Проверить готовность магазина |
| Conversion | Найти товар | Подать заявку на пилот |
| Recovery | Изменить запрос / Спросить продавца | Связаться с support owner |
| Trust | Открыть центр доверия | Прочитать правила проверки |

Uzbek CTA drafts are mapped in the positioning document; native sign-off is
still required.

## Seller Pilot #1 offer

Suitable for one verified seller in a low-regulatory-risk category with a
small, clear SKU set, integer UZS prices, an opening stock baseline and named
operational owners. The seller supplies approved data/photos, fulfillment and
payment methods handled outside GPTBot. GPTBot supplies controlled catalog
ingestion, buyer discovery, request routing, questions and exact available
counters. The offer excludes payments, escrow, logistics, guaranteed sales,
self-service authorization and public marketplace exposure. Duration, fee,
SLA and outcome are deliberately blank until owner validation.

## Outreach templates — do not send

Founder to seller:

> Мы готовим закрытый пилот Sotuvchi by GPTBot для одного проверенного
> каталога. Покупатель описывает потребность в Telegram; GPTBot показывает
> только подтверждённые товары и передаёт продавцу вопросы или заявку. Оплата и
> выполнение остаются у магазина. Если формат релевантен, пришлём чек-лист
> готовности; подключение возможно только после проверки.

Partner introduction:

> GPTBot Market — не публичный marketplace. Это Telegram-слой поиска по
> подключённым каталогам. Сейчас готов owner-assisted pilot package без
> реального seller activation. Ищем подходящего проверенного продавца, а не
> массовый трафик.

Seller launch post template:

> Теперь часть нашего согласованного каталога можно искать через GPTBot.
> Данные о цене и наличии поступают из магазина. Оформление в боте — заявка, а
> не оплата; подтверждение, доставка и оплата согласуются с нами напрямую.
> [APPROVED DEEP LINK]

## Acquisition architecture

Deep-link convention: `agent_<opaque-storefront-code>` remains the trusted
runtime route. Campaign identity must stay outside the opaque storefront code:
use privacy-safe analytics source fields from the closed allowlist and a
release-owned mapping such as `seller_launch_telegram`, `seller_launch_instagram`,
`in_store_qr`, `partner_intro`, `gptbot_pilot_diary`. Never encode merchant
name, Telegram ID, phone or campaign free text in the start payload.

Prepared formats:

- seller Telegram and Instagram launch copy;
- in-store QR frame using the brand master and approved deep link;
- GPTBot channel pilot diary template: preparation, catalog truth, first
  controlled demo, limitations, real result only after evidence;
- founder and partner introductions above.

## Content backlog

| Item | Audience / channel | CTA | Proof owner | Metric |
| --- | --- | --- | --- | --- |
| Product-finding demo | buyer / Telegram, Reels | open demo | product owner | tagged start → useful result |
| Where price/stock come from | buyer / carousel, web | Trust Center | catalog owner | product view / trust visit |
| Human when needed | buyer / Story | ask seller | support owner | handoff |
| Seller daily cockpit | seller / one-pager | pilot application | pilot owner | qualified application |
| Pilot transparency | partner / channel post | review package | release owner | qualified introduction |
| Comparison literacy | buyer / carousel | compare | product owner | compare |
| Privacy and responsibility | all / web | Trust Center | privacy owner | support rate |
| Catalog preparation | seller / checklist | prepare inputs | catalog owner | catalog accepted |

Each public item needs RU and Uzbek Latin. Uzbek publishing waits for native
review. No city doorway, unsupported category, fake case-study, empty
marketplace or programmatic supply page is authorized.

