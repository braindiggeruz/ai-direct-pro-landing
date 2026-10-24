# Проверка W1-14 — BreadcrumbList: свойство `name` и без самоссылки на `/uz/`

Роль: адверсарный верификатор. Дата: 2026-10-24. Вердикт: **не опровергнуто, но действие в нынешнем виде исправить**.

Факты пункта подтверждаются полностью: 299 из 299 BreadcrumbList без `name`, «Unnamed item» в GSC, самоссылка на `/uz/` (в том числе на живом сайте). Оценка «0 кликов» честная. Ошибка в классификации: пункт помечен `protected: false`, хотя шаблонная правка меняет HTML **9 из 10 защищённых страниц**. Среди них гайд по скачиванию, который репозиторий держит **побайтно замороженным** до чтения своего окна П-CTR (≈06–10.11), и два чата, у которых 24.10 открылось новое 28-дневное окно. Исправленное действие — в §4.

## 1. Факты пункта, перепроверенные

| Утверждение пункта | Как проверено | Результат |
|---|---|---|
| У 299 из 299 BreadcrumbList нет `name` | `verify-data/W1-14_bc_scan.py` по `dist/**/index.html` (сборка прода d54d5b61), вывод — `verify-data/W1-14_bc_scan.json` | 300 индексируемых страниц (`/admin/` — noindex, исключена). BreadcrumbList есть на 299, нет только на `/`. У 299 из 299 нет `name` верхнего уровня, `multi` = 0, ошибок разбора JSON-LD 0. Последний элемент совпадает с canonical на 299 из 299 |
| На `/uz/` вторая крошка ведёт на саму `/uz/` | тот же скан (`selfdup`) + live GET `https://gptbot.uz/uz/` (desktop Chrome UA, 200) | единственная страница с повтором: `1: GPTBot.uz → /uz/`, `2: O‘zbekcha bo‘lim → /uz/`. На проде та же разметка, байт в байт |
| GSC: вердикт успешный, подпись «Unnamed item» | `l4-data/gsc-url-inspection-2026-10-24.json` (58 строк) + повторный `inspect_urls` по 3 URL сегодня (`/uz/`, `/ru/gpt-chat/`, `/uz/blog/chatgptga-qanday-kirish-mumkin/`) | В файле L4: 56 строк «Breadcrumbs: Unnamed item» (55 + 1 с пометкой про sitemap-new.xml), `/` — none, slayd — не в индексе. Повторный вызов: все 3 — `richResultsResult.verdict = PASS`, `detectedItems[0].items = [{name: "Unnamed item"}]` |
| Причина — `buildBreadcrumbLd` | `scripts/jsonld-helpers.ts:194-204` | функция отдаёт только `@type` и `itemListElement`; у каждого ListItem есть `name` и абсолютный `item` |
| Места вызова | grep `buildBreadcrumbLd` | `scripts/prerender.ts:349-352` (в пункте написано 345-350, строки сдвинуты на 3), `scripts/prerender-blog.ts:284-288` и `:565-568`, `apps/studio/scripts/studio-page.ts:347-350`. Четвёртого шаблонного вызова нет |
| JSON-LD вне `seoContract` | `scripts/seo-protection.ts` (функция `seoContract`) | `textHtml = clean.replace(/<(script\|style)…/)`. Сам `<script>` в отпечаток не входит, гейт не упадёт. Но см. §2: «гейт не видит» ≠ «ревизия не нужна» |

## 2. В чём пункт ошибается: protected и окна замеров

| Факт | Источник | Следствие для W1-14 |
|---|---|---|
| `PROTECTED_PATHS` = 10 URL, из них BreadcrumbList нет только у `/` | `scripts/seo-protection.ts` (`PROTECTED_PATHS`), скан §1 (`nobc = ["/"]`) | правка шаблона меняет HTML **9 защищённых страниц**: оба чата, 6 статей блога и гайд по скачиванию |
| Правки JSON-LD на защищённых страницах репозиторий оформляет ревизией (`invisibleToGate`), хотя гейт их не видит | `docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json` → `invisibleToGate[1]`: «WebPage JSON-LD description of both chats…»; комментарии ревизий 09-30 и 10-01 в `seo-protection.ts` («lists every diff, including the JSON-LD…») | «BASELINE не меняется» верно только про отпечаток. Правку всё равно надо внести в ревизию: `protected` должно быть **true**. Сам L4 это пишет: `L4-technical.md:113` — «JSON-LD девяти защищённых страниц всё равно изменится → нужна ревизия» |
| Гайд по скачиванию держат **побайтно тем же**, пока не прочитано его окно П-CTR (≈06–10.11) | `docs/seo/CHANGE_LOG_2026-10.md:180` («Побайтно тот же (HTML и `.md`): своё окно П-CTR»), `:712`, `:698` | шаблонная правка нарушила бы эту заморозку на `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` |
| У обоих чатов 24.10 открылось новое 28-дневное окно | `reviewed-protected-pages.json` → `measurement`: «a new 28-day window starts at a recrawl confirmed with URL Inspection» | `name` у BreadcrumbList в выдаче не показывается, поэтому CTR он не исказит. Но правка HTML чатов внутри окна — ещё одно вмешательство, а в CHANGE_LOG такие правки записывают как помеху (`:575`, `:197`). Выигрыша нет, значит и повода нет |

## 3. Даст ли клики и может ли навредить

| Вопрос | Данные | Вывод |
|---|---|---|
| Клики | GSC `searchAppearance`, 2026-09-24..10-21 → 0 строк (`resultId 212119c4-…`) | Google не отдаёт этому свойству ни одного типа показа. Подпись «Unnamed item» видна только в отчёте URL Inspection, на выдачу она не влияет. Оценка пункта «0» верна |
| Сменится ли подпись | документации Google, где сказано, что подпись берётся из `BreadcrumbList.name`, нет; это ожидание L4 (`L4-technical.md:99`) | вероятно, но не доказано. Проверить после выката: `inspect_urls` по 2–3 незащищённым URL после переобхода |
| Риск для `/uz/` | GSC page `https://gptbot.uz/uz/`, 2026-09-24..10-21: 1 клик / 39 показов / поз. 11,7 (`resultId 0c479c86-…`) | Если убрать BreadcrumbList, `/uz/` потеряет свой единственный rich result «Breadcrumbs». Ни трафика, ни кликов на кону нет. Риск низкий |
| `name` — допустимое свойство? | `BreadcrumbList` → `ItemList` → `Thing`; `name` есть у `Thing` | ошибок валидации не будет |
| intent-manifest и анкоры | правка не трогает видимый текст, ссылки, title и H1 | конфликтов нет |

## 4. Исправленное действие

1. **`/uz/` — сейчас (страница не защищена).** Править не код, а контент: убрать `"BreadcrumbList"` из `schemaTypes` в `content/pages/uz/hub.json:430`. Особый случай в `prerender.ts` не нужен. `/` так же живёт без BreadcrumbList. Тесты, где хаб обязан иметь BreadcrumbList (`tests/seo-cluster-quality.test.ts:300`), `/uz/` не касаются: это не хаб кластера, у него нет `Service`.
2. **`name` у BreadcrumbList — `buildBreadcrumbLd(items, name?)`, по умолчанию `items.at(-1).name`.** Править `scripts/jsonld-helpers.ts:194`. Вызовы `prerender.ts:349`, `prerender-blog.ts:284` и `:565`, `studio-page.ts:347` можно не трогать, если хватает значения по умолчанию.
   - Предпочтительно: **отложить и включить в следующую ревизию защищённых страниц после закрытия окон.** Гайд по скачиванию читается ≈06–10.11, чаты — 28 дней с переобхода после 24.10. В `invisibleToGate` достаточно одной строки «BreadcrumbList gains top-level name on 9 protected pages». Выигрыш нулевой, поэтому ждать ничего не стоит.
   - Если делать сейчас: в `buildBreadcrumbLd` не добавлять `name` для путей из `PROTECTED_PATHS` (импорт из `scripts/seo-protection.ts`), чтобы HTML всех 9 защищённых страниц остался побайтно тем же. Проверка: `seo-protection check` 10/10 и `cmp` HTML гайда по скачиванию со сборкой d54d5b61.
3. Поставить `protected: true`. Приоритет — самый низкий в бэклоге: это гигиена, клики она не приносит.
4. Записать в `CHANGE_LOG_2026-10.md` как шаблонную правку JSON-LD, с явной строкой «защищённые страницы не тронуты» (или ссылкой на ревизию, если правку делают после окон).

## 5. Источники вызовов

- `inspect_urls` (OpenSEO, project 7534113b…, 0 кредитов), 2026-10-24: `/uz/`, `/ru/gpt-chat/`, `/uz/blog/chatgptga-qanday-kirish-mumkin/` — все PASS, «Unnamed item».
- `get_search_console_performance`: page = `/uz/`, 2026-09-24..10-21 → 1 / 39 / 2,56% / 11,7; dimension `searchAppearance` за тот же период → 0 строк.
- Скан сборки: `verify-data/W1-14_bc_scan.py`, `verify-data/W1-14_bc_scan.json`.
- Live GET `https://gptbot.uz/uz/` — 200, BreadcrumbList идентичен `dist/uz/index.html`.
