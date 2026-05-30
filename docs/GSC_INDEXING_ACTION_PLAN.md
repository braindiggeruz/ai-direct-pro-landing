# GPTBot — Google Search Console Indexing Action Plan

**Domain:** https://gptbot.uz  
**Status:** Indexation emergency audit completed. Site is technically ready for indexing.  
**Last audit:** 2026-05-30

---

## TL;DR

Все опубликованные URLs (15 шт.) технически индексируемы: HTTP 200, корректные `title`, `description`, `canonical`, `hreflang`, schema, без `noindex`, без mojibake. Sitemap отдаётся как `application/xml` и содержит ровно эти 15 URLs.

Главное исправление этого аудита: **draft / неопубликованные URLs больше не отдают 200 SPA-shell** (они возвращают `HTTP 410 Gone`), а случайные несуществующие URLs естественно возвращают `404`. Это устраняет риск массового "Crawled — currently not indexed" / "Soft 404" в GSC.

Дальше — действия владельца сайта в GSC.

---

## 1. Sitemap to submit

URL для submission в Search Console → Sitemaps:

```
https://gptbot.uz/sitemap.xml
```

Если в GSC статус `Не получено / Couldn't fetch` — удалить старую запись и отправить ещё раз. Sitemap отдаётся `Content-Type: application/xml`, доступен и для `Googlebot/2.1`, и не блокируется в robots.txt.

Содержит 15 URLs:

- `/` (homepage)
- `/ru/blog/`
- 8 опубликованных money-страниц (`/ru/...`, `/uz/...`)
- 5 опубликованных blog-статей (`/ru/blog/<slug>/`)

---

## 2. URLs to inspect & request indexing — manual queue

В **URL Inspection** для каждого URL ниже сделать:

1. Вставить URL → дождаться "URL is not on Google" / "URL is on Google".
2. Нажать **Test live URL** → дождаться "URL is available to Google".
3. Если live test зелёный — нажать **Request indexing**.
4. Подождать 1–3 дня, проверить статус снова.

**За 1 сессию в GSC можно запросить ~10 URLs (квота на 24 часа). Делать по очереди.**

### Priority 1 — Homepage + 5 RU money pages

```
https://gptbot.uz/
https://gptbot.uz/ru/ai-bot-dlya-biznesa/
https://gptbot.uz/ru/gpt-bot-dlya-biznesa/
https://gptbot.uz/ru/telegram-bot-dlya-biznesa/
https://gptbot.uz/ru/instagram-direct-bot/
https://gptbot.uz/ru/chat-bot-dlya-biznesa/
```

### Priority 2 — Blog hub + 4 blog articles

```
https://gptbot.uz/ru/blog/
https://gptbot.uz/ru/blog/pochemu-biznes-teryaet-zayavki-iz-instagram-telegram/
https://gptbot.uz/ru/blog/kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy/
https://gptbot.uz/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/
```

### Priority 3 — Remaining blog + UZ money pages

```
https://gptbot.uz/ru/blog/gpt-bot-vs-chat-bot/
https://gptbot.uz/ru/blog/telegram-bot-dlya-biznesa/
https://gptbot.uz/uz/biznes-uchun-ai-bot/
https://gptbot.uz/uz/telegram-bot-biznes-uchun/
https://gptbot.uz/uz/instagram-bot-biznes-uchun/
```

---

## 3. What to check in URL Inspection

Для каждого инспектированного URL зелёные галочки должны быть на:

- **URL is on Google** (после индексации) — или статус "URL is not on Google" до индекса.
- **Page fetch:** `Successful`.
- **Indexing allowed:** `Yes`.
- **User-declared canonical:** совпадает с инспектируемым URL.
- **Google-selected canonical:** тоже совпадает с инспектируемым URL (если отличается → Google считает страницу дубликатом другого URL, надо исправлять).
- **Crawled as:** `Googlebot smartphone`.
- **Last crawl:** дата свежее, чем submission.
- **Referring page:** хотя бы один внутренний или внешний реферрер.

Если что-то красное / отсутствует → см. раздел 4.

---

## 4. Расшифровка GSC статусов и действия

### 4.1 "Discovered — currently not indexed"

Google узнал об URL из sitemap / ссылок, но не успел / не захотел его сейчас обходить.

**Что делать:**

1. Подождать **3–14 дней** — это нормальный backlog для новых сайтов.
2. Усилить **внутренние ссылки** на этот URL (homepage / blog index / соседние money pages).
3. **Manual Request indexing** в URL Inspection.
4. Получить **внешние упоминания** (Telegram-каналы Узбекистана, бизнес-форумы, локальные каталоги).
5. Убедиться, что страница есть в `sitemap.xml`.

### 4.2 "Crawled — currently not indexed"

Google обошёл URL, но не добавил в индекс. Обычно это:

- слабый / неуникальный контент,
- внутренняя каннибализация (несколько URL про одно и то же),
- дубликат другого URL по canonical,
- мало внутренних ссылок.

**Что делать:**

1. Проверить **уникальность контента** (минимум 500–800 слов своего текста).
2. Добавить **FAQ-блок** (если ещё нет) — на этом сайте уже есть на всех money/blog страницах.
3. Добавить минимум **2–3 входящих** внутренних ссылки с других страниц.
4. Убедиться, что **title / description уникальны** относительно других страниц (audit показал 0 дубликатов).
5. Проверить, что **canonical указывает на сам URL** (audit OK).
6. Если canonical в GSC = другой URL → пересмотреть, какой URL должен быть caconical, и убрать слабый URL из sitemap.

### 4.3 "Excluded by 'noindex' tag"

Не должно быть на опубликованных страницах. Если случилось → проверь `meta name="robots"` в HTML страницы (после деплоя audit показывает только `index, follow`).

### 4.4 "Blocked by robots.txt"

Проверить `https://gptbot.uz/robots.txt`. На момент аудита:

```
User-agent: *
Allow: /
Disallow: /admin-tools/
Disallow: /api/
Sitemap: https://gptbot.uz/sitemap.xml
```

Cloudflare также добавляет content-signals для AI-ботов (`Bytespider`, `GPTBot`, `ClaudeBot`, `Google-Extended`, и т.д. — все `Disallow`). Это **не блокирует** обычный `Googlebot` для классической поисковой индексации — заблокирован только `Google-Extended` (AI training), что является осознанным выбором владельца.

### 4.5 "Not found (404)"

Должно быть только на:

- случайных рандомных URLs (`/typo/`, `/random/`),
- ранее удалённых страницах.

Если 404 на одной из 15 sitemap-URL → срочно проверить prerender / deployment.

### 4.6 "Page with redirect"

Не должно быть на canonical URLs (canonical URL должен отдавать 200, не редирект).

### 4.7 "Soft 404"

Раньше был риск из-за SPA fallback. Теперь устранён: draft URLs → 410, неизвестные URLs → 404.

### 4.8 "Duplicate without user-selected canonical" / "Alternate page with proper canonical tag"

Audit показывает 0 дубликатов по title и 0 по description. Canonical на каждой странице self-pointing. Если GSC всё равно жалуется — это hreflang-альтернативы (RU/UZ), это нормально.

---

## 5. Технические факты по сайту (что GSC увидит)

| Параметр | Статус |
|---|---|
| `robots.txt` HTTP | 200, text/plain |
| `sitemap.xml` HTTP | 200, application/xml |
| Sitemap URL count | 15 |
| Published pages | 8 money + 5 blog + 1 blog index + 1 home = **15** |
| Draft pages | 17 money + 10 blog = **27 → все возвращают 410 Gone** |
| Random unknown URLs | **404** (Cloudflare Pages default) |
| Canonical | self-pointing на всех 15 |
| `<meta name="robots">` | `index, follow, max-image-preview:large` на всех публичных |
| Hreflang | RU↔UZ bidirectional на 10 парах, x-default → `/`, self на blog (нет UZ-блога) |
| JSON-LD | Organization + WebSite + Service + FAQPage + BreadcrumbList (money), Article + FAQPage + BreadcrumbList (blog) |
| Mojibake | 0 |
| Mobile viewport | OK на всех |
| Googlebot fetch | 200 на всех 17 проверенных URLs |
| Cloudflare WAF | Не блокирует `Googlebot/2.1` |
| Build | `yarn build` → 0 critical SEO issues |

---

## 6. Расширенная очередь индексации (на 2 недели)

| День | Действие |
|---|---|
| 0 | Submit sitemap. Request indexing для Priority 1 (6 URLs). |
| 1 | Request indexing для Priority 2 (4 URLs). |
| 2 | Request indexing для Priority 3 (5 URLs). |
| 3–4 | Проверить URL Inspection для Priority 1 — должны появиться "URL is on Google". |
| 5–7 | Проверить Coverage / Indexed pages — должно быть ≥10 URLs. |
| 7 | Если какие-то URLs всё ещё "Discovered — not indexed" → re-submit + добавить внутренние ссылки. |
| 14 | Все 15 URLs должны быть в индексе. Если нет → анализ Crawled-not-indexed по разделу 4.2. |

---

## 7. Что НЕ делать

- ❌ Не запрашивать индексацию draft URLs (они отдают 410 — это правильно).
- ❌ Не публиковать новые странички без `status: 'published'` в `content/pages/` или `content/blog/`.
- ❌ Не править hreflang вручную в HTML — он генерируется из `content/pages/*.json` через prerender.
- ❌ Не блокировать `/sitemap.xml`, `/assets/*` или `Googlebot` в robots.txt.
- ❌ Не менять canonical, чтобы он указывал не на сам URL.

---

## 8. Контроль качества — повторный аудит

После каждого нового деплоя:

```bash
# В корне репо:
yarn build          # включает scripts/seo-audit.ts — fail если critical issue
yarn seo:audit      # только аудит
```

И вручную:

```bash
curl -I https://gptbot.uz/sitemap.xml         # 200 application/xml
curl -A "Googlebot/2.1" -I https://gptbot.uz/  # 200
curl -I https://gptbot.uz/ru/ai-bot-dlya-magazina/  # 410 (draft)
curl -I https://gptbot.uz/typo-url/            # 404
```

---

## 9. Что улучшать дальше (вне emergency-аудита)

- Постепенно публиковать оставшиеся 17 draft money + 10 draft blog (валидным контентом, не пустыми shells).
- Добавлять обратные ссылки с UZ-форумов / Telegram-каналов на 4–5 главных money pages.
- Через 30 дней проверить **Performance → Queries** в GSC — какие запросы уже приносят показы, и докрутить title/description под них.
- Если конверсия в Telegram-CTA важна — настроить **conversion tracking** через GA4 + Meta Pixel (уже на сайте).
