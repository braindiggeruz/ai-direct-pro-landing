# GPTBot — Google Ads Negative Keywords (Documentation Only)

> Source: `screencapture-ads-google-aw-keywords-negative-2026-06-07-11_58_48.pdf`
> (snapshot of the live Google Ads campaign **GBTBOTUZ I TASHKENT I SEARCH**).
> This document is **read-only documentation** — no Ads account changes are
> made from code. It exists so future agents do not blindly suggest removing
> the curated negative-keyword list when running a holistic SEO + paid audit.

## 1. Campaign

- **Account**: GBTBOTUZ (Uzbekistan, Tashkent geo)
- **Campaign**: `GBTBOTUZ I TASHKENT I SEARCH`
- **Match strategy**: Mostly **Broad Match** for both positive and negative
  keywords, with selected Phrase and Exact for technical / B2C noise.
- **Bidding**: "Optimization goal: Learning strategy for setting bids"
- **Landing**: gptbot.uz money pages (RU/UZ) — same domain audited here.

## 2. Negative keyword list (campaign-level — DO NOT DELETE)

### 2.1 Broad Match (broad exclusion of noise)
```
оплата
porn
sex
free
forex
знакомства
россия
сша
порно
casino
ставки
```

### 2.2 Phrase Match (specific developer / DIY queries)
```
"создать чат бот бесплатно"
"openai api"
"создать бота бесплатно"
"шаблон бота"
"исходник бота"
"конструктор ботов"
"telegram bot api"
```

### 2.3 Exact Match (single high-intent technical queries)
```
[python бот]
[код бота]
[openai api]
[исходник бота]
[шаблон бота]
[botfather]
[конструктор ботов]
[токен бота]
[создать бота бесплатно]
```

## 3. Why these are kept

| Bucket | Reason |
| --- | --- |
| Adult content (`porn`, `sex`, `порно`) | Brand safety — never serve ads on adult intent. |
| Gambling / finance noise (`casino`, `forex`, `ставки`) | Irrelevant intent, very high competition → wasted spend. |
| Cross-border (`россия`, `сша`) | Campaign is Tashkent-targeted; cross-country traffic is wasted budget. |
| `оплата`, `free`, `знакомства` | Intent mismatch — visitors want free tools / dating, not a paid AI bot SaaS. |
| Developer DIY (`python бот`, `openai api`, `botfather`, `токен бота`, `конструктор ботов`, `шаблон бота`, `исходник бота`, `создать бота бесплатно`, `telegram bot api`, `код бота`) | These users want to **build** a bot themselves with code — not buy a managed AI bot service. Filtering them out is the single biggest spend optimization. |

## 4. SEO interaction with paid traffic

Because the paid funnel already filters out the developer/DIY noise above,
the **organic** SEO content on gptbot.uz can lean fully into the **business
buyer** intent without worrying about contradictory keyword signals from
paid landings.

Organic content should therefore:
- Stay heavy on business-buyer language (ROI, заявки, конверсия, обработка,
  расценки, кейсы) and **avoid** developer-coded language (SDK, API, token,
  webhook, `tsx`, `npm`).
- Reserve technical depth for the admin `/admin-tools/` area (`noindex`).
- Continue using `Article + FAQPage + BreadcrumbList` schema (already shipped)
  to compete in the **knowledge graph** lane vs the developer SERP lane.

## 5. Action items for the Ads owner (NOT for the code agent)

1. **Do not delete** any of the existing negatives during cleanup sprints.
2. After the campaign runs for ≥ 7 days, export the **Search terms report**
   and add any new high-cost / low-conversion queries (most likely candidates:
   `чат бот для школы`, `бот для игр`, `бот discord` — they appeared in the
   broad-match expansion in section 1 of the screenshot).
3. Consider adding a **shared library negative list** at the account level
   so the same list applies to any new campaigns (Display, Performance Max,
   YouTube) without duplication.
4. If a Discovery / PMax campaign launches, re-evaluate `free` — it sometimes
   correlates with legitimate trial intent ("AI бот бесплатная демо"). May
   be worth promoting to **Phrase Match** instead of pure Broad on Discovery.

## 6. What this repo does NOT touch

- ❌ Does not write to the Google Ads account.
- ❌ Does not change keyword match types.
- ❌ Does not silently shadow or duplicate any negative list.
- ❌ Does not add a robots.txt block for any of these queries — they are
  **paid signals**, not crawler signals, and the SEO funnel benefits from
  the same separation of concerns.

This file is informational. Treat it as a **paid + organic alignment record**
so future SEO agents do not accidentally undo paid hygiene when touching
content slugs or schema.
