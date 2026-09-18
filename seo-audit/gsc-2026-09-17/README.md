# seo-audit/gsc-2026-09-17 — сырые данные и скрипты GSC-аудита gptbot.uz

Отчёты: `docs/seo/gsc-audit-2026-09-17/`. Здесь — неизменяемые выгрузки (`raw/`) и воспроизводимые скрипты (`scripts/`).

## Воспроизведение

```bash
# 0. Требования: Python 3.9+, pandas, matplotlib, requests, beautifulsoup4, lxml;
#    авторизованный OpenSEO MCP в Claude Code (токен читается из ~/.claude/.credentials.json, не печатается).
cd seo-audit/gsc-2026-09-17/scripts

# 1. Последняя финальная дата и проверка транспорта
python gsc_pull.py probe

# 2. Полная выгрузка (все измерения и периоды) в ../raw/
python gsc_pull.py pull --end 2026-09-14

# 3. Публичный краул sitemap (title/description/H1/canonical/hreflang/JSON-LD/ссылки)
python site_crawl.py --workers 5

# 4. Производные таблицы и summary.json → docs/seo/gsc-audit-2026-09-17/csv/
PYTHONIOENCODING=utf-8 python analysis.py

# 5. Графики → docs/seo/gsc-audit-2026-09-17/charts/
python charts.py

# (опционально) прямой доступ к Search Console API для sites.list / sitemaps.list
python gsc_direct_auth.py --client-secret <client_secret.json> --list-sites
```

Для новой недели: скопировать `scripts/` в `seo-audit/gsc-YYYY-MM-DD/scripts/`, выполнить шаги 1–5 (пути в скриптах относительные).

## Содержимое raw/

- `PERIODS.json` — окна анализа, вычисленные от последней финальной даты.
- `<dimension>__<period>.{json,csv}` — Search Analytics (web), `dataState=final`, пагинация по 1 000 строк; в JSON — метаданные запроса и число вызовов.
- `type_<image|video|discover|news>_date__all16m` — другие типы поиска.
- `site_pages.{json,csv}`, `site_links.csv` — краул 289 URL sitemap.
- `url_inspection.json` — 31 URL через URL Inspection API (транскрипция ответов).
- `pagespeed.json` — попытка PSI (квота исчерпана).
- `_pull.log`, `_crawl.log`, `_gsc_pages_not_in_sitemap.txt`, `_home_only_inbound.txt` — служебные.

Секретов в папке нет.
