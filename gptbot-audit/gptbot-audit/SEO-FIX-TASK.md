# SEO-FIX gptbot.uz

## DONE
- Фазы 1-3: Security 60→98, hreflang, llms, WebSite SearchAction JSON-LD. PR#6 merged.
- www→non-www 301: Page Rule id=35f842393e9eb0a81d6abdd69102395d (новый CF токен). Проверено curl — работает.

## ФАЗА 4 — CONTENT (in progress)
Аудит: balance 97/A, content fail=39, geo fail=19.
91 страница с проблемами (ru+uz, pages+blog):
- THIN <300w: ~50 блог-страниц → расширить тело до 300+
- DESC >160c (>920px): ~30 стр → сократить до 120-158c
- TITLE >60c: ~30 стр → урезать до <60c
- TG telegram ×7-22: ~25 стр → убрать переспам (оставить 2-3)

## ПЛАН
1. [ ] Скрипт механики: desc truncate, title truncate, telegram dedup → fix_seo.py
2. [ ] Thin-контент: расширить тело осмысленно (блог ru/uz)
3. [ ] Билд yarn build:fast, проверить JSON валиден
4. [ ] commit + push + PR + merge
5. [ ] Перепрогнать аудит, проверить content/geo
6. [ ] НАПОМНИТЬ отозвать CF+GH токены (скомпрометированы)

## NOTES
- build: yarn build:fast (НЕ build/build:cf — лезут в сеть)
- generate-robots.ts перезаписывает dist/_headers, dist/_redirects
- CSP в Report-Only пока
