# Передача интеграции GPTBot.uz, 07.10.2026

## 1. Состояние
Ветка codex/continuation-20261007; base c719494b, активная интеграция paid5d56865e + UI. Production до кандидата e3e551af/71d2f0f3. Следующий этап — финальная приёмка и guarded release Studio Click-only.
## 2. Что сделано
См. PROJECT_STATE.md и STUDIO_RELEASE_20261007.md. Достроены D/E/F, shared Click по прямому подтверждению владельца; one-tap и Meta сохранены. База мигрирована аддитивно с backup.
## 3. Изменённые файлы
functions/lib/studio и api/studio/internal/payments; fiscal/identity stores; Studio client/build/checks; chat UI; оферта/политика/тарифы RU/UZ; tests; миграции0075–0077; wrangler config. Секретов в Git нет.
## 4. Архитектурные решения
Новая отдельная Click касса заменена общей одобренной. Явный STUDIO_CLICK_USE_CHAT_SERVICE, общий callback с маршрутизацией stu_*, разные orders/entitlements и атомарное владение транзакцией. Payme hidden по последней команде; photo off. Не менять существующую D1 архитектуру.
## 5. Что сознательно не сделано
Нет реального списания/возврата, автосписаний, Payme/Uzum launch, фото launch, GA4 MP, переноса N1 scheduler. Не объявлять все внешние заявки принятыми.
## 6. Проверки
Shared Click100/100, one-tap18/18, typecheck0, targeted legal/prompt69/69 и operations/prompt19/19. Layout 446 сценариев / 302 скриншота / 0 ошибок; Studio browser PASS; lint156/typecheck0. После исправления последнего canonical URL fixture —21/21 targeted. На committed production сборке ещё требуется полный suite и release guard; старые checks не выдавать за новые. Точные команды в приватных checks/*.json.
## 7. Известные проблемы
AI может ошибаться: ошибки samples сохранены в отчёте, усилены glossary/proofreading; последний language-only sample v33 также не безошибочен. Результат явно обозначен как черновик. Реальные browser прогоны нельзя совмещать с изменениями Functions: hot reload прерывает upstream. Studio browser gate на свежем dist прошёл, tariff page и draft photo учитываются; один viewId и lazy config/me проверяются строго.
## 8. Следующая задача
Закончить финальные checks и опубликовать текущий кандидат штатным deploy_runner; проверить live config/страницы/Click-only/assets/SEO.
## 9. Acceptance criteria
Полный suite, typecheck/lint, production build, полный layout и one-tap, Studio browser/export, clean HEAD, production lineage и live readback. Денежный E2E помечается отдельно, не придумывается.
## 10. Команды для старта
git status; git log -5; читать PROJECT_STATE.md, STUDIO_RELEASE_20261007.md и CONTINUATION_REPORT.md. Инструмент deploy: F:/Claude/gptbot-tools/deploy_runner.py, DR_ROOT на integration. Исходные worktree не трогать.
## 11. Риски
Не включать Payme из-за наличия keys. Не смешивать чат20k и Studio5900/39900. Не убирать callback при остановке продаж. Не выдавать mock или owner grant за денежный платёж. Не обновлять SEO baseline без фактических изменений (сейчас10/10 идентичны).
## 12. Доказательства
Приватный B=F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534; checks, реальные PPTX, сохранённый WIP, D1 backup и rollback dist. Публичные отчёты без секретов/PII. EXTERNAL_TAILS_20261007.md содержит URL заявок и GSC состояние.
