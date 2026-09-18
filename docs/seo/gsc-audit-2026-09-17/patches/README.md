# Волна 1 (T01–T05) — готовые патчи

Сгенерированы `seo-audit/gsc-2026-09-17/scripts/make_wave1_patches.py` из текущих файлов `origin/main` a16f7988. Исходники репозитория **не менялись**; патчи проверены `git apply --check`. Применять только после одобрения владельца.

| Патч | Файл | Что меняет |
|---|---|---|
| `T01-login-article-snippet.diff` | `content/blog/uz/chatgptga-qanday-kirish-mumkin.json` | title/H1/description/og под «kirish / ochish» (слово «login» сохранено), новый intro с прямым ответом, новый раздел «ChatGPT ochish: 3 qadam» (H2 + список + абзац) и пункт в оглавлении, keywords, даты |
| `T02-vpnsiz-article-detitle-kirish.diff` | `content/blog/uz/chatgpt-ozbekistonda-vpnsiz-ishlaydimi.json` | title/H1/description без «kirish»; первый H2 «ChatGPT’ga kirish: 4 qadam» → «Qisqa javob: ishlaydi, VPN shart emas» с абзацем-ответом и отсылкой к статье входа; якорь ссылки на login-статью → «ChatGPT’ga kirish»; keywords без «kirish» |
| `T03-uz-chat-title-kirish-uzbekcha.diff` | `content/pages/uz/gpt-uzbek-tilida.json` | title/description/og с «uzbekcha» и «bepul kirish», heroSubtitle, первый абзац с написаниями «ChatGPT uzbekcha / o‘zbekcha online / uzbek tilida», secondaryKeywords |
| `T04-ru-chat-link-to-uz.diff` | `content/pages/ru/gpt-chat.json` | первый блок `linkp` со ссылкой на `/uz/gpt-uzbek-tilida/` (якорь «ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish»), heroSubtitle с упоминанием узбекской версии, description без «узбекский AI-чат» как основного обещания, internalLinks |
| `T05-redirects-two-404s.diff` | `content/seo/redirects.json` | два правила 301: `/ru/gpt-vs-chatgpt-sravnesie/` → `…sravnenie/`, `/uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/` → `…kompyuterga-yuklab-olish/` |

## Порядок применения

```bash
git checkout -b seo/wave1-kirish-cluster origin/main
git apply docs/seo/gsc-audit-2026-09-17/patches/T05-redirects-two-404s.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T01-login-article-snippet.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T02-vpnsiz-article-detitle-kirish.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T03-uz-chat-title-kirish-uzbekcha.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T04-ru-chat-link-to-uz.diff
npm run build            # seo-audit.ts + prerender + sitemap + robots
```

Редакторская проверка узбекских формулировок обязательна до релиза: тексты в T01–T03 написаны по образцу существующих статей, но не вычитаны носителем.

## Baseline защищённых страниц (обязательно, иначе релиз остановится)

Четыре из пяти патчей затрагивают защищённые URL (`scripts/seo-protection.ts:12-21`): `/uz/blog/chatgptga-qanday-kirish-mumkin/`, `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/`, `/uz/gpt-uzbek-tilida/`, `/ru/gpt-chat/`. Процесс, которым была сделана ревизия 2026-09-14 («Reviewed local build; not a new live capture»):

1. После `npm run build` вычислить контракт четырёх страниц из `dist/<path>/index.html` функцией `seoContract()` из `scripts/seo-protection.ts` (title, h1, description, robots, canonical, hreflang, internalLinks, bodyTextSha256, bodyText).
2. Создать `docs/seo/evidence/2026-09-2X/reviewed-protected-pages.json` как копию `2026-09-14/…` с заменёнными записями этих четырёх страниц, полем `originalEvidence: "docs/seo/evidence/2026-09-14/reviewed-protected-pages.json"` и `reviewedChanges[]` (path, fields, reason — со ссылкой на `docs/seo/gsc-audit-2026-09-17/QUICK_WINS.md`).
3. Обновить константу `BASELINE` в `scripts/seo-protection.ts:11` на новый файл.
4. `node --import tsx scripts/seo-protection.ts check` → «Protected SEO: 10/10 unchanged»; `node --import tsx --test tests/seo-protection.test.ts`; `npm test`.

Команды `capture` для этого не подходит (она снимает живой сайт и отказывается перезаписывать существующий файл).

## После релиза

- `curl -sI https://gptbot.uz/ru/gpt-vs-chatgpt-sravnesie/` → 301; то же для второго URL.
- `curl -s https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/ | grep -o '<title>[^<]*'` — новый title.
- URL Inspection четырёх страниц через 3–5 дней: дата краула позже релиза.
- Измерение — по MEASUREMENT_PLAN.md (28 полных дней от краула), критерии успеха/отката — QUICK_WINS.md.

## Применено 2026-09-18 (ветка `seo/wave1-kirish-cluster`)

Патчи T01–T05 применены к `origin/main` a16f7988 и после правок перегенерированы командой `git diff origin/main -- <файл>`, поэтому файлы в этой папке равны фактическому коммиту. Отличия от первой версии патчей:

- title T01 сокращён до 64 символов: `ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish`; title T03 — до 64: `ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish, ro‘yxatsiz chat` (порог T14 — 65).
- `keywords`: из статьи входа убран «chatgpt bepul kirish» (остаётся у `/uz/gpt-uzbek-tilida/`), из VPNsiz-статьи — все варианты «kirish/ochish» и регистровые дубли (тест `seo-intent-manifest`: стороны пары не делят ключи).
- Новый патч `T01-T02-intent-manifest-c18.diff`: в `content/seo/intent-manifest.json` пара C18 развёрнута — head-термины «chatgpt kirish / ochish» закреплены за статьёй входа, VPNsiz-статья владеет «ishlaydimi / vpnsiz / uzbekistan»; обновлены `gscNote`, `observedOwnerNote`, `decidedAt`, `updatedAt`, а также `owns` у C11. Без этого `npm test` падает.
- `baseline-seo-protection-2026-09-18.diff`: `BASELINE` → `docs/seo/evidence/2026-09-18/reviewed-protected-pages.json` (ревизия создана `seo-audit/gsc-2026-09-17/scripts/make_baseline_revision.ts --write --date 2026-09-18`; 5 записей `reviewedChanges`, включая `/` — главная перечисляет UZ-статьи по title).

Проверено на ветке: `npm run build` (18 правил `_redirects`, sitemap 289 URL, lastmod четырёх страниц 2026-09-18), `seo-protection.ts check` 10/10, `npm test` 602/602, `npm run typecheck`, `npm run lint`. Деплой не выполнялся.
