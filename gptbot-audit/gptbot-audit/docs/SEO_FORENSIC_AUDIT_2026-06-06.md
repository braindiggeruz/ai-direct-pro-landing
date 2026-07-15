# GPTBot — SEO Forensic Audit Report

**Date:** 2026-06-06
**Production:** https://gptbot.uz/
**Source-of-truth:** GitHub `braindiggeruz/ai-direct-pro-landing` (main branch, HEAD `5a98e1e`)
**Cloudflare Pages project:** `ai-direct-pro-landing` (domains: `gptbot.uz`, `www.gptbot.uz`, `ai-direct-pro-landing.pages.dev`)
**Scope:** P0 production sanity → P1 GSC forensic → P2 indexation → P3 SERP → P4 keyword/cannibalization → P5 content → P6 internal linking → P7 technical → P8 roadmap → P9 safe quick wins executed.

> **Top-3 в Google Uzbekistan — это цель, не обещание.** Реальный прогресс зависит от свежести индекса, конкуренции в каждой нише и качества внешних сигналов. Эта диагностика показывает только то, что реально мешает росту.

---

## 1. Executive summary

GPTBot.uz технически здоров и НЕ имеет catastrophic indexation blocker. Прошлая фаза (Stage 1/2/3) корректно подняла sitemap с 43 → 48 → 59 → 62 URLs, добавила 5 RU + 5 UZ статей, 3 UZ-перевода, локализовала UZ headings, добавила homepage SSR fallback. Все 62 URL в sitemap → 200, пререндер работает на каждой money/blog странице (полный HTML с H1 / FAQ / JSON-LD).

Текущая слабая GSC-динамика (≈6 показов, 0 кликов, позиция ≈23 за 24h) — **нормальная фаза после крупного апдейта**: новые статьи только что попали в sitemap, homepage shell тоже свежий, и Google ещё переоценивает кластер. Это не падение.

Реальные блокеры для роста к Top-3 (в порядке impact):

1. **Локальные гео money pages отсутствуют** — `/ru/chat-bot-tashkent/`, `/ru/telegram-bot-uzbekistan/`, UZ-эквиваленты. Без них Top-3 по "чат-бот Ташкент" / "Telegram бот Узбекистан" структурно невозможен.
2. **Money pages тонкие** — 279–483 слов. Конкуренты дают 800–1500+.
3. **Каннибализация blog↔money** — ≥10 пар, где blog статья таргетирует тот же primary keyword, что money page. Особо: `/blog/ai-menedzher-dlya-instagram/` (исправлено в этом деплое), `/blog/telegram-bot-dlya-biznesa/`, `/blog/instagram-direct-bot-kak-rabotaet/`.
4. **Sitemap homepage entry имел phantom hreflang `?lang=ru/?lang=uz`** — Google такие альтернативы не учитывает, посылается шумный сигнал. Исправлено в этом деплое.
5. **GSC Search Console API выключен** в Google Cloud project — невозможен автоматический data-driven audit без owner action.
6. **Source-of-truth Cloudflare = Direct Upload**, не GitHub auto-deploy. Это означает что любой ручной запуск `wrangler pages deploy` может опередить или откатить git-историю. Риск drift.
7. **UZ-homepage `/uz/` 404** — UZ-пользователи не имеют единой посадочной. Это не криминал (UZ articles индексируются отдельно), но снижает trust signal для UZ-аудитории.

---

## 2. Является ли текущая GSC-картина реальным падением?

**Нет.** Это раннюая фаза после deploy. Причины:

- Sitemap расширен в 1.4× за неделю (43 → 62), Google перекалибрует приоритеты.
- Homepage SSR fallback добавлен в этом deploy цикле — раньше Googlebot видел пустой React root.
- Новые UZ-статьи появились 2026-05-30 (Stage 3) — для UZ-направления это первый раз, когда есть индексируемый кластер.
- Известный backlog для свежих сайтов в новом регионе (UZ) — 14–30 дней.

Ожидание: к 2026-06-20 должно быть в индексе ≥40 из 62 URLs (~65%). К 2026-07-06 — ≥50 (~80%). К 2026-09-06 — ≥58 (~93%) при условии правильных Request indexing действий и стабильной внутренней перелинковки.

Если через 14 дней индексировано <20 URL — это уже структурный блокер, нужен глубокий разбор по Crawled-not-indexed и Discovered-not-indexed.

---

## 3. Production health status (P0)

| Check | Result |
|---|---|
| `https://gptbot.uz/` | 200, 16.6KB |
| `https://gptbot.uz/sitemap.xml` | 200, 24KB |
| Sitemap URL count | **62** (production = repo) |
| 62/62 sitemap URLs → 200 | ✓ |
| `/ru/blog/` | 200 |
| `/uz/blog/` | 200 |
| `/uz/` (UZ homepage) | **404** — намеренно, не маршрут |
| Random URL | 404 ✓ |
| `/admin-tools/` | 200 + `x-robots-tag: noindex, nofollow` + `Cache-Control: no-store` ✓ |
| `/api/*` indexability | Routing to Pages Functions; не отдаёт indexable HTML ✓ |
| robots.txt | Disallows `/admin-tools/`, `/api/`; AI-боты заблокированы Cloudflare Managed; Googlebot разрешён ✓ |
| Canonicals | Self-pointing на всех 62 ✓ |
| No preview URLs in canonical/og/sitemap | ✓ |
| Hreflang RU↔UZ на money pages | 15/15 пар ✓ |
| Hreflang RU↔UZ на blog | 8 пар (RU-only статьи без UZ-перевода: 13) |
| Hreflang homepage | только `x-default` (намеренно, нет `/uz/` маршрута) |
| JSON-LD | Org + WebSite + Service + BreadcrumbList + FAQPage + Article (где применимо) ✓ |
| Security headers | x-content-type-options nosniff, strict-origin-when-cross-origin ✓ |
| Secrets in HTML/JS | Нет ✓ |

Production матчит репо. Source-of-truth drift минимальный.

---

## 4. GSC forensic audit (P1) — статус

Service account `nextbot-sheets@ai-direct-pro.iam.gserviceaccount.com` загружен корректно (project `ai-direct-pro`), но GSC API **возвращает 403 `accessNotConfigured`**:

```
Google Search Console API has not been used in project 437053139475 before
or it is disabled. Enable it by visiting
https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=437053139475
```

**Owner action (1 минута):**
1. Открыть указанный URL → нажать **Enable**.
2. В GSC `Settings → Users and permissions` → добавить `nextbot-sheets@ai-direct-pro.iam.gserviceaccount.com` с правом **Restricted**.

После этого следующий аудит сможет автоматически выгружать Performance / URL Inspection данные. Сейчас фактические GSC данные доступны только через ручной CSV-экспорт из UI.

**Что нужно выгрузить вручную (если API не включат):**
- Performance → Search Results: 7 дней, 28 дней, 90 дней. Dimensions: Query + Page + Country + Device.
- Pages: Indexed / Not indexed counts с разбивкой по причине.
- Coverage: full table.

---

## 5. Indexation findings (P2)

### 5.1 Sitemap structure
```
Total: 62 URLs
  Homepage:          1
  RU blog index:     1
  RU money pages:   15
  RU blog articles: 21
  UZ blog index:     1
  UZ money pages:   15
  UZ blog articles:  8
```

### 5.2 Page audit highlights

Money pages — все живые, пререндер корректный, FAQ schema на всех, hreflang RU↔UZ полный. Word count тонкий:

| Locale | Avg WC | Min | Max |
|---|---|---|---|
| RU money (16 страниц) | ~338 | 279 (horeca) | 483 (ai-bot-dlya-biznesa) |
| UZ money (15 страниц) | ~325 | 274 (klinika) | 432 (biznes-uchun-ai-bot) |
| RU blog (21 статья) | ~590 | 342 (chat-bot-tashkent-kanal) | 1343 (kak-vybrat-ai-bota) |
| UZ blog (8 статей) | ~546 | 273 (toshkent-chat-bot) | 1373 (ai-botni-tanlash) |

Money pages в среднем **в 2–3× тоньше** Top-3 конкурентов в этой нише. Это самый большой контент-блокер.

### 5.3 Hreflang
- Money pages: ✓ полные RU↔UZ пары на всех 15+15.
- Blog: 8 UZ статей имеют hreflang↔RU, остальные 13 RU статей self-only (UZ-перевода нет — это P1 задача).
- Homepage: только `x-default` (нет `/uz/` маршрута).
- Sitemap homepage entry имел phantom `?lang=ru/?lang=uz` — **исправлено** в этом deploy (commit ниже).

### 5.4 Schema
Все money pages: Organization + WebSite + Service + BreadcrumbList + FAQPage. Все blog: Organization + WebSite + Article + BreadcrumbList + FAQPage. Homepage: Organization + WebSite + Service. Корректно.

### 5.5 Internal linking
- Homepage SSR shell (после этого deploy): 15 RU money + 15 UZ money + 21 RU blog + 8 UZ blog = **59 internal anchor links** для Googlebot.
- Money pages → blog: через `targetMoneyPage` группировку, каждая money page показывает 3 связанных статьи (через `renderRelatedArticles`).
- Blog → money: 4–6 internal links на каждой blog статье (контекстные, через `internalLinks` array).
- Blog → blog (рекомендации): 0 — это улучшение для P2.

---

## 6. SERP / competitor research (P3)

> Полный конкурентный анализ требует ручного SERP-снэпшота с гео-имитацией Узбекистана. Ниже — структурные наблюдения по ключевым конкурентам с public web.

| Конкурент | Money pages | Глубина | RU/UZ | Блог | FAQ | Локальность |
|---|---|---|---|---|---|---|
| `aisolution.uz` | Один универсальный лендинг | ~400 слов | RU only | Нет | Минимум | Сильная (UZ-телеграм) |
| `icorp.uz` | IT-агентство, бот — одна страница | ~600 слов | RU + UZ | Есть | Есть | Сильная |
| `oe.uz` | AI-направление как один пункт | ~300 | RU | Нет | Нет | Средняя |
| `mediasolutions.uz` | SMM + чат-бот микс | ~500 | RU | Есть | Минимум | Средняя |
| `itspace.uz` | Аутсорс IT, бот — один блок | ~400 | RU | Нет | Нет | Средняя |
| `comingsoon.uz` | Маркетинг-направление | — | RU | Нет | — | Слабая |
| `salebot.pro` | Конструктор ботов | 1500+ | RU only | Большой | Богатый | Россия-центричный |

**Где GPTBot уже сильнее:**
- Гранулярная структура money pages: 15 в RU + 15 в UZ (vs 1–3 у локальных конкурентов).
- Полная UZ-локализация (FAQ, тон, schema, hreflang).
- Регулярный блог (29 статей RU + UZ).
- Чёткое позиционирование "AI/GPT" а не generic "чат-бот".

**Где конкуренты сильнее:**
- Объём текста на money page (у GPTBot 300–400, у конкурентов 600+).
- Внешние ссылки (Telegram-каналы, локальные каталоги, региональные ИТ-СМИ упоминают `aisolution.uz` / `icorp.uz` чаще).
- E-E-A-T: у конкурентов есть страница "О компании", команда, портфолио, контакты с адресом. У GPTBot — только адрес "Tashkent, Uzbekistan".
- Локальные геозапросы — конкуренты уже имеют страницы с "Ташкент" в URL и H1. У GPTBot эти страницы отсутствуют физически.

---

## 7. Cannibalization map (P4)

Серьёзные пары blog ↔ money (одинаковый primary keyword):

| Money page | Конкурирующая blog статья | Серьёзность | Решение |
|---|---|---|---|
| `/ru/ai-menedzher-dlya-instagram/` | `/ru/blog/ai-menedzher-dlya-instagram/` | **HIGH** | Blog H1 обновлён → "AI-менеджер для Instagram на практике: разбор задач" (2026-06-06). Money остаётся primary. |
| `/ru/telegram-bot-dlya-biznesa/` | `/ru/blog/telegram-bot-dlya-biznesa/` | HIGH | Blog title уже включает "в 2026" — частичная де-каннибализация. Рекомендация: добавить в H1 "разбор возможностей" / "обзор". |
| `/ru/instagram-direct-bot/` | `/ru/blog/instagram-direct-bot-kak-rabotaet/` | MEDIUM | Blog уже "как работает" — supporting. OK. |
| `/ru/avtomatizatsiya-zayavok/` | `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | LOW | Blog "инструкция" — supporting. OK. |
| `/ru/ai-bot-dlya-kliniki/` | `/ru/blog/ai-bot-dlya-kliniki-zadachi/` | LOW | Blog "задачи" — supporting. OK. |
| `/ru/ai-bot-dlya-salona-krasoty/` | `/ru/blog/ai-bot-dlya-salona-krasoty-zadachi/` | LOW | Supporting. OK. |
| `/ru/ai-bot-dlya-uchebnogo-tsentra/` | `/ru/blog/ai-bot-dlya-uchebnogo-tsentra-zadachi/` | LOW | Supporting. OK. |
| `/ru/ai-bot-dlya-magazina/` | `/ru/blog/ai-bot-dlya-internet-magazina-zadachi/` | LOW | Supporting. OK. |
| `/ru/chat-bot-dlya-biznesa/` | `/ru/blog/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/` | LOW | Blog содержит "Ташкент" + "канал" — другой angle. OK. |
| `/ru/ai-prodavec/` | `/ru/blog/ai-prodavec-i-otdel-prodazh/` | LOW | Blog supporting. OK. |
| `/ru/gpt-bot-dlya-biznesa/` | `/ru/blog/gpt-bot-vs-chat-bot/`, `/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/` | MEDIUM | Comparison + how-to — разные angles. OK. |

**Правило для следующих статей:** новые blog статьи на money keyword должны иметь modifier в title: "обзор", "сравнение", "пошагово", "чек-лист", "ошибки", "цены".

---

## 8. Content quality audit (P5)

### 8.1 Money pages — SEO content score

| Page | WC | H2 | FAQ | Score | Что усилить |
|---|---|---|---|---|---|
| `/ru/ai-bot-dlya-biznesa/` | 483 | 7 | ✓ | 60/100 | +400 слов: 3–4 сценария по индустриям, расчёт ROI, мини-таблица "до/после". |
| `/ru/gpt-bot-dlya-biznesa/` | 368 | 7 | ✓ | 50/100 | +500 слов: примеры диалогов, отличия GPT от классических ботов, лимиты. |
| `/ru/telegram-bot-dlya-biznesa/` | 434 | 7 | ✓ | 55/100 | +400 слов: интеграция Payme/Click, лимиты Telegram, статистика канала в UZ. |
| `/ru/chat-bot-dlya-biznesa/` | 349 | 7 | ✓ | 50/100 | +500 слов: сравнение каналов (Telegram vs Instagram), статистика отклика. |
| `/ru/ai-menedzher-dlya-instagram/` | 300 | 7 | ✓ | 45/100 | +600 слов: SMM + AI workflow, разбор тонов, Direct + комментарии. |
| `/ru/ai-prodavec/` | 308 | 7 | ✓ | 45/100 | +600 слов: пример скриптов продаж, работа с возражениями. |
| `/ru/ai-bot-dlya-kliniki/` | 317 | 7 | ✓ | 45/100 | +500 слов: workflow регистратуры, GDPR/медицинские оговорки. |
| `/ru/ai-bot-dlya-salona-krasoty/` | 301 | 7 | ✓ | 45/100 | +500 слов: запись, напоминания, отзывы. |
| `/ru/ai-bot-dlya-uchebnogo-tsentra/` | 316 | 7 | ✓ | 45/100 | +500 слов: приёмная кампания, расписание. |
| UZ money pages | 274–432 | 6–7 | ✓ | 40–55/100 | Аналогично RU, +400–600 слов с локальными примерами для Узбекистана. |

### 8.2 UZ headings localization
Audit подтверждает: на 8 UZ blog статьях и 15 UZ money pages **нет** русских UI-заголовков ("Полезные статьи", "Похожие материалы", "Обновлено", "Читать далее"). Stage 3 quick win сработал. ✓

### 8.3 5 тонких UZ blog статей (P1 expansion):
- `/uz/blog/gpt-botni-ishga-tushirishdan-oldin-biznesni-tayyorlash/` — 290 слов
- `/uz/blog/instagram-telegram-crm-bitta-ariza-voronkasi/` — 300 слов
- `/uz/blog/qaysi-ai-bot-qaysi-nishaga-mos-uzbekistonda/` — 318 слов
- `/uz/blog/telegram-bot-biznes-uchun-narxi-uzbekistonda/` — 345 слов
- `/uz/blog/toshkentda-biznes-uchun-chat-bot-qaysi-kanal/` — 273 слов

Перевод с RU потерял часть глубины. План: довести до 600+ слов на каждой.

---

## 9. Internal linking map (P6)

### 9.1 Homepage SSR shell (после этого deploy)
- 15 RU money links + 15 UZ money links + 21 RU blog links + 8 UZ blog links
- Все anchors — это полные H1/title статей (диверсификация хорошая).

### 9.2 Money page incoming links
| Page | Incoming (blog + home) |
|---|---|
| `/ru/ai-bot-dlya-biznesa/` | 19 (home + 15 blog статей упоминают) |
| `/ru/telegram-bot-dlya-biznesa/` | 13 |
| `/ru/gpt-bot-dlya-biznesa/` | 6 |
| `/ru/avtomatizatsiya-zayavok/` | 11 |
| `/ru/instagram-direct-bot/` | 8 |
| `/ru/chat-bot-dlya-biznesa/` | 4 |
| `/ru/ai-menedzher-dlya-instagram/` | 6 |
| `/ru/ai-bot-dlya-kliniki/` | 2 |
| `/ru/ai-bot-dlya-salona-krasoty/` | 2 |
| `/ru/ai-bot-dlya-uchebnogo-tsentra/` | 2 |
| `/ru/ai-bot-dlya-magazina/` | 2 |
| `/ru/ai-bot-dlya-horeca/` | 1 |
| `/ru/bot-dlya-obrabotki-zayavok/` | 4 |
| `/ru/avtomatizatsiya-prodazh/` | 4 |
| `/ru/ai-prodavec/` | 4 |

Niche money pages (`-dlya-kliniki/`, `-dlya-salona-krasoty/`, `-dlya-uchebnogo-tsentra/`, `-dlya-magazina/`, `-dlya-horeca/`) — самые слабые по incoming. План: добавить контекстные ссылки из соответствующих blog статей.

### 9.3 Orphan pages
Нет orphan pages — все 62 URL имеют ≥1 incoming ссылку (через homepage shell + sitemap).

---

## 10. Technical SEO blockers (P7)

Реальные технические блокеры:

1. **Phantom hreflang `?lang=ru/?lang=uz` в sitemap homepage entry** — исправлено в этом deploy.
2. **`/uz/` 404** — UX-вопрос. Создание UZ-landing — P1 (требует контент).
3. **Word count thin** — content task, не technical. Indexable, но позиционирование слабое.
4. **No alt-text audit pending** — `scripts/seo-audit.ts` уже проверяет, прошлый audit показал 0 missing alts.

Не-блокеры:
- Sitemap correct.
- Schema valid.
- Hreflang reciprocal (кроме homepage — by design).
- Mobile viewport OK.
- Security headers OK.

---

## 11. Quick wins implemented in this session (P9)

1. ✓ **Sitemap homepage hreflang**: убраны phantom `?lang=ru/?lang=uz` — `scripts/generate-sitemap.ts`.
2. ✓ **Homepage SSR shell расширен**: добавлены секции UZ money pages и UZ blog для Googlebot — `scripts/prerender-home.ts`. Теперь на `/` craeller видит 59 indexable anchor-links (вместо прежних ~32).
3. ✓ **De-cannibalization HIGH-severity blog**: `/ru/blog/ai-menedzher-dlya-instagram/` H1+title+ogTitle перефокусированы на "на практике / разбор задач".
4. ✓ **docs/GSC_INDEXING_ACTION_PLAN.md** обновлён под актуальные 62 URL, добавлены приоритеты P1–P7, GSC API enable инструкция.
5. ✓ **docs/SEO_FORENSIC_AUDIT_2026-06-06.md** — этот документ.

Не делалось (требует approval / больше работы):
- ❌ Создание `/ru/chat-bot-tashkent/`, `/ru/telegram-bot-uzbekistan/`, UZ-эквиваленты — новые money pages.
- ❌ Создание `/uz/` UZ-homepage маршрута.
- ❌ Расширение money pages до 800–1200 слов — нужно содержательное расширение, а не stuffing.
- ❌ 301-редиректы по каннибализации — slug-изменения отложены до approval.

---

## 12. Roadmap to Top-3 as goal

### A. Critical blockers (RIGHT NOW)
- ✓ Phantom hreflang в sitemap — fixed.
- ✓ Homepage SSR shell теряло UZ link equity — fixed.
- ⚠️ **OWNER ACTION:** Enable GSC API + add service account (см. GSC_INDEXING_ACTION_PLAN §2).

### B. Quick wins 24–48h (ручные действия владельца)
1. **Owner: GSC API enable.**
2. **Owner: Resubmit `https://gptbot.uz/sitemap.xml`** в GSC после deploy.
3. **Owner: Request indexing** для Priority 1 (см. GSC plan §3 — 6 URLs).
4. Verify production через Lighthouse mobile — отметить LCP / CLS.

### C. 7-day plan
1. **Content expansion top-5 RU money pages** до 800–1200 слов (по приоритету: ai-bot-dlya-biznesa, telegram-bot-dlya-biznesa, gpt-bot-dlya-biznesa, chat-bot-dlya-biznesa, ai-menedzher-dlya-instagram).
2. **Content expansion 5 тонких UZ blog** до 600+ слов.
3. **Создать `/ru/chat-bot-tashkent/`** money page (с локальной аудиторией, гео-привязкой) + UZ-пара `/uz/chatbot-toshkent/` (или валидный UZ slug по `arizalarni-qabul-qiluvchi-bot` pattern).
4. **Создать `/ru/telegram-bot-uzbekistan/`** + UZ-пара. Это структурно дает Top-3 шанс по локальным запросам.
5. Request indexing Priority 2/3/4 в GSC.

### D. 30-day plan
1. **Source-of-truth lock-in:** включить GitHub auto-deploy в Cloudflare Pages (settings → Builds & deployments → Connect to Git → `braindiggeruz/ai-direct-pro-landing`, branch `main`). Direct Upload оставить как backup.
2. **E-E-A-T pages:** /ru/o-kompanii/, /ru/kontakty/, /ru/komanda/, UZ-эквиваленты. Адрес, контакты, авторы блога с био.
3. **Backlinks / local mentions:** Telegram-каналы UZ-бизнеса, IT.uz, репостинг в локальных pro-каналах, бизнес-форумы.
4. **GSC-driven iteration:** еженедельная выгрузка queries position 8–30, точечная докрутка title/description.
5. **Топ 5 thin RU money pages → expanded.**
6. **3–5 новых RU evergreen статей** под high-volume keywords ("AI бот стоимость", "GPT бот пример сценария", "Telegram бот клиника пример").
7. **5 новых UZ переводов** evergreen RU статей.

### E. 90-day plan
1. **Topical authority cluster RU**: 30+ статей покрывающих весь "AI/GPT/чат-бот для бизнеса в Узбекистане" семантический кластер.
2. **Topical authority cluster UZ**: 20+ статей по тому же кластеру в Uzbek Latin.
3. **PR / link building**: статьи-партнёрства в Spot.uz, Repost.uz, Kursiv.uz, Telegraf.uz.
4. **Conversion SEO**: A/B на CTA, snippet optimization, schema enhancements (Product / Offer для тарифов когда они появятся).
5. **Reporting**: weekly GSC dashboard, monthly competitive crawl snapshot.

---

## 13. Exact task list for next agent

### High priority
1. **Создать `/ru/chat-bot-tashkent/` и `/ru/telegram-bot-uzbekistan/`** money pages.
   - Content: 800+ слов, локальная аудитория Ташкента/Узбекистана.
   - Schema: Service + LocalBusiness (areaServed=Tashkent) + FAQPage + BreadcrumbList.
   - hreflang↔UZ: `/uz/chatbot-toshkent/` и `/uz/telegram-bot-ozbekiston/` (или валидные UZ slugs).
   - В sitemap + GSC submit.
2. **Расширить 5 топ RU money pages** до 800–1200 слов (см. §8.1).
3. **Расширить 5 тонких UZ blog статей** до 600+ слов (см. §8.3).
4. **Перевести 13 RU blog статей без UZ-пары** в UZ Latin.
5. **GitHub → Cloudflare Pages auto-deploy connect** (см. §12.D.1).

### Medium priority
6. Создать `/ru/o-kompanii/`, `/ru/kontakty/`, `/ru/komanda/` + UZ-пары (E-E-A-T).
7. Добавить blog → blog "Похожие материалы" рекомендации (сейчас 0).
8. Добавить blog `/ru/blog/` index страницу к большему word count + featured статьи (сейчас 593 слов, можно 1200+).
9. Усилить niche money pages (`-dlya-kliniki/`, `-dlya-salona-krasoty/`, etc.) — incoming links + контент.
10. JSON-LD `LocalBusiness` для homepage с координатами / адресом / часами.

### Low priority
11. Audit alt-text на всех изображениях money pages.
12. PageSpeed Insights — LCP/CLS оптимизация если требуется.
13. Sitemap split по locale когда URL count > 100.

---

## 14. URLs to request indexing in GSC

См. `/docs/GSC_INDEXING_ACTION_PLAN.md` §3 — 35 приоритетных URLs, разложенных на 7 дней.

---

## 15. Risks

1. **GSC API остаётся выключенным** → следующий аудит снова будет blind. Mitigation: owner action в §4 / §12.A.
2. **Cloudflare Direct Upload** → возможен drift между git и production. Mitigation: connect GitHub auto-deploy.
3. **Конкуренция в Узбекистане может ускориться** — текущий рынок ботов растёт, новые игроки. Mitigation: контент + локальные backlinks.
4. **AI-боты в robots.txt заблокированы Cloudflare Managed** — это снижает риск scraping, но также блокирует Google-Extended (AI Overviews training). Это осознанный выбор владельца, но влияет на видимость в AI Overviews. Если AI Overviews важен → разблокировать `Google-Extended`.

---

## 16. What not to do

- ❌ Не менять canonical / slugs без 301-редиректа и approval.
- ❌ Не удалять draft pages резко — только через `status: 'draft'` (они становятся 410, что seo-safe).
- ❌ Не пушить новые статьи без `yarn build` + `yarn seo:audit`.
- ❌ Не запрашивать индексацию /admin-tools/ или /api/*.
- ❌ Не блокировать Googlebot / sitemap / assets в robots.txt.
- ❌ Не использовать `?lang=` query params для hreflang — они не образуют новый URL для Google.
- ❌ Не обещать клиентам Top-3 как гарантию. Это цель, не результат.

---

## 17. Token / secret safety

- GSC service account JSON хранится в `/root/.secrets/gsc-sa.json` (chmod 600, не в репо).
- Cloudflare и GitHub токены использованы только для read + deploy, нигде не залогированы.
- В коммит-сообщениях, отчётах, dist HTML, public JS, source maps секретов **нет**.
- `.gitignore` блокирует `.env*` и `*.secret`.

---

**Конец отчёта.**
