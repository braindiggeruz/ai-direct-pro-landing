# Журнал изменений для замеров — сентябрь 2026

Что и когда менялось на страницах gptbot.uz 28–29.09.2026 и в следующем релизе. По этому журналу читаются замер 03.10 (формула сниппетов на девяти UZ-страницах) и замер 20.10 (десять защищённых лидеров).

**Как собран.** Списки URL и полей не набирались руками. Для каждого коммита — `git -c safe.directory=* show --name-status <sha>`. Каждый файл `content/pages/**` и `content/blog/**` сопоставлен с URL по его полю `"url"`. Поля — это ключи JSON, значение которых отличается от родительского коммита. Редиректы — разница `content/seo/redirects.json`. Шаблонные правки (`scripts/`, `src/`, `index.html`, `content/global/site.json`) меняют сразу много страниц; они перечислены словами у каждого коммита.

**Отметки.** **[P]** — одна из десяти защищённых страниц (`PROTECTED_PATHS` в `scripts/seo-protection.ts`), замер 20.10. **[H]** — одна из девяти страниц теста формулы от 19.09 (коммиты 3b40a2ef и 2e574271; `scripts/measurement-hold.ts`), замер 03.10.

**Колонки.** «Сниппет/H1 = да» — менялись title, description (включая og) или H1. «текст» — тело страницы или intro. «ссылки» — список `internalLinks`. «даты» — `dateModified`, `updatedAt`, `lastReviewedAt`. «keywords» на странице не видны.

## Выкаты

| Выкат (production) | Коммиты | Когда | Deployment | Файлов контента |
|---|---|---|---|---|
| Рекламный релиз | cc969d80 + 32c4fd99 | 28.09.2026, live-проверка 17:28 UTC | `3b76e913` | 45 URL |
| Третий проход | d4f48ab7 | 28.09.2026, IndexNow 18:21 UTC | `077a52c9` | 3 URL + главная (React) + индексы блога |
| Редиректы 404 | 9f15ffb2 | 28.09.2026, время не записано | не записан | 0 (4 редиректа) |
| Полный аудит | 2cea30dc + 807c3d5c | 29.09.2026, IndexNow 10:36 UTC | `1cd04819` | 45 файлов, включая удалённый `/ru/`, + все страницы через шаблон |
| **pending: этот релиз** | рабочее дерево ветки `seo/full-audit-fixes-20260929` | не выкачен | — | 5 URL + шаблоны |

Коммиты b2a6f5ab, 99bb4307, 7557b292 и 7b78175f — только документы и квитанции, страниц не меняют.

## Замер 03.10 — девять страниц теста формулы

Тест читается только там, где после 19.09 менялась лишь формула. Ниже — правки файла страницы после коммита 2e574271, посчитанные `git log 2e574271..HEAD -- <файл>`.

| Страница | Правки контента после теста 19.09 | Что менялось | Чтение 03.10 |
|---|---|---|---|
| `/uz/internet-reklama-toshkent/` | 2 | 32c4fd99 (28.09): текст, FAQ, ссылки, keywords, даты; 2cea30dc (29.09): description | сниппет менялся — результат не относить к формуле |
| `/uz/telegram-reklama/` | 2 | cc969d80 (28.09): первый экран, текст, FAQ, даты; 32c4fd99 (28.09): текст, ссылки, источники | текст менялся — результат не относить к формуле |
| `/uz/blog/internet-reklama-narxi-ozbekiston-2026/` | 2 | cc969d80 (28.09): description, текст, FAQ, CTA, автор, даты; 32c4fd99 (28.09): FAQ, ссылки | сниппет менялся — результат не относить к формуле |
| `/uz/blog/target-reklama-nima/` | 3 | 32c4fd99 (28.09): текст, даты; d4f48ab7 (28.09): FAQ, keywords; 2cea30dc (29.09): description | сниппет менялся — результат не относить к формуле |
| `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` | 1 | 2cea30dc (29.09): description | сниппет менялся — результат не относить к формуле |
| `/uz/blog/marketing-nima/` | 0 | — | чистая по контенту |
| `/uz/ai-sotuvchi/` | 0 | — | чистая по контенту |
| `/uz/gpt-bot-biznes-uchun/` | 0 | — | чистая по контенту |
| `/uz/sayt-yaratish/` | 0 | — | чистая по контенту |

Итог: 5 из 9 страниц правились 28–29.09, у трёх из них 29.09 изменился description (2cea30dc). Читать тест по четырём чистым: `/uz/blog/marketing-nima/`, `/uz/ai-sotuvchi/`, `/uz/gpt-bot-biznes-uchun/`, `/uz/sayt-yaratish/`. У них тоже есть шаблонные правки, общие для всего сайта: JSON-LD `Organization` (28.09), часы в футере, логотип и крошки на `/uz/` (29.09). Этот релиз меняет на них только query-строку ссылки на Telegram (`?text=`), скрипт первого касания и код аналитики в `<head>`; навигации, формы и закреплённой панели на них нет (`scripts/measurement-hold.ts`).

## Замер 20.10 — десять защищённых страниц

- 28.09: контент защищённых страниц не менялся; общий JSON-LD `Organization` (часы) — на всех страницах.
- 29.09: видимые отличия пересмотрены и записаны в `docs/seo/evidence/2026-09-29-full-audit/reviewed-protected-pages.json` (часы в футере, латинская подпись и ссылки на `/uz/` у пяти UZ-статей, в оболочке главной нет ссылки на `/ru/`). Title, H1, description, canonical, robots и hreflang — без изменений.
- Этот релиз: только скрипт первого касания в `<head>` и обновлённый код аналитики. Ссылки на Telegram на защищённых страницах остаются без `?text=`. Гейт `npx tsx scripts/seo-protection.ts check` — 10/10 без изменений.

## Когорта релиза 28–29.09

Роадмап (п. 0) собирает группу страниц релиза из всех файлов коммитов cc969d80, 32c4fd99, d4f48ab7 и 2cea30dc. Уникальных URL контента: 85 (без удалённого `/ru/`). Из них защищённых: 4, на удержании: 5. Полный список — объединение таблиц ниже. Страницы, у которых 29.09 изменились только «ссылки» (замена `/ru/` на `/`), лучше держать отдельной подгруппой: текст и сниппет у них прежние. Четыре защищённые страницы в когорту не включать: после 807c3d5c их title, H1 и description прежние.

## По коммитам

### cc969d80 — 2026-09-28 11:25 +0500

`fix(seo): align advertising offers and RU/UZ price guides`

- Первый проход рекламного спринта: 5 посадочных и 10 статей. Убраны неподтверждённые цифры, уточнён состав пакетов, добавлены брифы, `compactHero` на RU-таргете и RU-Telegram Ads.
- Шаблон: `scripts/prerender.ts` (опциональный `compactHero`), `src/shared/types.ts`.
- **Отдельно не выкатывался** — ушёл в production вместе с 32c4fd99.

Контентных файлов: 15; из них защищённых **[P]**: 0, на удержании **[H]**: 2.

| URL | Отметка | Что изменилось в JSON | Сниппет/H1 |
|---|---|---|---|
| `/ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/` |  | description, текст, FAQ, CTA, ссылки, автор, даты | да |
| `/ru/blog/reklamnyy-byudzhet-skolko-protsentov-ot-oborota/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/ru/blog/skolko-stoit-internet-reklama-uzbekistan-2026/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/ru/blog/skolko-stoit-kontekstnaya-reklama-tashkent-2026/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/ru/blog/skolko-stoit-smm-i-vedenie-instagram-uzbekistan/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/` |  | description, текст, FAQ, CTA, источники, автор, даты | да |
| `/ru/smm-prodvizhenie-tashkent/` |  | текст, FAQ, даты |  |
| `/ru/targetirovannaya-reklama-tashkent/` |  | description, первый экран, текст, ссылки, даты | да |
| `/ru/telegram-ads-uzbekistan/` |  | первый экран, текст, FAQ, даты |  |
| `/uz/blog/internet-reklama-narxi-ozbekiston-2026/` | **[H]** | description, текст, FAQ, CTA, автор, даты | да |
| `/uz/blog/kontekst-reklama-narxi-toshkent-2026/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/uz/blog/reklama-byudjeti-qancha-bolishi-kerak/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/uz/blog/smm-xizmati-narxi-ozbekiston-2026/` |  | description, текст, FAQ, CTA, автор, даты | да |
| `/uz/smm-xizmatlari/` |  | текст, FAQ, даты |  |
| `/uz/telegram-reklama/` | **[H]** | первый экран, текст, FAQ, даты |  |

### 32c4fd99 — 2026-09-28 22:19 +0500

`fix(seo): apply the advertising audit fixes across landings and blog`

- Второй проход по аудиту рекламы: один набор порогов Telegram Ads, таблицы опубликованных тарифов на RU/UZ-хабах, сырые `{token}` и CTA без адреса по всему блогу, 17 анкоров.
- Шаблон на всех страницах: `Organization` в JSON-LD получил часы Пн–Сб 10:00–19:00 (`content/global/site.json`, `scripts/jsonld-helpers.ts`); `Service.hoursAvailable` остался только у страниц ботов; RU-страницы предзагружают латинский Geist; CTA с абсолютным `https://gptbot.uz/...` больше не `nofollow`; `compactHero` ещё на 5 RU-лендингах; в футере главной — «Аудит рекламы» и ссылки на другую языковую версию (`src/components/Footer.tsx`).
- Выкат вместе с cc969d80: 28.09.2026, deployment `3b76e913`, live-проверка 17:28 UTC (`docs/seo/advertising-2026-09-28/live-verification-2026-09-28.json`). IndexNow — 45 URL, 17:24 UTC; это ровно объединение двух таблиц ниже.

Контентных файлов: 45; из них защищённых **[P]**: 0, на удержании **[H]**: 4.

| URL | Отметка | Что изменилось в JSON | Сниппет/H1 |
|---|---|---|---|
| `/ru/blog/agentstvo-ili-birzha-frilansa-uzbekistan/` |  | текст, FAQ, даты |  |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` |  | текст, даты |  |
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` |  | текст, даты |  |
| `/ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/` |  | FAQ |  |
| `/ru/blog/kak-proverit-podryadchika-reklama-sayt-uzbekistan/` |  | текст, даты |  |
| `/ru/blog/pochemu-biznes-teryaet-zayavki-iz-instagram-telegram/` |  | текст, FAQ, даты |  |
| `/ru/blog/pochemu-reklama-v-instagram-ne-prinosit-zayavki/` |  | текст, даты |  |
| `/ru/blog/prodvizhenie-sayta-v-google-uzbekistan/` |  | текст, даты |  |
| `/ru/blog/prodvizhenie-sayta-v-yandekse-uzbekistan/` |  | текст, даты |  |
| `/ru/blog/reklamnyy-byudzhet-skolko-protsentov-ot-oborota/` |  | текст, FAQ, источники |  |
| `/ru/blog/seo-ili-google-ads-chto-vybrat/` |  | текст, даты |  |
| `/ru/blog/skolko-stoit-internet-magazin-tashkent-2026/` |  | текст, даты |  |
| `/ru/blog/skolko-stoit-internet-reklama-uzbekistan-2026/` |  | FAQ, ссылки |  |
| `/ru/blog/skolko-stoit-kontekstnaya-reklama-tashkent-2026/` |  | FAQ, ссылки |  |
| `/ru/blog/skolko-stoit-podderzhka-sayta-v-mesyac-uzbekistan/` |  | текст, даты |  |
| `/ru/blog/skolko-stoit-seo-prodvizhenie-uzbekistan-2026/` |  | текст, даты |  |
| `/ru/blog/skolko-stoit-smm-i-vedenie-instagram-uzbekistan/` |  | FAQ |  |
| `/ru/blog/skolko-stoit-sozdat-sayt-tashkent-2026/` |  | текст, FAQ, даты |  |
| `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` |  | текст, ссылки, даты |  |
| `/ru/blog/telegram-ads-ili-posevy-v-kanalah/` |  | текст, FAQ, источники, даты |  |
| `/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/` |  | текст, FAQ, источники |  |
| `/ru/digital-marketing-tashkent/` |  | первый экран |  |
| `/ru/internet-reklama-tashkent/` |  | первый экран, текст, FAQ, ссылки, даты |  |
| `/ru/kontekstnaya-reklama-tashkent/` |  | первый экран, текст, FAQ, ссылки, даты |  |
| `/ru/lokalnoe-seo-tashkent/` |  | ссылки |  |
| `/ru/marketingovyi-audit-tashkent/` |  | первый экран, ссылки, даты |  |
| `/ru/performance-marketing-tashkent/` |  | ссылки, даты |  |
| `/ru/razrabotka-saytov-tashkent/` |  | ссылки |  |
| `/ru/smm-prodvizhenie-tashkent/` |  | первый экран, текст, ссылки |  |
| `/ru/targetirovannaya-reklama-tashkent/` |  | ссылки |  |
| `/ru/telegram-ads-uzbekistan/` |  | description, текст, FAQ | да |
| `/uz/blog/agentlik-frilanser-yoki-birja-ozbekiston/` |  | текст, FAQ, даты |  |
| `/uz/blog/biznes-instagram-telegramdan-kelgan-arizalarni-nega-yoqotadi/` |  | текст, FAQ, даты |  |
| `/uz/blog/internet-dokon-yaratish-narxi-toshkent/` |  | текст, даты |  |
| `/uz/blog/internet-reklama-narxi-ozbekiston-2026/` | **[H]** | FAQ, ссылки |  |
| `/uz/blog/kontekst-reklama-narxi-toshkent-2026/` |  | FAQ, ссылки |  |
| `/uz/blog/reklama-byudjeti-qancha-bolishi-kerak/` |  | текст, FAQ, источники |  |
| `/uz/blog/sayt-yaratish-narxi-toshkent-2026/` |  | текст, FAQ, даты |  |
| `/uz/blog/seo-xizmati-narxi-ozbekiston-2026/` |  | текст, даты |  |
| `/uz/blog/smm-xizmati-narxi-ozbekiston-2026/` |  | FAQ |  |
| `/uz/blog/target-reklama-nima/` | **[H]** | текст, даты |  |
| `/uz/internet-reklama-toshkent/` | **[H]** | текст, FAQ, ссылки, keywords, даты |  |
| `/uz/seo-xizmati/` |  | ссылки, даты |  |
| `/uz/smm-xizmatlari/` |  | ссылки |  |
| `/uz/telegram-reklama/` | **[H]** | текст, ссылки, источники |  |

### d4f48ab7 — 2026-09-28 23:18 +0500

`feat(seo): link the service landings from the homepage and surface revised articles`

- Третий проход: на главной в React-части `<main>` блок «Реклама и продвижение под заявки» (`src/components/PromotionServices.tsx`) — SEO-оболочка `/` и её эталон не менялись; на `/ru/blog/` и `/uz/blog/` над сеткой появился список «Недавно обновлено» (`scripts/prerender-blog.ts`); сообщение чата после заявки называет часы Пн–Сб 10:00–19:00 (`src/gpt-chat/i18n.ts`).
- Выкат 28.09.2026, deployment `077a52c9`. IndexNow — 6 URL в 18:21 UTC: три статьи ниже, `/`, `/ru/blog/`, `/uz/blog/`.

Контентных файлов: 3; из них защищённых **[P]**: 0, на удержании **[H]**: 1.

| URL | Отметка | Что изменилось в JSON | Сниппет/H1 |
|---|---|---|---|
| `/ru/blog/chto-takoe-lid-v-marketinge/` |  | title, description, H1, текст, FAQ, keywords, даты | да |
| `/ru/blog/skolko-stoit-internet-reklama-uzbekistan-2026/` |  | текст |  |
| `/uz/blog/target-reklama-nima/` | **[H]** | FAQ, keywords |  |

### 9f15ffb2 — 2026-09-28 23:31 +0500

`fix(seo): redirect four crawled 404 URLs to same-intent pages`

- Только редиректы: четыре URL, которые Google сканировал и получал 404, отдают 301 на страницы с тем же интентом. Контент страниц не менялся.
- Время выката не записано. Этот коммит был production до выката 29.09 (`previousProduction` в `docs/seo/full-audit-2026-09-29/live-verification-2026-09-29.json`).

Новые редиректы (`content/seo/redirects.json`):

- `/ru/instagram-bot/` → `/ru/instagram-direct-bot/`
- `/ru/blog/ai-bot-ili-operator-chto-vybrat-biznesu/` → `/ru/ai-bot-ili-menedzher/`
- `/ru/blog/kak-podgotovit-biznes-k-vnedreniyu-gpt-bota/` → `/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/`
- `/ru/blog/skolko-stoit-telegram-bot-dlya-biznesa-uzbekistan/` → `/ru/blog/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/`

### 2cea30dc — 2026-09-29 15:11 +0500

`fix(seo): apply the full-site audit fixes across routing, hreflang, schema and NAP`

- Полный аудит сайта. `/ru/` и `/ru` → 301 на `/`; `content/pages/ru/hub.json` удалён; 34 контекстные ссылки на `/ru/` переведены на `/` (поэтому у большинства страниц ниже изменились только «ссылки» или «текст, ссылки»). Из 14 RU-лендингов удалена фраза «Обновлено: июнь 2026». Сокращены 6 description; два из них у защищённых статей откатил 807c3d5c.
- Шаблон на всех страницах: часы работы видны в каждом футере (RU/UZ, лендинги, блог, главная, React-футер); на UZ-страницах логотип, хлебные крошки и `BreadcrumbList` ведут на `/uz/`; латинская подпись автора на UZ; статьи блога — `BlogPosting`; `Organization.sameAs` — только карточки компании; `ContactPoint` — `sales`; `/favicon.ico` и иконка 96px; sitemap пишет hreflang только для настоящих пар RU↔UZ; `public/llms.txt`.
- **Отдельно не выкатывался** — ушёл в production вместе с 807c3d5c.

Контентных файлов: 45; из них защищённых **[P]**: 4, на удержании **[H]**: 3.

| URL | Отметка | Что изменилось в JSON | Сниппет/H1 |
|---|---|---|---|
| `/ru/` |  | файл удалён |  |
| `/ru/ai-bot-dlya-agentstva-nedvizhimosti/` |  | ссылки |  |
| `/ru/ai-bot-dlya-avtosalona/` |  | текст, ссылки |  |
| `/ru/ai-bot-dlya-biznesa/` |  | ссылки |  |
| `/ru/ai-bot-dlya-dostavki-edy/` |  | текст, ссылки |  |
| `/ru/ai-bot-dlya-fitnes-kluba/` |  | текст, ссылки |  |
| `/ru/ai-bot-dlya-horeca/` |  | ссылки |  |
| `/ru/ai-bot-dlya-kliniki/` |  | ссылки |  |
| `/ru/ai-bot-dlya-magazina/` |  | ссылки |  |
| `/ru/ai-bot-dlya-nishi/` |  | текст, ссылки |  |
| `/ru/ai-bot-dlya-salona-krasoty/` |  | ссылки |  |
| `/ru/ai-bot-dlya-sayta/` |  | текст, ссылки |  |
| `/ru/ai-bot-dlya-uchebnogo-tsentra/` |  | ссылки |  |
| `/ru/ai-bot-dlya-yurista/` |  | текст, ссылки |  |
| `/ru/ai-bot-ili-menedzher/` |  | текст, ссылки |  |
| `/ru/ai-bot-s-crm-amocrm-bitrix24/` |  | ссылки |  |
| `/ru/ai-menedzher-dlya-instagram/` |  | ссылки |  |
| `/ru/ai-prodavec/` |  | ссылки |  |
| `/ru/avtomatizatsiya-prodazh/` |  | ссылки |  |
| `/ru/avtomatizatsiya-zayavok/` |  | ссылки |  |
| `/ru/blog/chto-takoe-lid-v-marketinge/` |  | description | да |
| `/ru/chat-bot-dlya-biznesa/` |  | ссылки |  |
| `/ru/chat-bot-po-uzbekistanu/` |  | текст, ссылки |  |
| `/ru/chat-bot-v-samarkande/` |  | текст, ссылки |  |
| `/ru/gpt-bot-ili-obychnyy-chat-bot/` |  | текст, ссылки |  |
| `/ru/gpt-chat/` | **[P]** | hreflang |  |
| `/ru/instagram-direct-bot/` |  | ссылки |  |
| `/ru/kak-sdelat-ai-bota-telegram-instagram/` |  | текст, ссылки |  |
| `/ru/luchshie-razrabotchiki-chat-botov-tashkent/` |  | текст, ссылки |  |
| `/ru/okupaemost-chat-bota/` |  | текст, ссылки |  |
| `/ru/otzyvy/` |  | ссылки |  |
| `/ru/pochemu-biznes-teryaet-zayavki/` |  | текст, ссылки |  |
| `/ru/razrabotka-saytov-tashkent/` |  | ссылки |  |
| `/ru/razrabotka-telegram-bota-tashkent/` |  | ссылки |  |
| `/ru/stoimost-chat-bota/` |  | ссылки |  |
| `/ru/telegram-bot-dlya-biznesa/` |  | ссылки |  |
| `/ru/whatsapp-bot-dlya-biznesa/` |  | ссылки |  |
| `/uz/blog/agentlik-frilanser-yoki-birja-ozbekiston/` |  | текст |  |
| `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` | **[P]** | description | да |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | **[P]** | description | да |
| `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` | **[H]** | description | да |
| `/uz/blog/target-reklama-nima/` | **[H]** | description | да |
| `/uz/blog/veb-sayt-yaratish-ozbekistonda-narx-turlar-va-tanlash/` |  | hreflang |  |
| `/uz/gpt-uzbek-tilida/` | **[P]** | hreflang |  |
| `/uz/internet-reklama-toshkent/` | **[H]** | description | да |

Новые редиректы (`content/seo/redirects.json`):

- `/ru/` → `/`
- `/ru` → `/`

### 807c3d5c — 2026-09-29 15:16 +0500

`fix(seo): keep the protected leaders' snippets and review their new baseline`

- Гейт `seo-protection` остановил сборку: title главной и description двух защищённых UZ-статей возвращены. Остальные отличия защищённых страниц пересмотрены и записаны новой ревизией эталона `docs/seo/evidence/2026-09-29-full-audit/reviewed-protected-pages.json`: часы в футере, латинская подпись и ссылки логотипа/крошек на `/uz/` у пяти UZ-статей, ссылка на `/ru/` убрана из оболочки главной. Title, H1, description, canonical, robots и hreflang всех десяти не изменились.
- Выкат вместе с 2cea30dc: 29.09.2026, deployment `1cd04819`, production = `807c3d5c`. IndexNow — 289 URL (весь sitemap плюс `/ru/`), 10:36 UTC.
- **Итог выката 29.09 по JSON защищённых страниц**, от 9f15ffb2 до 807c3d5c: у `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/` добавлено поле `hreflangXDefault` (значение x-default на странице то же); JSON двух UZ-статей в итоге не изменился.

Контентных файлов: 2; из них защищённых **[P]**: 2, на удержании **[H]**: 0.

| URL | Отметка | Что изменилось в JSON | Сниппет/H1 |
|---|---|---|---|
| `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` | **[P]** | description | да |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | **[P]** | description | да |

### pending: этот релиз

Не выкачен. Рабочее дерево ветки `seo/full-audit-fixes-20260929` против HEAD `7b78175f`. Дату выката впишет тот, кто выкатит.

Контент (пакет C):

| URL | Отметка | Что изменилось в JSON | Сниппет/H1 |
|---|---|---|---|
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` |  | текст |  |
| `/ru/blog/priem-oplaty-payme-click-v-telegram-bote/` |  | текст |  |
| `/ru/stoimost-chat-bota/` |  | текст |  |
| `/ru/telegram-bot-dlya-biznesa/` |  | текст |  |
| `/uz/blog/telegram-botda-payme-click-humo-tolovlarini-qabul-qilish/` |  | текст |  |

- `/ru/blog/priem-oplaty-payme-click-v-telegram-bote/` и `/uz/blog/telegram-botda-payme-click-humo-tolovlarini-qabul-qilish/`: после основного ответа — раздел «Бот с приёмом оплаты Payme/Click под ключ». Цена — из опубликованной строки «Telegram-бот Pro» (от 4 900 000 сум, 14 дней), ссылка на `/ru/stoimost-chat-bota/` (UZ — на `/uz/chat-bot-narxi/`), кнопка в Telegram студии. В RU добавлена ещё ссылка на калькулятор.
- `/ru/telegram-bot-dlya-biznesa/`: сразу после вступления — стартовая цена «от 990 000 сум» со ссылкой на таблицу тарифов и кнопка «Обсудить бота и смету в Telegram». Раньше цены на странице не было.
- `/ru/stoimost-chat-bota/`: кнопка «Выбрать тариф и получить смету в Telegram» сразу под таблицей тарифов. Цена уже была во втором абзаце.
- `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/`: раздел «Пакеты ведения соцсетей в GPTBot.uz» — та же таблица пакетов, что на `/ru/smm-prodvizhenie-tashkent/`, оговорка про медиабюджет и ссылка на эту страницу.
- Даты `dateModified` и `lastReviewedAt` не менялись, как в третьем проходе d4f48ab7.
- Не сделано: ссылка с `/uz/blog/target-reklama-nima/` на `/uz/internet-reklama-toshkent/#target` (обе на удержании до 03.10). Раздел `#target` на хабе есть — ставить после замера.

Шаблоны и сервер (пакеты A и B, в тот же релиз):

- Все пререндеренные страницы, статьи, индексы блога и `index.html`: встроенный скрипт первого касания в `<head>` (`scripts/attribution-snippet.ts`, пишет `localStorage['gptbot_ft_v1']`). Не виден.
- Все страницы, кроме десяти защищённых: ссылки на `https://t.me/XGame_changerx` получают `?text=` с услугой и адресом страницы (`scripts/telegram-cta.ts`). Меняется только query ссылки. Затрагивает и девять страниц на удержании.
- Шапка лендингов (`renderLandingHeader`): второй ряд с разделами (Решения, Цены, Реклама, Блог; UZ — Yechimlar, Narxlar, Reklama, Blog) и переключатель RU/UZ в нём. Видимая правка на всех пререндеренных лендингах, кроме пяти лендингов на удержании, страниц gpt-chat и GPTBot Market — около 110 страниц по `content/pages`. Статьи блога и главная без изменений.
- Форма из двух полей перед FAQ на 24 страницах из `LEAD_FORM_PAGES` (`scripts/lead-form.ts`): 9 рекламных RU, `/uz/smm-xizmatlari/`, 7 бот-страниц RU, 5 бот-страниц UZ, `/boss-digital/`, `/uz/boss-digital/`. Защищённых страниц и страниц на удержании в списке нет.
- Закреплённая панель «Позвонить / Telegram» на `/boss-digital/` и `/uz/boss-digital/`.
- `/ru/kalkulyator-stoimosti-telegram-bota/`: форма калькулятора снова принимается сервером (с 04.09 все отправки отклонялись); в HTML меняется только хеш бандла.
- `/api/gpt/lead` пишет `source` (`gpt_chat`, `calculator`, `page_form`), услугу и атрибуцию; новые цели Метрики `telegram_cta_studio`, `telegram_cta_bot`, `phone_click`, `lead_form_success`, `calculator_lead_success`, `chat_lead_success`. На страницах не видно.

Страницы, где этот релиз меняет видимое содержимое, начинают новый отсчёт с даты выката. Для бот-страниц роадмап (п. 0) берёт за точку отсчёта их переобход после выката.

