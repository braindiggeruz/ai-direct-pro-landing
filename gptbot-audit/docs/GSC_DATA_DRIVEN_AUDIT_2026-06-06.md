# GPTBot — GSC Data-Driven Audit (2026-06-06, sessions 2)

**Property:** `sc-domain:gptbot.uz` (siteFullUser)
**Service account:** `nextbot-sheets@ai-direct-pro.iam.gserviceaccount.com`
**GSC API status:** ENABLED ✓
**URL Inspection API:** ENABLED ✓
**Last data fetch:** 2026-06-06

---

## 1. GSC totals (Search Analytics)

| Период | Clicks | Impressions | CTR | Avg position |
|---|---|---|---|---|
| 7 дней (2026-05-30 → 2026-06-05) | 0 | 91 | 0.00% | 7.07 |
| 28 дней (2026-05-09 → 2026-06-05) | 0 | 98 | 0.00% | 6.65 |
| 90 дней (2026-03-08 → 2026-06-05) | 0 | 98 | 0.00% | 6.65 |

> Реальная картина **существенно лучше**, чем 6 показов / pos 23 из исходного брифа. Сайт фактически набирает avg pos ≈ 7 на 91 показе за 7 дней. **CTR = 0% — главная аномалия:** показы есть, кликов нет ни одного.

---

## 2. Top pages by impressions (28d)

| Impr | Avg pos | Page | Status (URL Inspection) |
|---|---|---|---|
| 26 | 4.9 | `/` | PASS (indexed) |
| 25 | 3.8 | `/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/` | — |
| 23 | 4.0 | `/ru/blog/gpt-bot-vs-chat-bot/` | — |
| 18 | 2.1 | `/uz/biznes-uchun-ai-bot/` | PASS |
| 17 | 3.5 | `/ru/blog/kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy/` | — |
| 15 | 2.4 | `/ru/blog/telegram-bot-dlya-biznesa/` | PASS |
| 12 | 1.8 | `/uz/chat-bot-biznes-uchun/` | PASS |
| 11 | 4.7 | `/uz/ai-sotuvchi/` | — |
| 9 | 5.0 | `/uz/instagram-uchun-ai-menejer/` | — |
| 8 | 4.0 | `/?lang=uz` | **PHANTOM** (canonical → `/`) |
| 8 | 12.5 | `/ru/ai-bot-dlya-biznesa/` | PASS — **близко к топ-10** ← priority boost |
| 8 | 4.4 | `/uz/horeca-uchun-ai-bot/` | — |
| 8 | 3.9 | `/uz/salon-uchun-ai-bot/` | — |
| 7 | 2.3 | `/ru/blog/ai-prodavec-i-otdel-prodazh/` | — |
| 7 | 2.3 | `/ru/gpt-bot-dlya-biznesa/` | PASS |
| 7 | 2.4 | `/uz/gpt-bot-biznes-uchun/` | PASS |
| 6 | 4.8 | `/ru/blog/ai-bot-dlya-uchebnogo-tsentra-zadachi/` | — |
| 6 | 2.7 | `/ru/telegram-bot-dlya-biznesa/` | PASS |
| 5 | 4.0 | `/ru/blog/` | — |
| 5 | 38.8 | `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | PASS — pos 38 = page 4 |
| 4 | 3.8 | `/ru/blog/ai-bot-dlya-internet-magazina-zadachi/` | — |
| 4 | 6.0 | `/ru/blog/ai-bot-dlya-salona-krasoty-zadachi/` | — |
| 4 | 10.2 | `/ru/instagram-direct-bot/` | PASS — **близко к топ-10** ← priority boost |
| 3 | 5.7 | `/ru/blog/pochemu-biznes-teryaet-zayavki-iz-instagram-telegram/` | — |
| 2 | 1.0 | `http://gptbot.uz/` | 301 → `https://gptbot.uz/` ✓ |
| 2 | 52.0 | `/ru/ai-bot-dlya-salona-krasoty/` | PASS — pos 52 = page 6 (тонкий контент) |

---

## 3. Top queries (28d) — всего 5 запросов в GSC

| Impr | Pos | Query | Target page (Google's) |
|---|---|---|---|
| 3 | 8.3 | `gptbot` (branded) | `/` |
| 2 | 92.0 | `автоматизация заявок` | `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` (cannibalizes `/ru/avtomatizatsiya-zayavok/` money) |
| 1 | 22.0 | `бот для инстаграм директ` | `/ru/instagram-direct-bot/` |
| 1 | 86.0 | `ии бот для бизнеса` | `/ru/ai-bot-dlya-biznesa/` (нет слова "ИИ" на странице) |
| 1 | 6.0 | `чем отличается система, аналогичная gpt, на национальной платформе искусственного интеллекта от обычного чат-бота?` (long-tail) | `/ru/blog/gpt-bot-vs-chat-bot/` |

### Key observations:
1. **`gptbot` pos 8.3, 0 CTR**: Google показывает наш сайт за branded query, но юзеры не кликают. Потенциальная причина: бренд "GPTBot" частично пересекается с OpenAI's web crawler "GPTBot" — пользователи ищут информацию про crawler, а не про наш SaaS. Это **структурный branding issue**, не CTR fix.
2. **`автоматизация заявок` pos 92**: blog статья на 9-й странице, money page (`/ru/avtomatizatsiya-zayavok/`) **вообще не появляется** для этого запроса. Это классическая каннибализация. Blog забрал слот, но сам ранжируется слабо.
3. **`ии бот для бизнеса` pos 86**: target page **не содержит слова "ИИ"** в title/description/контенте — нужно добавить как синоним.
4. **`бот для инстаграм директ` pos 22**: близко к топ-20. Целевая страница `/ru/instagram-direct-bot/` имела description обрезанную как "...в Tel." (truncated typo).

---

## 4. URL Inspection (2026-06-06)

| URL | Verdict | Coverage | Last crawl | Canonical match |
|---|---|---|---|---|
| `/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/ai-bot-dlya-biznesa/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/gpt-bot-dlya-biznesa/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/telegram-bot-dlya-biznesa/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/chat-bot-dlya-biznesa/` | **NEUTRAL** | **Discovered - currently not indexed** | never | (no data) |
| `/ru/instagram-direct-bot/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/avtomatizatsiya-zayavok/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/ai-menedzher-dlya-instagram/` | **NEUTRAL** | **Discovered - currently not indexed** | never | (no data) |
| `/ru/ai-bot-dlya-salona-krasoty/` | **PASS** | indexed | 2026-06-01 | ✓ |
| `/uz/biznes-uchun-ai-bot/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/uz/gpt-bot-biznes-uchun/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/uz/chat-bot-biznes-uchun/` | **PASS** | indexed | 2026-06-03 | ✓ |
| `/ru/blog/telegram-bot-dlya-biznesa/` | **PASS** | indexed | 2026-05-30 | ✓ |
| `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | **PASS** | indexed | 2026-05-31 | ✓ |
| `/ru/blog/ai-menedzher-dlya-instagram/` | **NEUTRAL** | **Crawled - currently not indexed** | 2026-05-31 | ✓ |

### Sample → 12/15 indexed (80%). 3 not indexed:
1. `/ru/chat-bot-dlya-biznesa/` — "Discovered, never crawled". Sitemap touch + Request indexing.
2. `/ru/ai-menedzher-dlya-instagram/` — "Discovered, never crawled". Same.
3. `/ru/blog/ai-menedzher-dlya-instagram/` — "Crawled, not indexed". Каннибализация с money page (`/ru/ai-menedzher-dlya-instagram/`). H1 blog'a sharpened (2026-06-06 session 1) → "AI-менеджер для Instagram на практике: разбор задач". Ждём re-crawl.

---

## 5. Geo & device

**Countries (90d):**
- USA: 31 impr (!) — большая часть от пуска (через VPN / scrapers / тест-инструменты)
- NLD: 14, UZB: 14, DEU: 11, ITA: 5, RUS: 5, KAZ: 4

**UZB только 14% — таргет/география слабо синхронизированы.** Google пока ранжирует сайт глобально по RU/UZ-русскоязычным запросам.

**Devices (90d):**
- DESKTOP: 90 (92%)
- MOBILE: 8 (8%)

Для UZ-рынка где >70% трафика mobile, это сильно несбалансированно. Косвенный сигнал: основная аудитория сейчас — IT/SEO/B2B desktop-users из RU/EU/USA, не локальные мобильные клиенты в Ташкенте.

---

## 6. Data-driven quick wins (deployed 2026-06-06 session 2)

| Действие | Файл | Drives query/page |
|---|---|---|
| Title: добавить "Узбекистан" + "ИИ-менеджер" + brand | `content/pages/ru/ai-bot-dlya-biznesa.json` | "ии бот для бизнеса" pos 86 — добавлен синоним "ИИ" |
| Description: упомянуть "ИИ-бот" синоним | same | same |
| Body: добавить "ИИ-бот" в первый параграф | same | same |
| Title: уточнение "и заявки" | `content/pages/ru/instagram-direct-bot.json` | "бот для инстаграм директ" pos 22 — sharper snippet |
| Description: исправить truncation "в Tel." → "в Telegram или CRM" | same | CTR boost на 4 impr |
| Blog H1/title: "пошаговый разбор воронки" (vs money "не теряйте клиентов") | `content/blog/ru/avtomatizatsiya-zayavok-instruktsiya.json` | de-cannib с money `/ru/avtomatizatsiya-zayavok/` |
| Touch updatedAt для 5 страниц → sitemap lastmod | 5 JSON files | refresh-signal для Googlebot |

Все правки прошли build + `seo:audit`: 0 errors, 0 duplicates, 0 mojibake.

---

## 7. Manual Request Indexing queue (do in GSC URL Inspection NOW)

### Priority A (today, 2 URLs) — Discovered-not-indexed core money pages:
```
https://gptbot.uz/ru/chat-bot-dlya-biznesa/
https://gptbot.uz/ru/ai-menedzher-dlya-instagram/
```
Для каждой: URL Inspection → Test live URL → Request indexing.

### Priority B (today, 2 URLs) — recently re-deployed для CTR fix:
```
https://gptbot.uz/ru/ai-bot-dlya-biznesa/
https://gptbot.uz/ru/instagram-direct-bot/
```
После deploy сегодня — пусть Google пересмотрит обновлённый snippet.

### Priority C (today, 1 URL) — re-crawl де-каннибализированной blog:
```
https://gptbot.uz/ru/blog/ai-menedzher-dlya-instagram/
```
Был "Crawled - not indexed". После H1-фикса (session 1) ожидаем индексацию.

### Priority D (tomorrow) — sitemap submit:
В GSC → Sitemaps → resubmit `https://gptbot.uz/sitemap.xml` (если статус "Couldn't fetch" — удалить, добавить заново).

---

## 8. 7-day roadmap (data-driven)

| Day | Action |
|---|---|
| 0 (today) | Owner: Request indexing для Priority A + B + C (5 URLs). Resubmit sitemap. |
| 1 | GSC Performance → проверить, появились ли новые queries из расширенных title/desc. |
| 2 | URL Inspection retry для 2 "Discovered-not-indexed" → должны стать "URL is on Google" или хотя бы "Crawled". |
| 3 | Если `/ru/blog/ai-menedzher-dlya-instagram/` всё ещё "Crawled - not indexed" → доработать blog контент (добавить уникальный угол: scenarios, ROI estimation). |
| 4–5 | Создать `/ru/chat-bot-tashkent/` + `/ru/telegram-bot-uzbekistan/` (P0 для гео-Top-3). |
| 6 | Расширить `/ru/ai-bot-dlya-salona-krasoty/` (pos 52, контент тонкий 301w → нужно 800+). |
| 7 | Снова GSC Performance + URL Inspection всех 62. Сравнить с baseline. |

---

## 9. Что НЕ делать

- ❌ Не изменять бренд "GPTBot" из-за CTR=0 на branded query. Слишком крупное решение, нужен отдельный strategic call с владельцем.
- ❌ Не запрашивать индексацию более 10 URLs / сутки (GSC квота).
- ❌ Не менять slugs на уже indexed pages — потеряем pos 1.8/2.1/2.4/2.7 ranking signal.
- ❌ Не удалять каннибализирующий blog `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` — он на pos 38 и приносит 5 impr/мес. Лучше плавно убрать "автоматизация заявок" из title как primary keyword и сделать его supporting для money page.

---

## 10. Blockers

1. **Search Analytics возвращает только 5 уникальных queries за 28 дней.** Это **очень мало** для data-driven SEO. Причины:
   - Сайт молодой / свежий property.
   - Anonymized queries (Google скрывает редкие, чтоб не палить PII) → много impressions без query info.
   - Низкий total impression count (98 за 90 дней).
   - **Решение:** ждать roll-up trust signal (4–8 недель), параллельно создавать локальный гео-контент чтобы триггерить новые impressions.

2. **CTR = 0% на 91 impressions за 7d.** Возможные причины:
   - Branded "gptbot" путается с OpenAI's GPTBot crawler в SERP.
   - Сниппеты не имеют benefit-driven hook (исправлено в Priority B).
   - Поисковые intent'ы не совпадают (USA/NL/DE traffic — это не наша ЦА).
   - **Решение:** через 7 дней пересчитать CTR на новых сниппетах.

3. **`/ru/chat-bot-dlya-biznesa/` и `/ru/ai-menedzher-dlya-instagram/` "Discovered - never crawled".** Google знает URL (из sitemap), но не успел/не захотел крауллить.
   - **Решение:** Request indexing manual (Priority A). Updated_at touched → sitemap lastmod freshness signal.
