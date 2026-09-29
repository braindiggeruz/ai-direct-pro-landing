# Журнал изменений для замеров — сентябрь 2026

Что и когда менялось на страницах gptbot.uz 28–30.09.2026. По этому журналу читаются замер 03.10 (формула сниппетов на девяти UZ-страницах) и замер 20.10 (десять защищённых лидеров).

**30.09:** замер 03.10 отменён (удержание снято 29.09), замер 20.10 и черновики сниппетов заменены релизом по свежим данным GSC — план замера и пороги отката в разделе «30.09 — релиз по свежим данным GSC» в конце файла.

**Как собран.** Списки URL и полей не набирались руками. Для каждого коммита — `git -c safe.directory=* show --name-status <sha>`. Каждый файл `content/pages/**` и `content/blog/**` сопоставлен с URL по его полю `"url"`. Поля — это ключи JSON, значение которых отличается от родительского коммита. Редиректы — разница `content/seo/redirects.json`. Шаблонные правки (`scripts/`, `src/`, `index.html`, `content/global/site.json`) меняют сразу много страниц; они перечислены словами у каждого коммита.

**Отметки.** **[P]** — одна из десяти защищённых страниц (`PROTECTED_PATHS` в `scripts/seo-protection.ts`), замер 20.10. **[H]** — одна из девяти страниц теста формулы от 19.09 (коммиты 3b40a2ef и 2e574271; `scripts/measurement-hold.ts`), замер 03.10; удержание снято 29.09.

**Колонки.** «Сниппет/H1 = да» — менялись title, description (включая og) или H1. «текст» — тело страницы или intro. «ссылки» — список `internalLinks`. «даты» — `dateModified`, `updatedAt`, `lastReviewedAt`. «keywords» на странице не видны.

## Выкаты

| Выкат (production) | Коммиты | Когда | Deployment | Файлов контента |
|---|---|---|---|---|
| Рекламный релиз | cc969d80 + 32c4fd99 | 28.09.2026, live-проверка 17:28 UTC | `3b76e913` | 45 URL |
| Третий проход | d4f48ab7 | 28.09.2026, IndexNow 18:21 UTC | `077a52c9` | 3 URL + главная (React) + индексы блога |
| Редиректы 404 | 9f15ffb2 | 28.09.2026, время не записано | не записан | 0 (4 редиректа) |
| Полный аудит | 2cea30dc + 807c3d5c | 29.09.2026, IndexNow 10:36 UTC | `1cd04819` | 45 файлов, включая удалённый `/ru/`, + все страницы через шаблон |
| Лид-формы | 1902504e (+ квитанции e4742c7e) | 29.09.2026, IndexNow 17:35 UTC | `40abb45f` | 5 URL + шаблоны |
| **pending: релиз по свежим данным GSC** | рабочее дерево ветки `seo/full-audit-fixes-20260929` против `e4742c7e` | не выкачен | — | 10 URL + анкор на главной + 5 бывших страниц удержания + экран чата |

Коммиты b2a6f5ab, 99bb4307, 7557b292 и 7b78175f — только документы и квитанции, страниц не меняют.

## Замер 03.10 — девять страниц теста формулы

**Отменён 29.09.** Удержание снято (`scripts/measurement-hold.ts`): 4 из 9 страниц не переобходились после 19.09, у остальных пяти 0–66 показов за 14 дней и 0 кликов — эффект CTR на таких объёмах не виден. Раздел оставлен для истории.

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

**Заменён 30.09** планом из раздела «30.09 — релиз по свежим данным GSC»; черновики сниппетов 20.10 отменены (`docs/seo/snippet-drafts-2026-10-20/DRAFTS-RU.md`). Строки ниже — история до 29.09.

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

### 1902504e — 2026-09-29 22:32 +0500

`feat(leads): accept calculator leads again, attribute every lead, add page lead form`

Выкачен 29.09.2026: production `1902504e`, Cloudflare Pages deployment `40abb45f`, IndexNow — 115 URL в 17:35 UTC (квитанции — коммит e4742c7e). Состав — против `7b78175f`:

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

## 30.09 — релиз по свежим данным GSC

Не выкачен. Рабочее дерево ветки `seo/full-audit-fixes-20260929` против HEAD `e4742c7e` (production — `1902504e`). Основание — поручение владельца от 29.09: усилить SEO по свежим данным GSC. Правки защищённых страниц разрешены, если каждая обоснована данными по запросам и записана в новой ревизии эталона. Данные: выгрузка GSC 29.09 (`C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/raw/gsc-2026-09-29/`, `dataState=all`, последние 3 дня неполные) и запросы к API 30.09. Дата в контенте (`updatedAt`, `lastReviewedAt`, `dateModified`) — 2026-09-30; если выкат будет позже, эти поля нужно сдвинуть.

Пакеты: leaders-intent (L1–L10), secondary-pages (S1–S4), chat-first-screen (C1, C2), protected-baseline (снятие удержания, эталон, этот раздел). **[H→]** — бывшая страница удержания 19.09; удержание снято 29.09.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/uz/gpt-uzbek-tilida/` | **[P]** | description (+og): «…VPNsiz, javob o‘zbek tilida. GPTBot.uz — mustaqil AI-chat, OpenAI mahsuloti emas.»; текст: первым — раздел `#chatgpt-kirish` «ChatGPT kirish: rasmiy sayt yoki ro‘yxatsiz o‘zbekcha chat» (chatgpt.com или независимый чат), H2 `#jaji-piti`, H2 «ChatGPT bepul: …» и фраза о лимите, новый анкор на статью о входе; keywords; даты. JSON-LD: без FAQPage (15 вопросов не показывались на странице). Экран чата (React, не в HTML пререндера): строка «Rasmiy ChatGPT kerakmi? chatgpt.com — OpenAI sayti…» | да (description) |
| `/uz/blog/chatgptga-qanday-kirish-mumkin/` | **[P]** | description (+og): «ChatGPT’ga kirish (login): rasmiy chatgpt.com, Log in yoki Sign up — 3 qadam, odatda VPNsiz. Kod kelmasa yoki sayt ochilmasa nima qilish.» (137 зн.; текст пакета leaders-intent без «kirish» заменён при ревью); новый FAQ[0] «ChatGPT’ga qanday kirish mumkin?»; ссылка на UZ-чат в тексте; keywords (убраны «chatgpt ochish», «chatgpt online kirish»); даты. Title и H1 прежние | да (description) |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | **[P]** | description (+og), 177 → 138 знаков, без «3 daqiqada»; новый FAQ[0], вопрос «skachat (скачать)», ответ о платных тарифах; два H2 («…ochish: brauzerda ishlatish», «…kompyuterga yuklab olish: Windows va macOS»); keywords (+ «chatgpt ochish»); даты. Title и H1 прежние | да (description) |
| `/ru/gpt-chat/` | **[P]** | description (+og): «…пишите по-русски или по-узбекски (uzbekcha) — ответ на языке вопроса. Независимый AI-чат GPTBot.uz, не OpenAI.»; текст: ссылка на инструкцию по установке (UZ), абзац о входе на chatgpt.com, «Telegram-бот для бизнеса» вместо Telegram Ads; ссылки; даты. JSON-LD: без FAQPage (8 вопросов не показывались на странице). Экран чата (React): строка про chatgpt.com, «O‘zbekcha» в шапке, ссылка «O‘zbekcha sahifa →» | да (description) |
| `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` | **[P]** | ссылки: две цели → `/ru/blog/chatgpt-ili-ai-bot-dlya-biznesa/` и `/ru/ai-bot-dlya-biznesa/` (было `/uz/blog/chat-gpt-uzbek-biznes-uchun/`); анкоры и даты прежние |  |
| `/` | **[P]** | текст оболочки: один анкор — H1 страницы чат-ботов (строка ниже) |  |
| `/ru/gpt-vs-chatgpt-sravnenie/` |  | title «GPT и ChatGPT: расшифровка и разница простыми словами», description (+og), keywords, даты; H1 прежний | да |
| `/ru/luchshie-razrabotchiki-chat-botov-tashkent/` |  | title «Разработка чат-ботов в Ташкенте на заказ \| GPTBot.uz», H1 и heroTitle «Разработка чат-ботов на заказ в Ташкенте», description (+og), первый абзац, даты | да |
| `/ru/telegram-bot-dlya-biznesa/` |  | первый абзац («Создаём Telegram-ботов на заказ…»), даты |  |
| `/ru/avtor-boris-gerasimov/`, `/uz/muallif-boris-gerasimov/` |  | JSON-LD `ProfilePage`: `dateCreated`/`dateModified` с часовым поясом (URL Inspection: «Invalid datetime value») |  |
| `/uz/internet-reklama-toshkent/` | **[H→]** | шапка лендинга с разделами и RU/UZ; форма заявки (`internet-reklama`) |  |
| `/uz/telegram-reklama/` | **[H→]** | шапка лендинга с разделами и RU/UZ; форма заявки (`telegram-ads`) |  |
| `/uz/ai-sotuvchi/`, `/uz/gpt-bot-biznes-uchun/`, `/uz/sayt-yaratish/` | **[H→]** | шапка лендинга с разделами и RU/UZ |  |

- Без изменений: четыре защищённые страницы (`/ru/blog/chatgpt-i-claude-v-uzbekistane/`, `/uz/blog/chatgpt-uzbek-tilida-promptlar/`, `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/`, `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/`) и четыре бывшие статьи удержания (`/uz/blog/internet-reklama-narxi-ozbekiston-2026/`, `/uz/blog/target-reklama-nima/`, `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/`, `/uz/blog/marketing-nima/`): шаблон статей шапку с разделами и форму не ставит.
- Код без изменения HTML пререндера (кроме хешей бандла): `src/gpt-chat/*` (экран чата), `src/lib/analytics/yandexMetrika.ts` и `scripts/analytics-metrika.ts` — новые цели Метрики `official_chatgpt_click` и `chat_locale_switch`. `scripts/measurement-hold.ts` — удержание снято (список пуст, прежние девять адресов — в комментарии). `scripts/lead-form.ts` — форма на двух UZ-лендингах рекламы.
- `scripts/prerender.ts` — FAQPage в JSON-LD только там, где шаблон показывает вопросы. У шаблона чата (`renderGptChatMain`) блока FAQ нет, и оба чата отдавали FAQPage на скрытые вопросы (15 на `/uz/gpt-uzbek-tilida/`, 8 на `/ru/gpt-chat/`) — это нарушает правило Google о видимости размеченного контента. Из `schemaTypes` обоих чатов FAQPage убран; вопросы в JSON страниц остались. Видимый HTML и контракт защищённых страниц не изменились. Сторож — `tests/seo-page-integrity.test.ts`: у gpt-chat-страницы нет FAQPage, и каждый вопрос FAQPage в `dist/` виден на странице (284 страницы с FAQPage).

**Доказательства (GSC, по запросам; окна включительно):**

- Сайт в целом: недели 07–13.09, 14–20.09, 21–27.09 — 354 / 314 / 361 клик на 32 450 / 31 388 / 33 551 показ, CTR 1,0–1,1 %. Сдвиг возможен только через CTR лидеров.
- «chatgpt kirish», все URL вместе: 04–12.09 (одна статья о входе) — 6,44 клика/день, CTR 0,34 %, поз. 7,25; 04–17.09 — 4,86/день, 0,28 %, поз. 7,63; 20–28.09 — 8,44/день, 0,46 %, поз. 7,55. Доли показов 20–28.09: UZ-чат 59 % (поз. 7,4, CTR 0,44 %), статья о входе 28 % (поз. 8,6), RU-чат 13 % (поз. 5,8). Ведущий URL Google сменил 13.09.
- Качели 20–23.09 (13,25 клика/день) против 24–28.09 (4,6/день, CTR 0,30 %) — не шум. 20–23.09 RU-чат показывался на поз. ~5,8 и взял 14 кликов (CTR 0,84 %), 24–28.09 — 0 кликов на 422 показа. Пуассоновское SD среднего при ~7 кликах/день: за день ~2,6, за 5 дней ~1,2/день, за 14 дней ~0,7/день. Ротация URL в выдаче сдвигает клики сильнее, чем правка сниппета.
- Статья о входе: на уровне страницы CTR 0,33 % → 0,38 % (04–17.09 → 20–29.09), а по «chatgpt kirish» 0,29 % → 0,41 %. Постраничное чтение прячет эффект — читать только по запросам.
- «chatgpt yuklab olish uzbek tilida» на статье о загрузке: 2,07 %, поз. 4,18 (04–17.09) → 2,74 %, поз. 3,14 (20–29.09); 16–29.09 — 134 клика, 5 550 показов, 2,41 %, поз. 3,38 (API 30.09; более ранняя выгрузка того же дня — 137 / 5 555, 2,47 %; C11).
- «chatgpt ochish»: 92 % показов 20–29.09 — у статьи о загрузке (12 кликов на 1 847, поз. 6,6), у статьи о входе 8 %, без кликов.
- RU-чат: «на русском» — 5 показов за 28 дней; 55 кликов 20–29.09, в основном по узбекским запросам.
- Бывшие страницы удержания: 4 из 9 не переобходились после 19.09 (последние обходы 02.09, 03.09, 04.09, 18.09), у остальных пяти 0–66 показов за 14 дней и 0 кликов.

**Intent-manifest** (`content/seo/intent-manifest.json`):

- C22 — новая пара. Голый «chatgpt kirish» отдан UZ-чату (честный раздел «rasmiy sayt yoki ro‘yxatsiz chat»), статье о входе — логин-хвост. Пара временная до гейта этапа 2.
- C18 — для головных запросов заменена: условия успеха 18.09 не выполнены (доля статьи по «chatgpt kirish» 28 % против ≥80 %). Забор против VPN-статьи остаётся.
- C11 — «chatgpt ochish» признан за статьёй о загрузке (так его ведёт Google с 11.09); записан триггер отката description.

**Эталон защищённых страниц.** `BASELINE` → `docs/seo/evidence/2026-09-30-gsc-driven/reviewed-protected-pages.json`; ревизия `2026-09-29-full-audit` не менялась. В `reviewedChanges` — каждая правка шести страниц, включая то, чего гейт не видит: JSON-LD (FAQ, снятый с чатов FAQPage, `dateModified`, `keywords`), `og:`/`twitter:description`, экран чата. Ревизия ещё не выкачена и пересобрана после ревью (description статьи о входе, FAQPage, правила замера); прежние ревизии не трогались. Title, H1, canonical, robots, googlebot и hreflang всех десяти — без изменений. `npx tsx scripts/seo-protection.ts check` — 10/10.

**Помехи для замера:**

- x-default пары чатов изменён в 2cea30dc (выкат 29.09). Ни один чат с тех пор не переобходился: URL Inspection 30.09 — UZ-чат 26.09, RU-чат 25.09. Статья о входе — 18.09, статья о загрузке — 29.09 в 19:38 UTC, до этого релиза.
- Около 20 правок на четырёх лидерах (с экраном чата) уходят одним выкатом вместе с ещё не прочитанным x-default. Разделить их эффекты нельзя: релиз читается как одно вмешательство, выводов по отдельной правке не делать.
- CTR нормирует спрос, позиция показанного URL — ротацию; дни, когда показывается RU-чат, считаются отдельно.
- Контроль с неизменными сниппетами слабый: узбекские запросы вне четырёх лидеров, без «kirish» и без `^ai ?[0-9]{4,}` — около 37 показов и 0,4 клика в день (16–29.09). Он ловит только общий сдвиг сайта, а не эффект правки.

### План замера

- **Старт отсчёта T0** — позднейшая из дат переобхода после выката (`lastCrawlTime` в URL Inspection) для `/uz/gpt-uzbek-tilida/` и `/uz/blog/chatgptga-qanday-kirish-mumkin/`. Чтения — T0+14 и T0+28. Для статьи о загрузке T0 — её собственный переобход.
- **Как считать.** Только по запросам, не по страницам. «chatgpt kirish» — сумма по всем URL: UZ- и RU-чат как одна пара плюс статья о входе. CTR = клики / показы; позиция — средняя, взвешенная по показам; отдельно — доли URL и позиция показанного URL. Дни, когда RU-чат получил ≥ 50 показов, — отдельной строкой. Мобильный CTR — отдельно (измерение device). Из сумм по сайту и контролю исключать запросы `^ai ?[0-9]{4,}`; последние 3 неполных дня не брать.
- **База** — 14 дней до выката, 16–29.09; перевыгрузить, когда данные станут окончательными. Предварительно (API 30.09): 96 кликов на 23 098 показов, 6,86 клика/день, CTR 0,42 %, поз. 7,65. SD CTR за 14 дней при таком объёме ≈ 0,04 п. п., SD среднего кликов ≈ 0,7/день.

**Вердикт по «chatgpt kirish»** — два чтения, T0+14 и T0+28, у каждого свои 14 дней. Чтение судится только при средней позиции 7,2–8,1 и ≥ 1 400 показов/день; иначе цифры записываются без вердикта. Правила одни и те же здесь, в заметке пары C22 (`content/seo/intent-manifest.json`) и в `note` ревизии `2026-09-30-gsc-driven`:

| CTR по запросу, все URL | Вердикт |
|---|---|
| ≥ 0,50 % (база + 2 SD) | оставить; разрешён этап 2 |
| 0,33–0,50 % | держать: этап 2 не делать, прочитать T0+28 |
| < 0,33 % (база − 2 SD) | потеря: откат, если она подтверждена или если и T0+14, и T0+28 ниже 0,33 % |

- **Почему «оставить» выше базы.** Этап 2 — новое вмешательство на защищённых страницах, и его нужно заработать улучшением. Прежний гейт 0,40 % лежал ниже базы 0,42 % и при нулевом эффекте срабатывал примерно в 65 % случаев; прежний откат < 0,28 % оставлял в зоне «держать» падение с 0,42 % до 0,30 % (≈ −29 %).
- **Подтверждение потери.** Среднее кликов за 14 дней ниже базы больше чем на 2 SD (больше ~1,4 клика/день), и контроль за те же дни так не упал. Одно неподтверждённое чтение ниже 0,33 % считается «держать».
- **Два чтения — предел.** Если после T0+28 нет ни «оставить», ни потери — вывод «эффект не измерим»: правки этапа 1 остаются, этапа 2 нет, отката нет.
- **Порогов в кликах в день нет:** в них смешаны спрос и ротация URL. Прежние пороги «≥ 7,0/день — оставить, < 5,0/день — откат» и отдельный гейт «≥ 6,4/день» не используются: 5,0 выше нынешнего провала 24–28.09 (4,6/день), а 7,0 выше лучшего устойчивого режима (6,44/день, 04–12.09).
- **Откат — весь релиз по «chatgpt kirish», а не его часть** (правки читаются как одно вмешательство). Вернуть значения из `e4742c7e` (`git show e4742c7e:<файл>`): `/uz/gpt-uzbek-tilida/` — description (+og), блоки текста, которые менял релиз (раздел `#chatgpt-kirish` с прежним H2 «ChatGPT’ga o‘zbek tilida qanday kirish mumkin?», абзацем и анкором «ChatGPT kirish yo‘riqnomasi» — на прежнее место; H2 `#jaji-piti` убрать, абзац о написаниях вернуть; H2 «ChatGPT o‘zbek tilida bepulmi?» вернуть, добавленную фразу убрать), анкор в `internalLinks`, `secondaryKeywords`; статья о входе — description (+og), FAQ[0], абзац со ссылкой в тексте, keywords; `/ru/gpt-chat/` — description (+og) и абзац о входе на chatgpt.com; строка про chatgpt.com на экране обоих чатов (`premium.officialLead`/`officialTail` в `src/gpt-chat/i18n.ts` и её вывод в `src/gpt-chat/components/AiChatConsole.tsx`). Не откатываются (это не рычаги «chatgpt kirish»): ссылки RU-чата на инструкцию по установке и на Telegram-бота, вход «O‘zbekcha», цели ссылок в статье об оплате, снятие скрытого FAQPage с чатов и статья о загрузке (у неё своё правило, ниже). Затем сдвинуть даты страниц, записать новую ревизию `docs/seo/evidence/<дата>-<имя>/` и направить на неё `BASELINE`. Старую ревизию в `BASELINE` не возвращать.

**Статья о загрузке** (C11): «chatgpt yuklab olish uzbek tilida» на её URL, чтения T0+14 и T0+28 от её переобхода, только при поз. ≤ 3,5. База 16–29.09 — 134 клика, 5 550 показов, 2,41 %, поз. 3,38; SD CTR за 14 дней ≈ 0,21 п. п. Откат, если одно чтение ниже 2,0 % (база − 2 SD) или оба ниже 2,2 % (база − 1 SD). Прежний триггер «ниже 2,4 %» стоял на самой базе и при нулевом эффекте откатывал в 40–50 % случаев; «клики −15 %» убран — клики зависят от спроса. Правило двух чтений ловит и умеренную потерю, которую одиночный порог 2,0 % пропустил бы. CTR здесь сильно зависит от позиции (16–21.09 ≈ 1,6 % при поз. ~3,8; 22–28.09 ≈ 3,1 % при поз. ~2,9), поэтому на лучшей позиции, чем у базы, пороги консервативны. Откат: FAQ[0], формулировка вопроса «skachat (скачать)» и H2 web/pc с «Ha.» — из `e4742c7e`; description (+og) — «ChatGPT’ni telefonga va kompyuterga yuklab olish: Play Market, App Store va brauzer — 3 ta usul, bepul. Rasmiy OpenAI ilovasini soxta APK’dan qanday ajratish.» (158 зн.). Старый description дословно не возвращать: «3 daqiqada» ничем не подтверждено, а «birinchi sozlash, keng tarqalgan xatolar» обещает разделы, которых в статье нет. Ответ о платных тарифах («ixtiyoriy pullik tariflar») и keyword «chatgpt ochish» остаются. Затем — новая ревизия и `BASELINE` на неё.

**Этап 2** — перенос «chatgpt kirish» и «chatgpt online kirish» в keywords UZ-чата, решение о title статьи о входе, перенос трёх голых анкоров «ChatGPT kirish» на `/uz/gpt-uzbek-tilida/#chatgpt-kirish` — только при вердикте «оставить» по гейту C22.

**Повторный тест RU-title** — только если на сопоставимой позиции CTR RU-чата по узбекским запросам ниже, чем у UZ-чата, или доля переходов на узбекскую версию выше 20 % (цель Метрики `chat_locale_switch` ÷ визиты на `/ru/gpt-chat/`; `gpt_chat_open` на этой странице включает и эти переходы). До первого чтения владелец заводит в счётчике 111312750 JS-цели `official_chatgpt_click` и `chat_locale_switch`.

**Вторичные страницы (S1–S3):** объёмы малы (расшифровка GPT — около 4 показов в день; «разработка чат ботов ташкент» — 13 показов за 28 дней на поз. 15,1), порогов нет — смотреть позицию.

**Снятие удержания:** замер 03.10 отменён. Бывшие страницы удержания — обычные страницы своих кластеров; отсчёт — с переобхода после выката.
