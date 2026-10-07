# Студия: запуск бесплатной презентации (R-ST1) и откат

*Для владельца и для агента, который выкатывает или откатывает. Основа — `gptbot.uz-audit/raw/ads-growth-2026-10-06/studio/STUDIO-SPEC.md` (§5.4, §12, §13) и решения владельца от 07.10.2026.*

## Что включено

Студия — отдельное приложение `apps/studio` со своими страницами `/uz/taqdimot-ai/` и `/ru/prezentatsiya-ai/`. Релиз R-ST1 включает **только бесплатную презентацию**: кто угодно, без регистрации, 1 презентация в день (до 6 слайдов и до 2 картинок).

Все настройки студии — одна строка `STUDIO_RUNTIME_CONFIG_JSON` в `wrangler.toml`. Она действует только на `gptbot.uz`: на превью `*.pages.dev` всё `/api/studio/*` отвечает 404.

| Что | Значение на запуске | Что это значит |
|---|---|---|
| `STUDIO_API` | `on` | бесплатные адреса API, выдача метки браузера, `/config`, `/me` |
| `STUDIO_FREE_DECK` | `true` | бесплатная презентация |
| `STUDIO_EVENTS` | `true` | шаги воронки (без темы и без личных данных) |
| `STUDIO_TURNSTILE_SITE_KEY` | ключ виджета студии | проверка «не робот»; секрет — `STUDIO_TURNSTILE_SECRET_KEY` в Pages |
| `STUDIO_FREE_TEXT_FALLBACK` | пусто | запасной модели через OpenRouter нет: если Z.ai не ответил, человек видит «Vaqtincha ishlamayapti», презентация не списывается |
| Платное (`STUDIO_PAID_SERVICE`, `STUDIO_FULL_DECK`, `STUDIO_PHOTO`, `STUDIO_PAYMENTS`) | выключено | тарифов, оплаты и фото нет |

Рядом с формой на странице написано, куда уходят данные. Это написано ровно под эту настройку: тема — в Z.ai (Сингапур), картинки рисует и проверяет Cloudflare Workers AI, проверка «не робот» — Cloudflare Turnstile, метка (cookie) в браузере на 1 год. Тест `tests/studio-prerender.test.ts` сверяет абзац с `wrangler.toml`: если включить запасную модель OpenRouter, тест упадёт, пока абзац её не назовёт.

## Тормоза (правила WAF нет — решение владельца 07.10)

Защиту от выкачивания держит само приложение. Каждый тормоз срабатывает без участия человека:

| Тормоз | Порог на первые 48 часов | Что видит посетитель |
|---|---|---|
| Бесплатная на браузер | 1 в сутки (сутки с 05:00 по Ташкенту) | «Bugungi bepul taqdimotdan foydalanib bo‘ldingiz» и время сброса |
| Разгонный потолок на весь сайт | 50 презентаций в сутки | «Bugungi bepul taqdimotlar tugadi» до 05:00 |
| Дневной бюджет моделей | $0,3 в сутки (≈3 500 сум; одна бесплатная ≈30 сум — ≈0,0025 $ на репетиции 07.10, так что раньше срабатывает потолок 50) | то же; на 80% — алерт владельцу и отказ новым браузерам |
| Потолок по сети (IP) | 20 презентаций в сутки — только для браузеров моложе суток | «Bu tarmoqdan bugun juda ko‘p so‘rov bo‘ldi» |
| Старты на весь сайт | 3 в минуту (до ночного замера порога Z.ai) | «Vaqtincha ishlamayapti», презентация не списывается |
| Одно задание на браузер | 1 активное, 6 стартов за 10 минут | «Oldingi so‘rov hali yakunlanmagan» |
| Turnstile | на выдаче метки и на каждой бесплатной презентации | без прохождения проверки ничего не начинается |
| Сбой базы | считается отказом | бесплатное не раздаётся, пока база не ответит |

Алерты студии (`studio_ramp_full`, `studio_free_budget_80`, `studio_free_budget_spent`, `studio_free_decks_high`) приходят владельцу в Telegram раз в сутки на состояние. Пока нет уборки истёкших заданий (T4.3), их единицы возвращаются при следующем старте и на `/me`.

**Важно:** любое изменение порога или флага — это новая сборка и guarded-деплой (Pages читает переменные только при деплое). Мгновенного выключателя без деплоя нет: правило WAF владелец не создавал.

## Откат одной командой

Выключает бесплатную презентацию: все бесплатные адреса `/api/studio/*` отвечают 404, ещё до чтения запроса и базы. Страницы остаются в поиске; форма после нажатия пишет «Vaqtincha ishlamayapti» / «Временно не работает». Чат, оплаты пакета и остальной сайт не затрагиваются.

Запускать **в рабочем дереве, из которого собран текущий прод** (или в свежем дереве от `origin/main`, если прод = `origin/main`). Guarded-деплой сам откажет, если в дереве нет коммита прода.

PowerShell 5.1 (из корня дерева):

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1400'; $env:DR_ROOT=(Get-Location).Path; npx tsx apps/studio/scripts/studio-switch.ts off --commit; if ($?) { npm run build:production }; if ($?) { python F:/Claude/gptbot-tools/deploy_runner.py deploy }
```

bash:

```bash
export NODE_OPTIONS=--max-old-space-size=1400 DR_ROOT="$PWD"; npx tsx apps/studio/scripts/studio-switch.ts off --commit && npm run build:production && python F:/Claude/gptbot-tools/deploy_runner.py deploy
```

Что делает каждая часть:

1. `studio-switch.ts off --commit` — в `wrangler.toml` ставит `STUDIO_API=off`, `STUDIO_FREE_DECK=false`, `STUDIO_EVENTS=false` (остальное не трогает) и коммитит только `wrangler.toml` (guarded-деплой не берёт незакоммиченные файлы).
2. `npm run build:production` — обычная сборка со всеми проверками (защищённые страницы 10/10 и т. д.), ≈10–15 минут.
3. `deploy_runner.py deploy` — guarded-деплой с блокировкой и проверкой, что `gptbot.uz` отдаёт новый манифест.

После деплоя проверить: `https://gptbot.uz/api/studio/config` → 404; `https://gptbot.uz/uz/taqdimot-ai/` → 200; `https://gptbot.uz/gptbot-release.json` → коммит отката. Потом `git push` ветки (только по слову владельца), чтобы следующий релиз не включил студию обратно.

Состояние флагов посмотреть: `npx tsx apps/studio/scripts/studio-switch.ts status` → `{"freeDeck":"on"}` или `"off"`. Включить обратно — та же команда с `on` вместо `off`.

**Полный откат** (убрать и страницы): `git revert` коммита публикации R-ST1 возвращает страницы в черновики, гайд по слайдам, ссылки и карту интентов вместе; затем те же сборка и guarded-деплой. Таблицы миграции 0073 остаются (миграции только добавляющие, на работу сайта не влияют).

## Через 48 часов (R-ST1b)

Отчёт: число презентаций, доля удачных, расход, отказы `ip_ceiling` / `studio_busy`, ошибки Z.ai 1302, алерты. Если спокойно — R-ST1b, только настройки: `STUDIO_FREE_DAILY_USD` = `3`, `STUDIO_RAMP_DECKS_DAILY` = `""` (потолок снят). Это тоже сборка и guarded-деплой, и правка теста `tests/pages-config-parity.test.ts` (он закрепляет значения запуска). Порядок шагов для агента — `gptbot.uz-audit/raw/ads-growth-2026-10-06/studio/launch-2026-10-07/RELEASE-STEPS.md`.
