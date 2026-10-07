> Актуализация 07.10: one-tap опубликован (`e3e551af`, `71d2f0f3`), suite 1815/1815, браузер 18/18, layout 258/258, live SEO 10/10. Следующий приоритет владельца — **полноценная платная Studio**, включая тарифы и права; потом UI и внешние хвосты. Studio пока не выпущена.

# Продолжение GPTBot.uz

## Сохранение исходной работы

Исходные шесть worktrees не изменены. Сохранены HEAD, branch, status, staged/unstaged binary patches и точные копии изменённых и новых файлов с SHA-256. Применимость patches проверена через отдельный Git index. Созданы сохраняющие коммиты one-tap `f6d5af18` и paid Studio `5d56865e`; исходные index и рабочие файлы не менялись.

Частный каталог: `F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534`. Здесь же сохранены production dist `5bbfc97b`, проверенный ZIP нового dist `3173e366`, команды, exit codes, SHA, логи и HTTP readback. Архивы и секреты не добавлены в публичный репозиторий.

## SEO — DEPLOYED_VERIFIED

Commit **`3173e366134730fe942df3750a8b28576a4a1a95`**, родители `5bbfc97b` и `b757615b`. Сохранены опубликованные Meta-коммиты и подготовленный SEO changeset Claude. GitHub main продвинута обычным fast-forward push. Через API проверено: branch protection отсутствует, Cloudflare GitHub source имеет `deployments_enabled=false` и `production_deployments_enabled=false`.

Guarded check/deploy прошли; deployment **`82f6bb95.ai-direct-pro-landing.pages.dev`**, 07.10.2026 в 14:26 Asia/Karachi.

Проверки: production build и typecheck всех трёх частей — exit 0; lint изменённых файлов — 0 ошибок; целевые тесты 117/117; полный suite **1809/1809**; SEO audit — 0 critical; protected SEO — 10/10; браузерная раскладка — **258 сценариев, 0 замечаний, 144 скриншота**, CLS 0, LCP 2.076–2.460 s в эмуляции. Новая reviewed evidence фиксирует интеграцию; историческая traffic revision сохранена.

Baseline production: 1804/1807. Два Lead Radar теста использовали истёкшие августовские fixtures; третий требовал GA4 первым оператором до уже опубликованной Meta-инициализации. Причины воспроизведены; исправлены тесты, runtime не менялся. Первая попытка candidate suite выявила отсутствующие backend dependencies нового checkout; после подключения существующих зависимостей повторный полный прогон прошёл.

После выпуска: четыре новых SEO URL отвечают 200 с self canonical; оба чата, SMM, sitemap, robots и llms доступны; три JS probe совпали по SHA-256. API аккаунта: Click live, гостевой checkout включён, оферта v3, пакет 20 000 UZS / 300 ответов / до 50 в день / месяц. Денежный E2E и платный AI-запрос не выполнялись. Десять protected contracts совпали после точного обратного преобразования Cloudflare email obfuscation; сырые HTML hashes из-за этого преобразования не равны.

## One-tap — IN_PROGRESS

Сохранённый changeset включён трёхсторонним merge. Исправляются отложенный checkout по старому нажатию, изменение показанных условий, cookie guard, синхронный double-click guard и доступность провайдера конкретному посетителю. Payme test и Uzum off сохранены. Нового выпуска one-tap пока нет.


One-tap локально: targeted 158/158, browser 18/18, typecheck/lint 0; в том числе close/identity во время POST, focus-refresh, отсутствие cookie, чужой invoice, pending/cancel и manual retry. Новые browser доказательства в частном каталоге `onetap-browser`; реальные provider-события в этих проверках заменены fixtures. Привязка оферты и новые guards проверены; финальные release gates выполняются отдельно.
