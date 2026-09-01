# EVIDENCE_INDEX — артефакты и следы аудита (2026-08-30)

Все проверки read-only/локальные. Внешние побочные эффекты не создавались (никаких платных запросов, отправок, деплоев, изменений флагов/данных).

## 1. Git-состояние

- `git status --porcelain` — соответствует handoff (M AGENTS.md; ?? STATE.md, HANDOFF.md, roadmaps, .tmp-* и др.); новых чужих изменений нет.
- `git log --oneline -8`: HEAD `0ddce6c` (Jina fallback, 2026-08-30 05:47 +0500) ← `4c01c56` (pool/backoff, 05:22) ← `a6939fc` (Bunzy route, 05:06) ← `a044cf0` (strict Bridge-verified selection, 2026-08-29 06:26).
- `git diff --stat a6939fc..HEAD` — 8 файлов, +531/-10 (contact-source-worker, jina-reader-client, queue, store, тесты): точный периметр «локального, не задеплоенного».

## 2. Production read-only

- `curl https://gptbot.uz/gptbot-release.json` — commit `a6939fc960bfac74d807319f48944a005410ead7`, artifactSha256 `288336fd…`, fileCount 870, feature markers совпадают с handoff.
- `curl -I https://gptbot.uz/admin-tools/login` — 200, `Cache-Control: no-store`.
- Cloudflare API `GET /accounts/…/workers/scripts` (token из `~\.config\lead-radar\lead-radar-access.env.txt`, в отчётах значений нет): `gptbot-automation` modified 2026-08-29T01:28:28Z; `gptbot-lead-radar-telegram-account` modified 2026-08-28T13:55:57Z. deployments endpoint вернул пустой items (ограничение permission) — вывод о соответствии `a044cf0` сделан по таймингам commit→deploy.
- `schtasks /query /tn "GPTBot Lead Radar Telegram Bridge"` — Состояние: Выполняется (30.08).

## 3. Локальные прогоны

- `npm run test:lead-radar` → **347/347 pass** (лог: `%TEMP%\lr-test-main.log`).
- `npm run test:lead-radar-contacts` → **104/104 pass** (`%TEMP%\lr-test-contacts.log`).
- `npm run typecheck:lead-radar` → OK (`%TEMP%\lr-typecheck.log`).

## 4. Ключевые файлы кода с построчными ссылками

См. FULL_AUDIT.md (каждая карточка). Основные:
- `functions/platform/lead-radar/store.ts` — ensureContactResolutionJob:450-461; deadLetterJob:1470-1486; deadLetterDiscoveryChildren:1506-1531; listExpiredJobs:1600-1607; refreshSearchFunnel:1861-2025 (blockingActiveJobs:1950-1953, blockedSources:1966, terminal:1999, ready:2002-2003); orphan cleanup service.ts:193,299.
- `functions/platform/lead-radar/queue.ts` — retry/backoff:264-274, 317-321, 340; contact-check catch:547-552, 559-567; комментарий о пересоздании:562-563; at-least-once:699-701; consume:693; cron:792-819.
- `functions/platform/lead-radar/contact-source-worker.ts` — Firecrawl-гейт:13-14; Jina fallback:55-65, 118-122; search includeDomains:68-77; robots/unsafe:42-49, 115-117.
- `functions/platform/lead-radar/contact-resolution.ts` — RESOLVED_REASON:12; candidates:23-43; proof:44-53; countResolvedCorporateContacts:57-71; resolve flow:72-145; verifier:148-175.
- `functions/platform/lead-radar/telegram-campaign.ts` — MAX_SELECTION/limit:41-44; lease:46; render:378-384; evaluate:647-875; prepare gates:1465-1484; approval:1490-1699; create snapshot:1713-1786; dispatch:2018-2472; recover:2582-2664.
- `functions/platform/lead-radar/telegram-campaign-store.ts` — статусы:5-22; beginDispatch:2555-2613, 2664-2697; markRecipientSent:3160-3186; ambiguous:3356-3432; recoverExpiredClaim:3434-3468; maintain:3682-3700.
- `functions/platform/lead-radar/telegram-account-service.ts` — send budget:29-34; sender:1299-1409; Idempotency-Key:1321-1329; ambiguous:1337-1368; pairing/auth surface:651-1020.
- `functions/platform/lead-radar/firecrawl-client.ts` — config/allowlist:21-39; limits:31-36; каталоги:48-54; redirect manual:146-148; request lifecycle:99-178.
- `functions/platform/lead-radar/recipient-directory.ts` — 5000-лимит:40-41; группировка:42-81.
- `functions/platform/lead-radar/audiences.ts` — directory():127+; фильтры verified:140-152; 422:62, 145.
- `src/shared/lead-radar-contacts.ts` — assess:62-83; extract:86-99; reason copy:101-111.
- `src/shared/lead-radar-recipient-contacts.ts` — choices:15-46; verified choices:54-75.
- `src/admin/components/lead-radar/TelegramContactDirectory.tsx` — статусы:10; ошибки:11-21; опрос:43-57.
- `src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx` — recovery:815-853; poll:1016-1046; template reset:705; composer:2620-2631; updateTemplate:1525-1528.

## 5. Ограничения

- Авторизованные admin API / D1 / Bridge vault / Telegram session не трогались (по границам задачи). Значения секретов нигде не выводились.
- Агентские обходы (2 Explore) выполнялись только на чтение; их выводы выборочно перепроверены мастером (recipient-directory, contact-resolution, contact-source-worker, firecrawl-enrichment, capabilities, validation — прочитаны напрямую).
