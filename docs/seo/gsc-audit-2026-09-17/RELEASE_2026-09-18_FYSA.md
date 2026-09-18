# Релиз 2026-09-18 (второй) — fire-your-seo-agency: F01–F03, F05–F07

Команда владельца 18.09 (после аудита по методике `fire-your-seo-agency`, см. [FIRE_YOUR_SEO_AGENCY_AUDIT_2026-09-18.md](FIRE_YOUR_SEO_AGENCY_AUDIT_2026-09-18.md)): «приступай и реализуй все необходимые улучшения используя данный скилл, действуй автономно и сразу деплой». Решение по F01 (единое имя «GPTBot.uz», конфликтовавшее с X17) принято в пользу методики: имя бренда важнее трёх символов длины title; хард-лимит title ≤ 65 команды сохранён.

Формат отчёта — по методике: ① что изменено (before/after), ② проверка глазами краулера (curl), ③ даты замеров, ④ что не сделано и почему.

## Что ушло в production

Ветка `seo/fire-your-seo-agency-2026-09-18` = `seo/release-2026-09-18` (679a2853) + runtime-коммит **310058353dd81b7a55e85fc187b97bb858f0e7d2** (110 файлов). Cloudflare Pages deployment `https://2f94ba7b.ai-direct-pro-landing.pages.dev`; `release:pages:check` до деплоя: production = 679a2853 (предок HEAD), после деплоя: production = 3100583. Манифест `https://gptbot.uz/gptbot-release.json` отдаёт commit 3100583.

| ID | Было | Стало |
|---|---|---|
| **F01** бренд | три написания: `og:site_name` «GPTBot», суффикс title «\| GPTBot» (58 стр.) и «\| GPTBot.uz» (45 стр.), Organization «GPTBot.uz», h1 главной «GPTBot — …» | «GPTBot.uz» везде: `og:site_name` на всех страницах, суффикс title «\| GPTBot.uz» (59 документов переименованы), title/h1/description главной «GPTBot.uz — …», вордмарк шапки, подпись «Проверено командой GPTBot.uz», подвал, `WebSite.name`. «GPTBot» остался только как `alternateName` у Organization и WebSite (`['GPTBot', 'gptbot.uz']`). Правило записано в `AGENTS.md` §2 |
| **F02** sameAs | Telegram, GitHub | + Яндекс Карты `org/109235624736` (`content/global/site.json` → `businessProfiles`, только для Organization; Person.sameAs без изменений) |
| **F03** UZ-лидеры для AI | 18 md-двойников (только услуги); в `llms.txt` — 13 RU-статей, UZ-хабов и лидеров нет; один twin из списка отдавал 404 | 25 md-двойников (+7 статей: 5 UZ ChatGPT-кластера, `kak-oplatit-chatgpt…`, `chatgpt-i-claude…`) с `<link rel="alternate" type="text/markdown">`; `llms.txt`: секции «Websites, SEO, SMM and advertising» (13 RU/UZ страниц), «Key articles (UZ) — ChatGPT in Uzbekistan cluster», 9 UZ-интентов, фиды, точный список 25 twins (404-twin `/ru/razrabotka-sayta-pod-klyuch/` убран), `Last updated` 2026-09-18; `llms-full.txt`: «Uzbek commercial hubs», «ChatGPT in Uzbekistan (UZ cluster)», дата. Twins теперь рендерят таблицы и цитаты (тарифные таблицы раньше выпадали) |
| **F05** offers | `Service` без `offers` при видимой цене | `Service.offers` = `Offer{priceCurrency: UZS, priceSpecification{minPrice}}` ровно на 34 страницах из 93 с `Service` — там, где цена видна в чипе hero («От 1 990 000 сум», «1 990 000 so‘mdan»); помесячные чипы → `UnitPriceSpecification{unitCode: MON}`. Без фиксированной цены, без Offer на страницах без чипа (`scripts/service-offers.ts`, тест `tests/service-offers.test.ts`) |
| **F06** мета | 29 title > 60 (после суффикса `.uz` было бы 40), 21 description > 160 | title ≤ 65 (цель 60) и description ≤ 160 на 24 документах (16 страниц, 8 статей); в dist: title > 65 — 0, description > 160 — только два защищённых лидера, не тронуты намеренно |
| **F07** RSS | фида нет | `/ru/blog/feed.xml`, `/uz/blog/feed.xml` — RSS 2.0, 50 новейших опубликованных статей, `atom:link self`, `Content-Type: application/rss+xml` в `_headers`; `<link rel="alternate" type="application/rss+xml">` на каждой странице (`scripts/generate-feed.ts`, тест `tests/blog-feed.test.ts`) |
| защита лидеров | baseline `2026-09-18-release` | baseline `docs/seo/evidence/2026-09-18-fysa/reviewed-protected-pages.json`: 9 лидеров — только `bodyTextSha256` (вордмарк/подпись/подвал), `/` — title, h1, description, body; canonical/robots/hreflang/ссылки у всех десяти без изменений |

### Переписанная мета (24 документа; длина title / description после)

| Документ | title | desc |
|---|---|---|
| ru/ai-bot-dlya-biznesa | 60 | 158 |
| ru/ai-bot-dlya-uchebnogo-tsentra | 57 | 151 |
| ru/ai-bot-s-crm-amocrm-bitrix24 | 54 | 153 |
| ru/ai-menedzher-dlya-instagram | 63 | 154 |
| ru/kontekstnaya-reklama-tashkent | 61 | 158 |
| ru/razrabotka-saytov-tashkent | 59 | 158 |
| ru/razrabotka-telegram-bota-tashkent | 62 | 159 |
| ru/seo-prodvizhenie-saytov-tashkent | 65 | 153 |
| ru/whatsapp-bot-dlya-biznesa | 55 | 148 |
| uz/amocrm-bitrix24-bilan-ai-bot | 56 | 160 |
| uz/biznes-uchun-ai-bot | 62 | 154 |
| uz/chat-bot-narxi | 63 | 159 |
| uz/klinika-uchun-ai-bot | 63 | 156 |
| uz/oquv-markazi-uchun-ai-bot | 58 | 159 |
| uz/smm-xizmatlari | 63 | 152 |
| uz/whatsapp-bot-biznes-uchun | 57 | 152 |
| blog/ru/agentstvo-ili-frilanser-uzbekistan | 58 | 155 |
| blog/ru/keys-cake-city-platforma-kondirterskoy | 57 | 157 |
| blog/ru/keys-graver-studio-seo-sayt-b2b | 53 | 152 |
| blog/ru/skolko-stoit-internet-reklama-uzbekistan-2026 | 55 | 158 |
| blog/ru/skolko-stoit-sozdat-sayt-tashkent-2026 | 49 | 159 |
| blog/uz/agentlik-frilanser-yoki-birja-ozbekiston | 60 | 149 |
| blog/uz/internet-reklama-narxi-ozbekiston-2026 | 56 | 157 |
| blog/uz/sayt-yaratish-narxi-toshkent-2026 | 43 | 157 |

Цены в title/description — только уже опубликованные; `lastReviewedAt`/`updatedAt` (страницы) и `dateModified`/`updatedAt` (статьи) на этих 24 документах = 2026-09-18, у 59 документов с одной лишь заменой суффикса даты не трогались. Узбекские формулировки написаны без вычитки носителем (как и в релизе утра 18.09) — см. «Что дальше».

## Проверки перед релизом

`npm run build` (seo-audit, tsc -b, vite, prerender ×3, sitemap 288, robots, 25 md-twins, 2 feeds), `npm run build:production` (933 файла в манифесте), `seo-protection.ts check` 10/10 на новом baseline, `npm test` 617/617 (включая новые `service-offers` 6/6 и `blog-feed` 4/4), `tests/seo-page-integrity.test.ts` 15/15, `npm run typecheck`, `eslint` по всем затронутым файлам, `npm run scan:secrets` (3057 файлов) — чисто. `release:pages:check` — production 679a2853 является предком HEAD.

## Проверка глазами краулера (curl, без JS, кастомный домен, 18.09 после деплоя)

```
$ curl -s https://gptbot.uz/gptbot-release.json | jq -r .commit
310058353dd81b7a55e85fc187b97bb858f0e7d2
$ curl -s https://gptbot.uz/ | grep -oE '<title>[^<]*</title>|<h1>[^<]*</h1>|og:site_name" content="[^"]*"'
<title>GPTBot.uz — AI-бот для бизнеса в Узбекистане | Telegram</title>
og:site_name" content="GPTBot.uz"
<h1>GPTBot.uz — AI-бот для бизнеса в Узбекистане, который не теряет заявки</h1>
# Organization: name=GPTBot.uz alternateName=GPTBot sameAs=[t.me/XGame_changerx, github.com/braindiggeruz, yandex.ru/maps/org/109235624736]
# WebSite: name=GPTBot.uz alternateName=[GPTBot, gptbot.uz]
$ curl -s https://gptbot.uz/ru/ai-bot-dlya-biznesa/   # Service.offers
{"@type":"Offer","url":"https://gptbot.uz/ru/ai-bot-dlya-biznesa/","priceCurrency":"UZS","priceSpecification":{"@type":"PriceSpecification","minPrice":1990000,"priceCurrency":"UZS"}}
$ curl -s https://gptbot.uz/uz/smm-xizmatlari/         # помесячный чип
{"@type":"Offer",…,"priceSpecification":{"@type":"UnitPriceSpecification","minPrice":2490000,"priceCurrency":"UZS","unitCode":"MON","billingIncrement":1}}
$ curl -s https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/ | grep -oE '<title>[^<]*</title>|type="text/markdown"[^>]*>'
<title>ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish</title>      # лидер: title не менялся
type="text/markdown" href="https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/index.html.md" />
$ for u in /ru/blog/feed.xml /uz/blog/feed.xml; do curl -s -o /dev/null -w "$u %{http_code} %{content_type}\n" https://gptbot.uz$u; done
/ru/blog/feed.xml 200 application/rss+xml; charset=utf-8      # 50 <item>
/uz/blog/feed.xml 200 application/rss+xml; charset=utf-8      # 50 <item>
# 25 md-twins из llms.txt → 25 × HTTP 200 text/markdown; /ru/razrabotka-sayta-pod-klyuch/index.html.md → 404 (убран из списка)
$ curl -s https://gptbot.uz/llms.txt | grep -m1 "Last updated"
| Last updated | 2026-09-18 |
$ curl -s https://gptbot.uz/robots.txt | grep Sitemap ; curl -s https://gptbot.uz/sitemap.xml | grep -c "<loc>"
Sitemap: https://gptbot.uz/sitemap.xml
288
```

HTML на домене отдаётся с `cf-cache-status: DYNAMIC` — старых версий в кэше зоны нет. Пост-проверка внутри `deploy:pages:production` («Custom domain does not serve the expected release manifest») сработала в первые секунды после публикации, до распространения; повторный `release:pages:check` через минуту вернул `previousProductionCommit = 3100583`, ручная проверка манифеста и страниц выше — совпадает.

## После релиза

- IndexNow: все 288 URL sitemap отправлены (`INDEXNOW_KEY` = публичный ключ `/712a8e89859347268db2f779fd0e49a2.txt`), квитанция — `reports/indexnow-receipts/2026-09-18T08-52-35-044Z_manual_1789721555046_df6e6af7.json` (HTTP 200). Google IndexNow не читает — переиндексация по расписанию Googlebot; при желании Request indexing в GSC для главной и 24 переписанных страниц.
- Ветки `seo/fire-your-seo-agency-2026-09-18` и `main` = 3100583 + документационный коммит.

## Даты и что замеряем (Phase 5 методики)

| Что | Как | Когда |
|---|---|---|
| Промежуточный взгляд «не сломали»: клики/показы 10 лидеров, брендовый запрос «gptbot» (позиция 1, CTR), индексация 24 переписанных страниц | GSC через OpenSEO MCP, `inspect_urls` батчами по 3 | **02.10.2026** |
| CTR 24 переписанных страниц в том же диапазоне позиций vs 21.08–17.09 | GSC `page × query`, MEASUREMENT_PLAN | **≈ 22.10.2026** (28 дней после переобхода) |
| Первая LLMO-проверка без браузинга: «Что такое GPTBot.uz?», «Кто делает AI-ботов для бизнеса в Ташкенте?» в ChatGPT / Claude / Gemini, ответ дословно | владелец, `docs/seo/llmo-checks/2026-09.md` | до **30.09.2026**, затем январь 2027 |
| Baseline цитирований O/X: 8 вопросов × 4 движка (аудит, п. 3.2) | владелец, `docs/seo/ai-citations/2026-09-XX.md` | до **30.09.2026**, затем ежемесячно |
| Визиты AI-краулеров (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, YandexBot) и обращения к `feed.xml`, `index.html.md`, `llms.txt` | Cloudflare Dashboard → AI Audit / Analytics | еженедельно, первая выгрузка 25.09 |
| Валидация JSON-LD с Offer | Rich Results Test / schema.org validator по 3 URL (RU бот, UZ SMM помесячно, страница без цены) | до 25.09.2026 |

## Что не сделано и почему

- **F04** страница-первоисточник данных — нужны реальные данные владельца (выборка рынка / агрегат по ботам); ничего не выдумано.
- **F08 / F09** замеры цитирований и AI-краулеров — ручные действия владельца (стены входа, Cloudflare Dashboard), шаблоны и даты — выше.
- **F10** Bing / Яндекс Вебмастер, регион «Ташкент» — нужны аккаунты владельца (= X16).
- **F11** публичный e-mail — нельзя выдумать адрес; `llms.txt` по-прежнему честно пишет «none published».
- **F12** `SearchAction` не возвращён: удалён намеренно в 2c2f4529 (Google убрал sitelinks search box).
- **sameAs** без Golden Pages (URL карточки и её NAP не совпадают с сайтом) и без Google Maps cid (карточка Boss Digital — отдельная сущность, `department`); сначала X10/X11 — исправить карточки.
- Ссылки не покупались, отзывов/рейтингов/`AggregateRating` нет; Offer только с видимой на странице ценой.

## Что дальше

1. Владелец: вычитка носителем 8 узбекских title/description из таблицы выше (правки — отдельным релизом с новой ревизией baseline); проверка карточек Golden Pages / Google / Яндекс на единый NAP и имя «GPTBot.uz».
2. До 25.09: валидация Offer в Rich Results Test; GSC → Request indexing для `/` и 3–5 самых важных переписанных страниц.
3. До 30.09: LLMO-проверка без браузинга и O/X-baseline цитирований (шаблоны в аудите, разделы 3.2 и 3.8).
4. 02.10 и ≈ 22.10: контрольные точки из таблицы выше; при падении CTR брендового запроса или лидеров — откат title/h1 главной (`index.html`, `src/i18n.ts`, `scripts/prerender-home.ts`) одним коммитом, baseline-цепочка хранит предыдущую ревизию.
5. Остальное по roadmap аудита (Phase 2 intent-страницы, F04 первоисточник, Yandex-лейн 4.1–4.4).

## Дополнение: полная проверка деплоя и follow-up 308cf787

По команде владельца «проверь, чтобы все улучшения были корректно задеплоены» выполнен полный обход живого домена без JS (скрипт-верификатор: 288 URL sitemap, 25 md-двойников, 2 фида, llms-файлы, React-бандл главной, origin pages.dev).

**Подтверждено на 3100583:** 288/288 → 200, noindex 0, self-canonical 288, h1 = 1 везде, JSON-LD парсится без ошибок; `og:site_name` = GPTBot.uz на всех страницах с og-блоком; ни одного title с хвостом «| GPTBot»; live title = title в content на 288/288; Organization (`#org`) с `alternateName: GPTBot` и Яндекс Картами в `sameAs` на 282 страницах; WebSite «GPTBot.uz» на 280; подпись «Проверено командой GPTBot.uz» на 94 страницах; React-бандл главной содержит новый h1 и не содержит «GPTBot — »; Offer ровно на 34 страницах = 34 страницы с чипом цены, `minPrice` совпадает с чипом на всех, помесячные — SMM RU/UZ; title > 65 — 0, description > 160 — только два защищённых лидера; 24 переписанных документа live = content; 10 лидеров: title/h1/description/canonical как в baseline (главная — с «GPTBot.uz —»); 25 twins → 200 `text/markdown` + `noindex` + H1 + FAQ, ссылка `text/markdown` верна на всех 282 HTML-страницах; все 112 URL из llms.txt/llms-full.txt → 200; фиды RU/UZ — валидный RSS 2.0, 50 записей, все из sitemap, `atom:link self`; RSS-ссылка на каждой странице; origin pages.dev = тот же манифест.

**Найдено и исправлено (follow-up, commit `308cf787`, deployment `https://68dfa99f.ai-direct-pro-landing.pages.dev`, `deployed_and_verified`):**

| Где | Было | Стало |
|---|---|---|
| `/ru/blog/`, `/uz/blog/` | title «Блог GPTBot — … \| GPTBot», h1 «Блог GPTBot» / «GPTBot blogi», без `og:site_name` (строки захардкожены в `scripts/prerender-blog.ts`) | «Блог GPTBot.uz — AI-боты и автоматизация заявок» (46) / «GPTBot.uz blogi — …», h1 «Блог GPTBot.uz» / «GPTBot.uz blogi», `og:site_name` добавлен |
| CTA-блок AI-чата в статьях (`scripts/chat-entry-cta.ts`) | «GPTBot — самостоятельный AI-сервис, не продукт OpenAI» / «GPTBot — mustaqil AI-xizmat» | «GPTBot.uz — …» в обеих локалях; заголовок входа на статье об оплате — «Попробуйте GPTBot.uz» |
| Инструменты контента | `apply-research.ts` подставлял суффикс «\| GPTBot», `apply-blog.ts` — автора «GPTBot Team» | «\| GPTBot.uz», «GPTBot.uz Team» |
| Baseline лидеров | `2026-09-18-fysa` | `2026-09-18-fysa-2`: у шести статей-лидеров изменился только body-текст (CTA-блок) |

Не трогал: `scripts/seed-pages.ts` (историческая посевная выборка, не рендерится), продуктовое имя «GPTBot AI» в кикере чата и в UI чата (это название продукта, не бренда сайта), строки UI инструмента AEO.

Ложные срабатывания первого прогона (не дефекты): шесть таймаутов при 8 потоках — повторный обход 288/288 → 200; узел Boss Digital на `/boss-digital/` (отдельная сущность рядом с `#org`); две RSS-ссылки на главной (RU + UZ — так и задумано); хвостовая пунктуация в URL из текста llms.

IndexNow повторно не отправлялся: полный список из 288 URL ушёл в 08:52 UTC того же дня, изменённые follow-up страницы в него входят.

**Повторный полный обход после follow-up (production = `308cf787`): все проверки пройдены** — 288/288 → 200, `og:site_name` = GPTBot.uz на 282/282 HTML-страницах (включая индексы блога), title с хвостом «| GPTBot» — 0, Offer 34/34, twins 25/25, фиды 2/2, лидеры без изменений title/h1/description/canonical, origin = домен. Отчёт и скрипт-верификатор: [`docs/seo/evidence/2026-09-18-fysa-2/live-verification-report.md`](../evidence/2026-09-18-fysa-2/live-verification-report.md), [`verify_live.py`](../evidence/2026-09-18-fysa-2/verify_live.py) — повторять после каждого релиза (`python verify_live.py`, ожидаемый commit в константе `EXPECTED`).
