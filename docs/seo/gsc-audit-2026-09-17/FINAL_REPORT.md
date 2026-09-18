# FINAL REPORT — GSC-аудит GPTBot.uz, 17 сентября 2026

## 1. Источник данных

- Property: `sc-domain:gptbot.uz` (единственная подключённая; www/http-варианты внутри неё — 4 показа за всё время, все 301 на `https://gptbot.uz`).
- Интеграция: OpenSEO MCP (read-only Search Analytics + URL Inspection), скрипт `seo-audit/gsc-2026-09-17/scripts/gsc_pull.py` с пагинацией. Сырые выгрузки: `seo-audit/gsc-2026-09-17/raw/` (63 набора, CSV+JSON, не изменялись).
- Даты: финальные данные 2026-05-21 … 2026-09-14. Основное окно 18.08–14.09 против 21.07–17.08. Год к году недоступен (property моложе).
- Объём: 1 205 запросов (16 мес.), 984 (28 дн.); 295 страниц (16 мес.), 270 (28 дн.); 1 446 пар query×page; 5 693 строк date×query; 4 522 date×page. Публичный краул: 289 URL sitemap + 18 URL из GSC. URL Inspection: 42 URL.

## 2. Состояние

| Окно | Клики | Показы | CTR | Позиция |
|---|---|---|---|---|
| 18.08–14.09 | 843 | 75 021 | 1,12% | 8,64 |
| 21.07–17.08 | 91 | 6 808 | 1,34% | 19,99 |
| 08.09–14.09 (7 дн.) | 357 | 32 210 | 1,11% | 6,90 |
| Вся история (с 21.05) | 950 | 82 848 | 1,15% | 9,73 |

Рост ×9 по кликам и ×11 по показам за месяц; понедельно 33 → 40 → 79 → 121 → 251 → 354 клика (3 авг – 13 сен). Средняя позиция улучшилась с 20,0 до 8,6. Никакой значимый запрос или страница не упали.

Структура: 93,8% кликов — узбекоязычные запросы; 78,9% — навигационные «скачать/войти в ChatGPT», 18,2% — «ChatGPT онлайн на узбекском» (собственный чат); бренд — 1,1%; услуги — 0,4%. Mobile 77% кликов; Узбекистан 80%, Россия 13,5% (из них 77 из 114 кликов — узбекские запросы). 94% показов — на позициях 4–10. 35% кликов анонимизированы.

Топ-6 страниц = 89% кликов: download-статья UZ (337), узбекский чат (119), русский чат (117), login-статья UZ (95, опубликована 1 сентября, 25 244 показа), RU-статьи об оплате ChatGPT (46) и о ChatGPT/Claude (38).

## 3. Пять главных возможностей

1. **«chatgpt kirish»** (24 641 показ / 80 кликов / CTR 0,32% / поз. 7,4) на /uz/blog/chatgptga-qanday-kirish-mumkin/: сниппет говорит «login», запрос — «kirish/ochish». При медианном CTR сайта для позиций 7–10 (0,85%) — ≈ +130 кликов/28 дней.
2. **/uz/gpt-uzbek-tilida/** (14 130 показов, CTR 0,84%): title без «kirish» при запросах «chatgpt bepul kirish» (2 206, CTR 0,5%), «chatgpt kirish uzbek tilida» (2 014, CTR 0,4%), «chatgpt 4 uzbek tilida» (112, 0 кликов). Потенциал ≈ +25–35 кликов.
3. **Узбекские запросы на русской странице чата**: 25 пар, 3 199 показов, 35 кликов на /ru/gpt-chat/ («chatgpt uzbekcha online» 1 011, «jaji piti online» 612, «chatgpt yozish» 209). Явная ссылка на UZ-версию + усиление UZ-страницы.
4. **Каннибализация кластера «kirish/ochish»**: «chatgpt ochish» (3 365 показов/90д) делят login- и download-статьи (55/45), VPNsiz-статья с title «ChatGPT’ga kirish…» собирает «kirish»-запросы при CTR 0,31%. Один владелец на интент.
5. **Непокрытые узбекские интенты**: «tarjima» (463 показа, 5 кликов, поз. 6,4) и «yozish» (243) приземляются на русский чат — нужны UZ-страницы с входом в чат.

## 4. Пять главных проблем

1. Коммерческие услуги: 3 925 показов/28 дн., 2 клика; из Узбекистана — 927 показов (23,6%), остальное Россия/Украина; позиции 20–60. SEO пока не канал заявок.
2. Sitemap: три файла (289 + 5 + 18, два статических без lastmod); для 8 из 31 проверенных проиндексированных URL Google не связывает sitemap.
3. 12 URL sitemap без показов за 16 месяцев; две из них не проиндексированы — /ru/promty-gpt-chatgpt-50-primerov/ и /ru/chto-takoe-gpt-i-kak-polzovatsya/ («Crawled, currently not indexed», последний краул 13 июля).
4. Два 404 с показами (/ru/gpt-vs-chatgpt-sravnesie/, /uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/); /ru/telegram-bot-uzbekistan/ в Google — 404 от 23.08, сейчас 301.
5. Кластер главных страниц не описан hreflang'ом: `/` (только x-default) и `/ru/` — два русских «дома», `/uz/` отдельно; брендовый «gptbot» делится между `/` и `/ru/`. Плюс 24 title > 65 и 32 description > 165 символов на сервисных страницах.

Технически критичных (P0) проблем нет: 289/289 URL — 200, self-canonical, index/follow, дублей нет, редиректы www/http/слеш/`?lang=` работают, полный пререндер, все проверенные лидеры проиндексированы с совпадающим canonical.

## 5. Десять первоочередных задач

| ID | P | Задача | URL / файл |
|---|---|---|---|
| T01 | P1 | title/description/H1/intro статьи входа под «kirish/ochish» | `content/blog/uz/chatgptga-qanday-kirish-mumkin.json` + baseline |
| T02 | P1 | VPNsiz-статья: убрать «kirish» из title/H1, ссылка на login-статью | `content/blog/uz/chatgpt-ozbekistonda-vpnsiz-ishlaydimi.json` |
| T03 | P1 | Узбекский чат: «kirish» и «uzbekcha» в title/description | `content/pages/uz/gpt-uzbek-tilida.json` |
| T04 | P1 | RU-чат: ссылка на UZ-версию над первым экраном | `content/pages/ru/gpt-chat.json` |
| T05 | P2 | 301 для двух 404 | `content/seo/redirects.json` |
| T06 | P2 | Один источник sitemap (убрать/генерировать static-файлы) | `public/sitemap-*.xml`, `src/shared/robots-policy.ts` |
| T07 | P2 | Перекраул /ru/telegram-bot-uzbekistan/ (ручное в GSC) | — |
| T08 | P2 | Уникализация + ссылки на /ru/promty-gpt-chatgpt-50-primerov/ | `content/pages/ru/promty-gpt-chatgpt-50-primerov.json` |
| T09 | P2 | «kompyuter» в title статьи о скачивании (после оценки T01–T04) | `content/blog/uz/chatgpt-telefon-va-kompyuterga-yuklab-olish.json` |
| T10 | P2 | Единая страница «Разработка чат-ботов в Ташкенте» + кейсы + ссылки | `content/pages/ru/luchshie-razrabotchiki-chat-botov-tashkent.json` |

Далее: T11 UZ-статья «tarjima», T12 «yozish», T13 кластер главных, T14 длинные title, T15–T18 сервисные мелочи, T19 автоматизация измерений, T20 CWV. Полный список с доказательствами, рисками и критериями — `csv/recommended_actions.csv` и IMPLEMENTATION_BACKLOG.md.

## 6. Где что лежит

```
docs/seo/gsc-audit-2026-09-17/
  EXECUTIVE_SUMMARY.md  GSC_DATA_OVERVIEW.md  QUERY_ANALYSIS.md  PAGE_ANALYSIS.md
  CANNIBALIZATION.md  TECHNICAL_SEO.md  CONTENT_OPPORTUNITIES.md  QUICK_WINS.md
  ROADMAP_90_DAYS.md  IMPLEMENTATION_BACKLOG.md  MEASUREMENT_PLAN.md  DATA_LIMITATIONS.md
  EMERGING_KEYWORDS.md  SEO_ROADMAP_FULL.md  FINAL_REPORT.md  summary.json  summary_emerging.json
  patches/  T01–T05 готовые diff (git apply --check пройден) + README с процессом обновления baseline
  csv/   queries_all, queries_brand, queries_non_brand, queries_quick_wins, queries_declining,
         queries_growing, queries_new, queries_lost, queries_no_clicks, queries_ctr_opportunities,
         queries_near_top10, queries_weekly_change, query_categories_summary, topic_dynamics,
         query_position_buckets, pages_all, pages_quick_wins, pages_declining, pages_lost_queries,
         pages_no_clicks, pages_zero_impressions_16m, pages_not_in_sitemap, pages_duplicate_meta,
         pages_orphan_no_inbound_links, pages_weekly_change, query_page_pairs, language_mismatch,
         cannibalization_candidates, device_comparison, device_query_split, device_page_split,
         query_device_page_mismatch, country_comparison, country_query_top, country_page_top,
         query_country_position_gap, country_query_language, daily_trend, weekly_trend,
         monthly_trend, brand_vs_nonbrand_daily, topic_daily, top_queries_weekly, top_pages_weekly,
         anonymized_share, recommended_actions
  charts/ 01_clicks_daily … 13_monthly (13 PNG)
seo-audit/gsc-2026-09-17/
  raw/      63 выгрузок GSC (CSV+JSON), PERIODS.json, site_pages.json/csv, site_links.csv,
            url_inspection.json, pagespeed.json (ошибка квоты), логи
  scripts/  gsc_pull.py, site_crawl.py, analysis.py, charts.py, gsc_direct_auth.py
```

## 7. Ограничения

Нет доступа к `sites.list`, Sitemaps API, Coverage/Page Experience; `searchAppearance` пуст; CWV не измерены (квота PSI, нет ключа/Lighthouse); история 117 дней; 35% кликов анонимизированы; SERP Узбекистана не снималась; URL Inspection — 31 из 289 URL; классификация — правилами. Подробно — DATA_LIMITATIONS.md.

## 8. Рекомендуемые, но не выполненные production-изменения

Все T01–T20. Ничего не деплоилось, не менялись DNS, GSC, sitemap-submissions, canonical, robots. Ветка `seo/gsc-audit-20260917` содержит только отчёты и скрипты (без секретов), не закоммичена и не запушена — по решению владельца.
