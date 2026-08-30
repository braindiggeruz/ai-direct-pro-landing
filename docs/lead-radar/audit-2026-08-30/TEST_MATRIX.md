# TEST_MATRIX — что проверено, чем, на какой версии (2026-08-30)

## 1. Прогоны на HEAD `0ddce6c` (локально, 30.08)

| Набор | Результат |
|---|---|
| `npm run test:lead-radar` (347 тестов: api, worker, queue-reliability, d1-budget, schema-audit, 0041, golden-eval, telegram business/ui/campaign/media/quota/gateway/account-object/bridge-crypto/auth-recovery, release-manifest/gate) | **347 pass / 0 fail** |
| `npm run test:lead-radar-contacts` (104 теста: contact-candidates, bridge-mailbox, campaign, queue-reliability, d1-budget) | **104 pass / 0 fail** |
| `npm run typecheck:lead-radar` | чисто |
| Не запускалось (вне ядра аудита): browser-моки (test:lead-radar-audiences), firecrawl runtime, bunzy, полный lint | — |

Вывод: существующая тестовая база зелёная на HEAD; **все находки этого аудита — пробелы покрытия, а не падающие тесты**.

## 2. Пробелы покрытия (тесты, которых нет)

| Пробел | Связанная находка | Нужный тест |
|---|---|---|
| Воссоздание dead-lettered contact-resolve job | QR-1 | deadLetterJob → следующий enrichment → job снова queued |
| Lease отправки vs медленный gateway (120-125 c) | CP-1 | фейковый sender с задержкой 122 c → recipient НЕ ambiguous, повторная запись sent возможна |
| Реконсиляция sent/effect гонки | CP-2 | markRecipientSent c несовпавшим effect UPDATE → maintain() чинит пару |
| UTF-16 лимит длины | CP-4 | 4096 code points из эмодзи → валидация НЕ пропускает |
| Re-enrichment не снимает verified | TG-2 | повторная выгрузка источников с новым observedAt → proof совпадает |
| TTL verified в каталоге UI | TG-1 | истёкший check → статус review + подпись причины |
| Потеря батча при fanout-исключении | QR-4 | persistDiscoveryFanout бросает → кандидаты возвращены в пул |
| retry({delaySeconds}>900) | QR-6 | клэмп и cron-подхват |
| candidate-mode «ready» при 0 контактов | QR-8, DS-3 | summary показывает contactPotential=0 + честный знаменатель |
| Черновик текста при reload | CP-3 | browser-мок: reload сохраняет template |
| Официальный домен без Firecrawl (sitemap/contact heuristic) | DS-5/B4 | бесплатно извлекает сайт у no_website компании |
| Ручной tier каталожного username | DS-2/B1 | unconfirmed resolved → ручное подтверждение → входит в strict только с authorization |

## 3. Golden corpus

Существует и версионируется: `evals/lead-radar/fixtures/dev.v1.json` + `holdout.v1.json` (schemaVersion/datasetVersion/split/seed/freeze/blocks), публично-безопасные синтетические данные с gate-ами по Wilson 95% (tests/lead-radar-golden-eval.test.ts, scripts/lead-radar/evaluate-golden.ts). Покрывает extraction/eval-гейты; **не покрывает**: queue-переходы, ownership-дайджесты, campaign state machine, Telegram resolution (это unit/regression-уровень выше).

## 4. Production read-only (30.08, без авторизации)

| Проверка | Метод | Результат |
|---|---|---|
| Frontend/Functions версия | GET gptbot.uz/gptbot-release.json | `a6939fc9…`, artifactSha256 совпал с handoff |
| Login endpoint | HEAD /admin-tools/login | 200, no-store |
| Worker `gptbot-automation` версия | Cloudflare API workers/scripts | modified 2026-08-29T01:28Z → **старее** HEAD; `4c01c56`/`0ddce6c` не задеплоены |
| Worker gateway версия | Cloudflare API | modified 2026-08-28T13:55Z (исходник 1.5.1) |
| Bridge процесс | schtasks (read-only) | task Выполняется; login/heartbeat не проверялись |
| D1 агрегаты/очереди/кампании | — | **не выполнялись** (нет авторизованной сессии) — остаётся открытым |
| Секреты/флаги runtime | — | значения не читались (только имена из handoff) |

## 5. Что осталось непроверенным (честный остаток)

1. Живые D1-агрегаты: распределение terminal reasons, stuck jobs, funnel по этапам, доля no_website/no-mobile — требует авторизованной сессии админки или согласования read-only запросов.
2. Фактический байт-эквивалент деплоя Worker vs `a044cf0` (вывод по времени деплоя; metadata version API вернул пустой список items).
3. Bridge: реальный Telegram login, heartbeat-свежесть, resolve_contacts без отправки — только с разрешения владельца.
4. Runtime-частота TG-2 (re-enrichment инвалидация verified) — механизм доказан кодом, масштаб не измерен.
5. Совместимость Bridge 1.5.0 ↔ gateway 1.5.1 при следующем релизе — сверять changelog перед деплоем.
6. Внешние условия Jina (лимиты/RPM) — не проверялись, активация только после сверки.
