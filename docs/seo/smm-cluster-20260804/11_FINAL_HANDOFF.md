# 11. Финальная передача

**Дата:** 2026-08-04. Проект GPTBot.uz, срез `SMM_CLUSTER_20260804`.

## SEO_SKILLS_USED

Требование постановки — не заявлять использование skill, пока его инструкция не прочитана. Ниже разделено на прочитанное и непрочитанное.

### Прочитано и применено

| Skill | Путь | Где применён |
|---|---|---|
| `keyword-research` | `C:\Users\Borinio\.claude\skills\keyword-research\SKILL.md` | Порядок работы взят оттуда: сначала первичные данные Search Console, затем расширение. Ключевое ограничение skill — «Do not invent metrics. If OpenSEO does not return a value, write `unknown`» — определило структуру `02_KEYWORD_RESEARCH.md`, где недоступные данные перечислены отдельным разделом вместо оценок. Также оттуда взят принцип приоритизации «business-fit и intent-fit важнее самого объёмного запроса» |
| `keyword-clustering` | `C:\Users\Borinio\.claude\skills\keyword-clustering\SKILL.md` | Правила кластеризации: «Same SERP intent and similar ranking pages belong together», «Similar words do not guarantee the same cluster», «Do not rely on lexical similarity alone. SERP intent wins». Именно на этом основании `smm услуги ташкент` и `smm продвижение ташкент` признаны одним кластером (одинаковая выдача), а `что такое smm услуги` и `что такое smm продвижение` — разными (разная выдача при похожих словах). Оттуда же — шаг 6 про выявление каннибализации и раскладка кластеров на «existing URL / new page / do-not-target», давшая решение не создавать Instagram-страницу и UZ-версию |
| `seo-audit` | `C:\Users\Borinio\.claude\skills\seo-audit\SKILL.md` | Применены только guardrails, не рабочий процесс: «Verify every finding against the live page HTML by fetching pages yourself. Report nothing you have not seen evidence for» (проверка live-страницы hub и страниц конкурентов), «Missing backlink or ranking data means "no recorded data", not a penalty» (трактовка нулевых показов GSC), «Separate what the tools reported from what you verified yourself» (структура `03_SERP_ANALYSIS.md`). Основной workflow skill не выполнялся — он построен на `run_site_audit`, `get_backlinks_overview`, `get_domain_overview`, а баланс кредитов OpenSEO равен нулю |

### Найдено, но не использовано

| Skill | Путь | Почему |
|---|---|---|
| `competitor-analysis`, `competitive-landscape` | `~\.claude\skills\` | Оба построены на платных вызовах OpenSEO (`get_ranked_keywords`, `get_backlinks_*`). При нулевом балансе неисполнимы |
| `link-prospecting` | `~\.claude\skills\` | Внешние ссылки вне скоупа спринта |
| `seo-project-setup`, `seo-coach` | `~\.claude\skills\` | Проект в OpenSEO уже настроен |
| `claude-seo/*` (33 skill), `claude-blog/*` (30 skill) | `~\.claude\skills\claude-seo\skills\`, `~\.claude\skills\claude-blog\skills\` | Обнаружены, инструкции **не читались**. Они рассчитаны на собственный контент-пайплайн и внешние провайдеры данных (DataForSEO, Ahrefs, Firecrawl); проект имеет собственный формат контента и собственные тесты качества, ломать которые ради чужого пайплайна нельзя |

**Честная оговорка:** ни один skill не был вызван через механизм Skill — три перечисленных были прочитаны как инструкции и применены вручную. Исследование выполнено собственным процессом, потому что платные инструменты, на которых построены эти skill, были недоступны.

## Ответы на вопросы постановки

**1. Что показал аудит существующего контента.** У сайта уже есть опубликованная коммерческая SMM-страница `/ru/smm-prodvizhenie-tashkent/` с Service-схемой, 8 FAQ и живым CTA, а также свежая обзорная статья `/ru/blog/chto-takoe-smm-prodvizhenie/` от 2026-08-02. UZ-локаль по теме SMM пуста. Найден дефект: hub не ссылался на свою тематическую статью, связь была односторонней.

**2. Какие запросы выбраны.** Три интент-кластера: цена и пакеты (8 запросов), состав услуг специалиста (6), договор (5). Hub усилен под коммерческий кластер (8 запросов).

**3. Почему именно они.** По каждому — разрыв в живой выдаче, а не по объёму: по «пакеты smm услуг» и «договор на оказание smm услуг» в топе нет ни одного узбекского результата, все шаблоны договоров построены на праве РФ; по «стоимость smm услуг ташкент» большинство страниц в топе цену вообще не называют; по «что входит в услуги smm специалиста» половина топа отвечает соискателям, а не покупателям.

**4. Какие URL созданы.** Три статьи — см. таблицу ниже.

**5. Какие существующие URL обновлены.** Четыре: hub, обзорная статья, статья про стоимость digital-маркетинга, статья про выбор агентства.

**6. Где устранена каннибализация.** Отказом от создания второй коммерческой страницы под тот же transactional-интент и отказом от Instagram-страницы. Границы между новыми статьями и существующей обзорной зафиксированы в `intent-manifest.json` и проверяются тестом.

**7. Какие внутренние ссылки добавлены.** 21 новая ссылка, полная карта в `07_INTERNAL_LINK_MAP.md`. Анкоры на hub разнообразны, точное вхождение коммерческого запроса не используется.

**8. Какие schema добавлены.** На трёх новых статьях: Organization, WebSite, BreadcrumbList, Article, FAQPage. `Offer`, `Review`, `AggregateRating` не используются — за ними нет проверяемых данных.

**9. Sitemap и prerender.** Sitemap 248 → 251 записи, ни один существующий URL не потерян. Prerender: 133 статьи. Правок скриптов не потребовалось — оба читают `content/blog/**` по glob.

**10. Какие проверки прошли.** 219/219 тестов, typecheck, production build, prerender, sitemap, SEO-аудит сборки (0 битых ссылок, 0 сирот, 0 дублей, 0 mojibake), секрет-скан, `git diff --check`, визуальная проверка на 320/390/desktop.

**11. Какие проверки не удалось выполнить.** Скриншоты (браузерная панель не отображается), валидация схем в Rich Results Test (нужен публичный URL), платные keyword- и SERP-инструменты (0 кредитов), прямая выдача Google с `gl=uz` (навигация на google.com заблокирована), Lighthouse. Подробности — в `09_QA_EVIDENCE.md`.

**12. Commit SHA.** Ниже.

**13. Порядок объединения.** Ниже.

**14. Действия после объединения.** `10_INDEXATION_PLAN.md`.

**15. Метрики 7/14/28 дней.** `10_INDEXATION_PLAN.md`, включая таблицу из 22 отслеживаемых запросов с нулевой базовой линией.

## Коммиты

| # | SHA | Содержание |
|---|---|---|
| 1 | `64bbe0a183b08c95da10044a10ef7772f8d33d49` | Research, keyword map, briefs, content architecture (6 документов) |
| 2 | `bb2ec5071945293ca7d0f1d75ec7cd240469ad4b` | Три supporting-статьи |
| 3 | `b2491602e2f79da7440c7de863d56845769a2baf` | Кластер в манифесте, hub, перелинковка, метаданные |
| 4 | этот коммит | Документы 07–11: link map, отчёт о внедрении, QA, план индексации, передача |

Коммит 1 был исправлен через `--amend` до появления последующих коммитов: первоначальная формулировка утверждала, что статуса самозанятого в Узбекистане нет. Это неверно — статус существует, с 2026 года налог с оборота 1 % при доходе до 1 млрд сум. Формулировка заменена на корректную (различие в налоговых режимах, а не отсутствие статуса) и в документах, и в сообщении коммита.

## Объединение и деплой — ВЫПОЛНЕНО 2026-08-04

По отдельной команде владельца («делай всё под ключ, полные права») ветка запушена, объединена и задеплоена.

| Шаг | Что сделано |
|---|---|
| Push ветки | `feature/seo-smm-cluster-20260804` → `origin`, новая ветка |
| Объединение | `git push origin feature/seo-smm-cluster-20260804:main` — **fast-forward** `7cc2341..22e08ba`, без merge-коммита. Проверено `git merge-base --is-ancestor origin/main HEAD` перед пушем |
| Проверка риска | Дельта между production SHA `5a5111f` и `origin/main` — всего 2 коммита, **только `content/**`, `docs/**` и 6 `.webp` в `public/assets/blog/`**. Ни одного файла runtime, functions, migrations, Bormi. Поэтому деплой не выкатывает чужой незарелиженный код |
| Сборка | `dist` удалён и пересобран с нуля: `npm run build`, exit 0, 133 статьи, sitemap 251 |
| Деплой | `wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main`. Аккаунт `braindigger.uz@gmail.com`, scope `pages (write)`. Загружено 14 новых файлов (776 уже были), Functions bundle, `_headers`, `_redirects`, `_routes.json` |
| Артефакт | `https://f7870934.ai-direct-pro-landing.pages.dev` |
| Проверка прода | Все 5 URL кластера отдают 200 на `https://gptbot.uz/`, canonical самоссылающийся, `index, follow`, Article+FAQPage на статьях |

**Нюанс, зафиксированный честно:** первая проверка сразу после деплоя вернула 404 на трёх новых URL при живом hub и уже обновлённом sitemap. Это транзиентный edge-кэш Cloudflare, а не дефект сборки: повторный запрос через минуту дал 200 на всех трёх, содержимое корректное. Ручной purge не потребовался.

**Что деплой изменил помимо SEO-кластера:** вместе с моими коммитами в прод уехал ранее незарелиженный SEO-спринт `b597398` («mini app and local search clusters») — 6 статей, 2 money-страницы и 6 картинок, которые лежали в `origin/main` с прошлого захода. Это контент, не код, но владельцу стоит об этом знать.

### Если понадобится откат

Предыдущий production соответствовал SHA `5a5111f`. Откат делается через Cloudflare Pages → Deployments → Rollback на предыдущий деплой; git-откат отдельно не требуется, потому что деплой прямой (direct upload), а не из Git.

### Исходный порядок для справки

Ниже — порядок, который был бы нужен при ручном объединении:

1. Дождаться, пока Codex завершит работу и закоммитит свои изменения в `release/bormi-public-beta-1`. Сейчас у него 3 незакоммиченных пути в `docs/production-closure/2026-08-04/`.
2. Обновить базу:
   ```
   git fetch --all --prune
   ```
3. Убедиться, что ветка всё ещё чисто накладывается на `origin/main`:
   ```
   git log --oneline origin/main..feature/seo-smm-cluster-20260804
   git merge-base --is-ancestor origin/main feature/seo-smm-cluster-20260804
   ```
4. Объединить. Конфликтов с Bormi быть не должно: диапазон изменений — только `content/**` и `docs/seo/**`, ни одного файла Bormi, marketplace, admin, API или миграций.
   ```
   git checkout main
   git merge --no-ff feature/seo-smm-cluster-20260804
   ```
   Cherry-pick тоже безопасен, коммиты независимы: `64bbe0a`, `bb2ec50`, `b249160`, затем коммит 4. Порядок важен — коммит 3 ссылается на файлы из коммита 2.
5. Перед деплоем прогнать `npm test` и `npm run build` на объединённой ветке.
6. Деплой — отдельным решением владельца. Из этой сессии ничего не деплоилось.
7. После деплоя — `10_INDEXATION_PLAN.md`.

**Уборка:** в worktree создана junction-ссылка `node_modules` на `F:\Claude\gptbot-main-baseline-20260801\node_modules`. Она в `.gitignore` и в коммиты не попала. Удалить: `rmdir F:\Claude\gptbot-seo-smm-20260804\node_modules`.

## OWNER_OFFER_TRUTH_GATE

**Статус: PASS для SMM как услуги.** Проверено запросом к `https://gptbot.uz/ru/smm-prodvizhenie-tashkent/`: страница отдаётся, описывает SMM как платную услугу, содержит состав работ, этапы и CTA в Telegram. В репозитории это `pageType: money` с `Service`-схемой. Выдумывать услугу не потребовалось, коммерческая страница создавалась не с нуля, а усиливалась.

**Требуют решения владельца:**

1. **Публичный прайс.** Собственных цен GPTBot.uz не публикует, и в статьях они не выдуманы. Если владелец готов раскрыть хотя бы вилку «от», это заметно усилит страницу про стоимость: сейчас она объясняет структуру сметы, но своих цифр не называет. Без явного подтверждения владельцем ничего не добавлять.
2. **Рыночные цифры.** В статье про стоимость приведены опубликованные третьими лицами суммы (tipa.uz, tovar.uz) с датой, источником и оговоркой, что это не средняя цена рынка. Если владелец считает такое цитирование нежелательным — таблицу можно удалить без ущерба остальному тексту.
3. **Юридическая вычитка.** Статья про договор опирается на первичные источники (`lex.uz`) и содержит disclaimer об отсутствии юридической гарантии и рекомендацию проверить договор с юристом. Перед активным продвижением этого материала желательна вычитка юристом — не из-за сомнений в цитатах, а потому что практические выводы вокруг них ценнее, если их подтвердил практикующий специалист.
4. **UZ-версия.** Не создавалась осознанно. Условия для возврата к вопросу — в `05_CONTENT_CLUSTER_PLAN.md`.
5. **Каннибализация вне SMM.** `/ru/blog/chto-takoe-lid-v-marketinge/` и `/ru/blog/marketingovye-terminy-slovar/` делят четыре ключа. Отдельная задача.

## Machine-readable snapshot

```
PROJECT=GPTBot.uz
SEO_SLICE=SMM_CLUSTER_20260804

WORKTREE=F:\Claude\gptbot-seo-smm-20260804
BRANCH=feature/seo-smm-cluster-20260804
BASE_SHA=7cc234144f3fd21c3d800f947d086c37bd99b120
BASE_CONTAINS_PRODUCTION_SHA=YES (5a5111f is an ancestor)
FINAL_SHA=see commit 4 below; commits 1-3 are 64bbe0a, bb2ec50, b249160

EXISTING_PAGES_AUDITED=17 RU (money+blog) + full UZ locale scan (0 SMM pages found)
NEW_PAGES=3
UPDATED_PAGES=4
PILLAR_URL=/ru/smm-prodvizhenie-tashkent/
SUPPORTING_URLS=/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/,/ru/blog/chto-vhodit-v-uslugi-smm-specialista/,/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/,/ru/blog/chto-takoe-smm-prodvizhenie/

PRIMARY_KEYWORDS=стоимость smm услуг,что входит в услуги smm специалиста,договор на оказание smm услуг
LOCAL_TASHKENT_KEYWORDS=smm услуги ташкент,smm услуги в ташкенте,smm продвижение ташкент,smm агентство ташкент (all owned by the hub)
UZBEK_RESEARCH=DONE_NO_PAGE_CREATED (intent skews to job listings and directories; no volume data available)

CANNIBALIZATION_CHECK=PASS (no new overlap; 1 pre-existing one-way link fixed; 1 unrelated pair reported to owner)
INTERNAL_LINKS_ADDED=21
SCHEMA_VALIDATION=PASS (structural, in built HTML + cluster tests; Rich Results Test NOT run - needs public URL)
SITEMAP_VALIDATION=PASS (248 -> 251, 0 existing URLs lost)
PRERENDER=PASS (133 articles, 7 drafts skipped)
TYPECHECK=PASS (tsc -b, exit 0)
LINT=PASS_FOR_CHANGED_FILES (only .json/.md changed; 83 pre-existing problems elsewhere, untouched)
BUILD=PASS (npm run build, exit 0)
BROKEN_LINKS=0
SECRET_SCAN=PASS (clean, 3190 files)

COMMITS=5
PUSHED=YES (origin/feature/seo-smm-cluster-20260804; main fast-forwarded 7cc2341 -> 22e08ba)
DEPLOYED=YES (Cloudflare Pages ai-direct-pro-landing, branch main, 2026-08-04)
DEPLOY_ARTIFACT=https://f7870934.ai-direct-pro-landing.pages.dev
LIVE_VERIFIED=YES (5/5 URLs return 200 on https://gptbot.uz with correct canonical, robots and schema)
INDEX_BASELINE=3 new URLs "URL is unknown to Google"; hub "Submitted and indexed", Rich Results PASS (Breadcrumbs)
REQUEST_INDEXING=NOT_DONE (no Google API for regular pages - manual action in the GSC UI)
INDEXNOW_PING=NOT_DONE (INDEXNOW_KEY is a Cloudflare Pages secret, not available locally)

OWNER_OFFER_TRUTH_GATE=PASS_FOR_SMM_SERVICE; 5 items await owner decision (public pricing, market-figure citation, legal proofread, UZ roadmap, unrelated cannibalization)
READY_FOR_INTEGRATION=YES
```
