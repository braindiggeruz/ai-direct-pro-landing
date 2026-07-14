# GPTBot — Google Search Console Indexing Action Plan

**Domain:** https://gptbot.uz
**Status:** Indexation forensic audit completed 2026-06-06. All 62 sitemap URLs serve HTTP 200 with prerendered SEO content.
**Last audit:** 2026-06-06
**Sitemap count:** 62 URLs (1 homepage + 1 RU blog index + 15 RU money + 1 UZ blog index + 15 UZ money + 21 RU blog articles + 8 UZ blog articles)

---

## TL;DR

Sitemap содержит 62 URLs, **62/62 → HTTP 200**. Все опубликованные URLs (money + blog) предрендерены статически (полный body с H1, контентом, FAQ, JSON-LD) и индексируемы. Homepage `/` имеет SSR-fallback внутри `<div id="root">` с навигацией и списком всех money / blog страниц для краулера. Каноникалы self-pointing, hreflang RU↔UZ установлен на всех 30 money pages и 8 UZ blog статьях. Random URL → 404. `/admin-tools/` → `noindex, nofollow` + `Cache-Control: no-store`.

Текущая слабая GSC-динамика (≈6 показов / 0 кликов / позиция ≈23 за 24h) — **нормальная фаза после deploy**, не структурная проблема. Реальные блокеры:

1. **GSC API выключен в Cloud project `ai-direct-pro`** (project 437053139475) — нужно включить `Search Console API` в `https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=437053139475`.
2. **Service account `nextbot-sheets@ai-direct-pro.iam.gserviceaccount.com`** должен быть добавлен в GSC property `sc-domain:gptbot.uz` (или URL-prefix `https://gptbot.uz/`) с правом **Restricted** (read).
3. **Sitemap homepage entry** ранее имел phantom hreflang `?lang=ru/?lang=uz` — исправлено в этом deploy.
4. **Локальные гео money pages** (`/ru/chat-bot-tashkent/`, `/ru/telegram-bot-uzbekistan/`, UZ-эквиваленты) **отсутствуют** — это P1 контент-задача для следующей итерации, ключевая для топа по Tashkent/Uzbekistan.

---

## 1. Sitemap to submit

```
https://gptbot.uz/sitemap.xml
```

Если в GSC статус `Не получено / Couldn't fetch` — удалить старую запись и отправить ещё раз. Sitemap отдаётся `Content-Type: application/xml`, доступен и для `Googlebot/2.1`, и не блокируется в robots.txt.

После этого deploy sitemap содержит 62 entries, ровно столько же на production live.

---

## 2. Owner action — включить GSC API

1. Открыть `https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=437053139475`.
2. Нажать **Enable**.
3. В GSC (`https://search.google.com/search-console`) → `Settings → Users and permissions` → `Add user` → ввести `nextbot-sheets@ai-direct-pro.iam.gserviceaccount.com` с правом **Restricted**.
4. Подождать 5–10 минут до propagation.
5. После этого автоматический GSC analytics через service account станет возможен.

Без этого следующий аудит будет полагаться на ручной CSV-экспорт из GSC UI вместо API.

---

## 3. URLs to inspect & request indexing — priority queue

В **URL Inspection** для каждого URL ниже сделать:

1. Вставить URL → дождаться "URL is not on Google" / "URL is on Google".
2. Нажать **Test live URL** → дождаться "URL is available to Google".
3. Если live test зелёный — нажать **Request indexing**.
4. Подождать 1–3 дня, проверить статус снова.

**Квота: ~10 URLs в сутки. Делать по очереди в течение 7 дней.**

### Priority 1 (день 0) — Homepage + 5 core RU money pages

```
https://gptbot.uz/
https://gptbot.uz/ru/ai-bot-dlya-biznesa/
https://gptbot.uz/ru/gpt-bot-dlya-biznesa/
https://gptbot.uz/ru/telegram-bot-dlya-biznesa/
https://gptbot.uz/ru/chat-bot-dlya-biznesa/
https://gptbot.uz/ru/ai-menedzher-dlya-instagram/
```

### Priority 2 (день 1) — RU blog hub + 4 evergreen blog articles

```
https://gptbot.uz/ru/blog/
https://gptbot.uz/ru/blog/pochemu-biznes-teryaet-zayavki-iz-instagram-telegram/
https://gptbot.uz/ru/blog/kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy/
https://gptbot.uz/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/
https://gptbot.uz/ru/blog/gpt-bot-vs-chat-bot/
```

### Priority 3 (день 2) — UZ core money + UZ blog hub

```
https://gptbot.uz/uz/biznes-uchun-ai-bot/
https://gptbot.uz/uz/gpt-bot-biznes-uchun/
https://gptbot.uz/uz/telegram-bot-biznes-uchun/
https://gptbot.uz/uz/chat-bot-biznes-uchun/
https://gptbot.uz/uz/blog/
```

### Priority 4 (день 3) — RU niche money pages

```
https://gptbot.uz/ru/ai-bot-dlya-kliniki/
https://gptbot.uz/ru/ai-bot-dlya-salona-krasoty/
https://gptbot.uz/ru/ai-bot-dlya-uchebnogo-tsentra/
https://gptbot.uz/ru/ai-bot-dlya-magazina/
https://gptbot.uz/ru/avtomatizatsiya-zayavok/
```

### Priority 5 (день 4) — UZ niche money pages

```
https://gptbot.uz/uz/klinika-uchun-ai-bot/
https://gptbot.uz/uz/salon-uchun-ai-bot/
https://gptbot.uz/uz/oquv-markazi-uchun-ai-bot/
https://gptbot.uz/uz/dokon-uchun-ai-bot/
https://gptbot.uz/uz/arizalarni-avtomatlashtirish/
```

### Priority 6 (день 5) — recent RU blog (Stage 2/3)

```
https://gptbot.uz/ru/blog/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/
https://gptbot.uz/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/
https://gptbot.uz/ru/blog/kakoi-ai-bot-nuzhen-vashei-nishe-v-uzbekistane/
https://gptbot.uz/ru/blog/instagram-telegram-crm-odna-voronka-zayavok/
https://gptbot.uz/ru/blog/kak-vybrat-ai-bota-dlya-biznesa/
```

### Priority 7 (день 6) — recent UZ blog (Stage 2/3 переводы)

```
https://gptbot.uz/uz/blog/telegram-bot-biznes-uchun-narxi-uzbekistonda/
https://gptbot.uz/uz/blog/gpt-botni-ishga-tushirishdan-oldin-biznesni-tayyorlash/
https://gptbot.uz/uz/blog/qaysi-ai-bot-qaysi-nishaga-mos-uzbekistonda/
https://gptbot.uz/uz/blog/ai-botni-biznes-uchun-qanday-tanlash/
https://gptbot.uz/uz/blog/biznes-instagram-telegramdan-kelgan-arizalarni-nega-yoqotadi/
```

---

## 4. Что проверять в URL Inspection

Для каждого URL зелёные индикаторы должны быть:

- **URL is on Google** (после индексации) — или "URL is not on Google" до индекса.
- **Page fetch:** `Successful`.
- **Indexing allowed:** `Yes`.
- **User-declared canonical** = инспектируемый URL.
- **Google-selected canonical** = инспектируемый URL (если отличается → Google считает страницу дубликатом).
- **Crawled as:** `Googlebot smartphone`.

Если что-то красное → см. секцию 5.

---

## 5. Расшифровка статусов и действия

### 5.1 "Discovered — currently not indexed"
Подождать 3–14 дней (нормальный backlog). Усилить внутренние ссылки. Manual Request indexing.

### 5.2 "Crawled — currently not indexed"
Слабый или каннибализирующий контент. **Особое внимание на следующие пары blog ↔ money:**
- `/ru/blog/telegram-bot-dlya-biznesa/` ↔ `/ru/telegram-bot-dlya-biznesa/`
- `/ru/blog/ai-menedzher-dlya-instagram/` ↔ `/ru/ai-menedzher-dlya-instagram/` (H1 в blog обновлён 2026-06-06 на "AI-менеджер для Instagram на практике: разбор задач" — это де-каннибализация).
- `/ru/blog/instagram-direct-bot-kak-rabotaet/` ↔ `/ru/instagram-direct-bot/`
- `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` ↔ `/ru/avtomatizatsiya-zayavok/`

Если Google-selected canonical отличается от user-declared — это значит Google склеил blog с money. В этом случае ослабить blog (добавить supporting angle в H1/title), а не money page.

### 5.3 "Page with redirect"
Не должно быть на money pages.

### 5.4 "Excluded by 'noindex' tag"
Не должно быть на опубликованных страницах. Проверить `meta name="robots"` после deploy.

### 5.5 "Blocked by robots.txt"
robots.txt позволяет Googlebot всё, кроме `/admin-tools/` и `/api/`. AI-боты (`GPTBot`, `Google-Extended`, `ClaudeBot`, `Bytespider`, etc.) заблокированы Cloudflare Managed — это **не влияет** на обычный Googlebot для поиска.

### 5.6 "Not found (404)"
Должно быть только на random URLs. Если 404 на одной из 62 sitemap URLs — срочно проверить prerender.

### 5.7 "Duplicate without user-selected canonical" / "Alternate page with proper canonical tag"
Hreflang-альтернативы RU/UZ — это нормально. Если Google жалуется на дубликаты внутри одного locale — это каннибализация blog↔money (см. 5.2).

---

## 6. Метрики, которые надо снимать в Performance каждые 7 дней

| Период | Метрики |
|---|---|
| 7 дней | total impressions, total clicks, avg CTR, avg position |
| 7 дней | top 20 queries (поделить на branded vs non-branded) |
| 7 дней | top 20 pages |
| 7 дней | queries position 8–30 (квази-топ, ближе всего к росту) |
| 28 дней | то же, для тренда |
| 90 дней | то же, для long-term direction |

**Что искать:**
- Queries с impressions ≥10 и CTR <1% → улучшать title/description.
- Queries position 11–20 → усиливать внутренние ссылки + расширить контент целевой страницы.
- Pages с impressions ≥5 и 0 кликов → проверять snippet и H1.
- Pages с 0 impressions через 21+ день после Request indexing → проверять Crawled/Discovered статус.

---

## 7. Технические факты по сайту (что увидит GSC после этого deploy)

| Параметр | Статус |
|---|---|
| `robots.txt` HTTP | 200, text/plain |
| `sitemap.xml` HTTP | 200, application/xml |
| Sitemap URL count | 62 |
| Sitemap URLs 200/200 | 62/62 ✓ |
| Random URL | 404 ✓ |
| `/admin-tools/` | `x-robots-tag: noindex, nofollow` + `Cache-Control: no-store` ✓ |
| Canonical | self-pointing на всех 62 ✓ |
| Hreflang RU↔UZ | 15 пар money + 8 пар UZ-блог + блог-индексы ✓ |
| Homepage hreflang | `x-default` only (намеренно — нет отдельного `/uz/` сейчас) |
| JSON-LD | Org + WebSite + Service (home) / + BreadcrumbList + Service + FAQPage (money) / + Article + FAQPage + BreadcrumbList (blog) |
| Homepage SSR shell | 5K+ chars с H1 + nav + 15 RU money + 15 UZ money + 21 RU blog + 8 UZ blog ссылок (2026-06-06 расширен) |
| Word count (money) | 279–483 (тонко — план: расширить до 800–1200 в P1) |
| Word count (blog) | 273–1373 (5 RU blog и 5 UZ blog — тонкие <500w, план в P1) |

---

## 8. Что НЕ делать

- ❌ Не запрашивать индексацию /admin-tools/, /api/* (они noindex по дизайну).
- ❌ Не публиковать новые странички без `status: 'published'` в `content/*.json`.
- ❌ Не править hreflang вручную в HTML — генерируется из JSON через prerender.
- ❌ Не блокировать `/sitemap.xml`, `/assets/*` или `Googlebot` в robots.txt.
- ❌ Не менять canonical на не-self URL без 301-редиректа со старого URL.
- ❌ Не отправлять `Request indexing` для одного и того же URL чаще одного раза в 24h.

---

## 9. Контроль качества — после каждого deploy

```bash
yarn build           # включает scripts/seo-audit.ts — fail если critical issue
yarn seo:audit       # только аудит
```

И вручную:

```bash
curl -I https://gptbot.uz/sitemap.xml
curl -A "Googlebot/2.1" -I https://gptbot.uz/
curl -I https://gptbot.uz/random-typo-url-xyz/   # 404
curl -I https://gptbot.uz/admin-tools/            # 200 + noindex header
```

---

## 10. Следующие шаги (после 14 дней)

Если через 14 дней индекс ≥40 URLs:
- Проверить Performance → Queries, поднять title/description под реальные запросы.
- Расширить тонкие money pages до 800–1200 слов.
- Создать **локальные гео money pages**: `/ru/chat-bot-tashkent/`, `/ru/telegram-bot-uzbekistan/`, UZ-эквиваленты. Это критично для Top-3 по Tashkent/Uzbekistan.

Если через 14 дней индекс <20 URLs:
- Проверить Crawled/Discovered отчёт.
- Усилить внешние сигналы (Telegram-каналы, локальные каталоги, бизнес-форумы Узбекистана).
- Сделать review каннибализационных пар (см. 5.2).
