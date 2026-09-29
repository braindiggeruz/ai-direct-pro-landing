# Полный SEO-аудит gptbot.uz и исправления — 2026-09-29

Аудит: краулинг 289 URL + 11 специализированных проверок (technical, content, schema,
sitemap, performance, visual, GEO, local, backlinks, clusters, SXO). Полные находки лежат вне Git:
`C:\Users\Borinio\Desktop\seo-skills-main\gptbot.uz-audit\findings\*.md`.

Решения владельца (2026-09-29): часы работы **Пн–Сб 10:00–19:00**; `/ru/` → **301 на `/`**.

## Что исправлено в коде

| # | Находка аудита | Исправление |
|---|---|---|
| 1 | `/ru/` — отдельная страница (999 слов, свой H1) с canonical на `/`: две русские «главные» конкурируют | `/ru/` и `/ru` → 301 на `/` (`content/seo/redirects.json`); `content/pages/ru/hub.json` удалён; 34 контекстные ссылки «AI-боты для бизнеса в Узбекистане» и ссылка с главной переведены на `/` |
| 2 | Sitemap: hreflang с задвоенным хостом `https://gptbot.uzhttps://…` | `generate-sitemap.ts` нормализует абсолютные URL; исходный JSON статьи исправлен |
| 3 | Sitemap: self-only hreflang у 120 одноязычных URL, которых нет в HTML | Sitemap пишет hreflang только для настоящей пары RU↔UZ — то же правило, что в prerender (148 = 148) |
| 4 | x-default пары `/ru/gpt-chat/` ↔ `/uz/gpt-uzbek-tilida/`: в sitemap RU, на странице UZ | Значение перенесено в `hreflangXDefault` обеих JSON; sitemap и prerender читают одно поле, `X_DEFAULT_BY_URL` удалён |
| 5 | 98 из 101 UZ-страниц: логотип и хлебные крошки ведут на русскую `/` | Логотип, хлебные крошки и BreadcrumbList на UZ-страницах и в UZ-блоге ведут на `/uz/` |
| 6 | Часы: schema Пн–Сб 10–19, llms.txt и UZ-статья Пн–Пт 09–18, на странице часов не видно | llms.txt и статья приведены к Пн–Сб 10:00–19:00; часы видны во всех футерах (RU/UZ, лендинги, блог, главная, React-футер) |
| 7 | Organization.sameAs = личный Telegram и GitHub основателя | Organization.sameAs — только карточки компании (`businessProfiles`); личные профили остаются у Person |
| 8 | ContactPoint `customer support` для номера продаж | `contactType: sales` |
| 9 | Title главной «… \| Telegram» | **Не менялся намеренно**: главная — лидер трафика под защитным гейтом (`scripts/seo-protection.ts`); менять title лидера без данных GSC о CTR — риск без доказанной выгоды |
| 10 | H1 React-главной без «в Узбекистане», SEO-оболочка — с ним | React H1 совпадает с оболочкой |
| 11 | Кириллическая подпись автора на латинских UZ-страницах | `authorNameLatin: Boris Gerasimov` на UZ; Person.alternateName |
| 12 | 14 RU-лендингов: «Обновлено: июнь 2026» в тексте против ISO-даты в шапке | Фраза удалена, дата остаётся одна — в шапке |
| 13 | 6 meta description длиннее 160 символов | 4 сокращены до 153–157; 2 статьи из защищённой десятки (`chatgpt-telefon…`, `chatgpt-ozbekistonda-vpnsiz…`) оставлены как есть по той же причине, что и title главной |
| 14 | `/favicon.ico` → 404; иконка 80×80 не кратна 48px (требование Google для фавиконки в выдаче) | `/favicon.ico` (16/32/48) и `logo-sq-96.png` во всех шаблонах |
| 15 | Статьи блога: `Article`, `mainEntityOfPage` строкой | `BlogPosting`, `mainEntityOfPage` — `WebPage` |
| 16 | Бренд совпадает с краулером OpenAI GPTBot | В llms.txt строка «Not to be confused with …» (решение F01 о `alternateName: GPTBot` в JSON-LD сохранено) |

Проверено и отклонено: «конфликт цен 990 000 / 1 990 000» — это разные тарифы
(базовый Telegram-бот и AI-бот), противоречия нет.

## Защищённые страницы
Гейт `seo-protection` остановил первую сборку: изменения задели 10 лидеров трафика. Title и описания лидеров возвращены; остальное проверено пословным diff и зафиксировано новой ревизией `docs/seo/evidence/2026-09-29-full-audit/reviewed-protected-pages.json` (только часы в футере, латинская подпись автора и ссылки логотипа/крошек на `/uz/` в UZ-статьях, удалённая ссылка на `/ru/` в оболочке главной). Title, H1, description, canonical, robots и hreflang всех десяти страниц не изменились.

## Проверка
- `npx tsc -b` — 0 ошибок; `seo-audit.ts` — 0 critical; `build:fast` — exit 0, sitemap 288 URL, 148 с hreflang, 24 user-редиректа.
- SEO-тесты по одному файлу — все зелёные (link-graph 17, home-hreflang 4, page-integrity 15, cluster 19, redirects 4, indexation-hygiene 11, homepage-shell 5, intent 5, recovery 6, protection 3 и др.).
- Полный `npm test`: 629/631. Два падения в `tests/lead-radar.test.ts` воспроизводятся на чистом `origin/main` (датозависимые фикстуры, известны с 2026-09-28) — не связаны с этим изменением.
- ESLint изменённых файлов — 0.

## IndexNow
2026-09-29 10:36 UTC: один батч из 289 URL (все 288 URL sitemap — в релизе изменились JSON-LD Organization и видимые часы на каждой странице — плюс `/ru/` как новый 301). Каждый URL проверен live перед отправкой: 200, self-canonical, indexable. HTTP 200 — приём уведомления (Bing, Yandex, Seznam, Naver, Yep), не индексация. Квитанция: `reports/indexnow-receipts/2026-09-29T10-36-34-631Z_manual_full_audit_release.json`. Google IndexNow не использует — для него GSC «Запросить индексирование» (10 URL в день).

## Что осталось владельцу (код не решает)
1. **Google Business Profile** «Boss Digital»: адрес Little Ring Road 57 → Yahyo Gulyamov ko‘chasi 35, телефон → +998 50 587 07 20, сайт → gptbot.uz, часы Пн–Сб 10–19.
2. **Яндекс Бизнес** «Gptbot.uz»: метка стоит в Навоийской области без адреса; поставить адрес в Ташкенте, убрать нерелевантные рубрики (ресторан), часы Пн–Сб 10–19.
3. **Cloudflare Page Rule** `gptbot.uz/?lang=ru` → сейчас ведёт на `/ru/` (теперь 2 хопа до `/`); перенаправить сразу на `/`.
4. **Cache Rule** для HTML (сейчас `cf-cache-status: DYNAMIC` на каждом запросе).
5. Настоящие отзывы и кейсы с цифрами, e-mail и юрлицо — для E-E-A-T.
6. Перевод топ-RU статей на узбекский (85 из 113 без пары), видео-демо, внешние ссылки.
7. Google API key для PageSpeed/CrUX — полевые Core Web Vitals сейчас не измерены.
