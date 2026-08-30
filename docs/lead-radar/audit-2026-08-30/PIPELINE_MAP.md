# Lead Radar — фактическая карта цепочки (аудит 2026-08-30)

Checkout: `F:\Claude\gptbot-lead-radar-integration-20260827`, HEAD `0ddce6c`, ветка `codex/lead-radar-main-integration-20260827`.
Все пути относительно корня репозитория. Проверка версии каждого звена — в разделе «Версии звеньев».

## 0. Версии звеньев (проверено 30.08.2026)

| Звено | Фактическое состояние | Источник проверки |
|---|---|---|
| Frontend Pages (UI + Pages Functions API) | commit `a6939fc960bfac74d807319f48944a005410ead7` | live `gptbot.uz/gptbot-release.json` (fetch 30.08, artifactSha256 совпадает с handoff) |
| Automation Worker `gptbot-automation` | modified **2026-08-29T01:28:28Z** — соответствует по времени деплою сразу после `a044cf0` (2026-08-29 06:26:36 +0500 = 01:26 UTC). Локальные `4c01c56`/`0ddce6c` в Worker **не входят** | Cloudflare API `workers/scripts` (read-only) |
| Gateway `gptbot-lead-radar-telegram-account` | modified **2026-08-28T13:55Z**; исходник v1.5.1 | Cloudflare API; `workers/lead-radar-telegram-account/wrangler.toml` |
| Windows Bridge | Scheduler task `GPTBot Lead Radar Telegram Bridge`: **Выполняется** 30.08. Процесс жив; Telegram login/heartbeat в рамках аудита не проверялись (нужна авторизованная карточка) | `schtasks /query` (read-only) |
| D1 `gptbot-ai-drafts` | Схема не инспектировалась напрямую (без авторизации readiness не вызывался) | — |

Вывод о рассинхроне: **серверная логика поиска/очередей в production живёт на версии ~`a044cf0`**, а API на Pages — на `a6939fc`. Разница для Lead Radar между `a044cf0` и `a6939fc` отсутствует (промежуточные коммиты — Bunzy/merge), но **два Lead Radar-фикса (`4c01c56`, `0ddce6c`) нигде не запущены**: ни в Worker, ни в Pages.

## 1. Полная цепочка

```text
[1] UI (React, src/admin/pages/LeadRadar.tsx, src/admin/components/lead-radar/*)
      │  fetch + Idempotency-Key
[2] Pages Functions API
      ├─ functions/api/admin/lead-radar/[[path]].ts — dispatcher (GET overview/searches/enrichment,
      │    POST searches / telegram-business, PATCH lifecycle, DELETE)
      ├─ functions/api/admin/lead-radar/audience-control.ts — GET /telegram-contacts (каталог),
      │    audiences CRUD
      └─ functions/api/admin/lead-radar/telegram-campaign-control.ts — account/pairing,
           media, preflight, prepare/approve/create/start, pause/resume/stop
      │
[3] D1 (GPTBOT_DRAFTS_DB) — единственное durable-хранилище состояний:
      │   lead_radar_searches / companies / evidence / jobs / candidate_pools /
      │   contact_enrichments / contact_checks / tg_user_accounts / tg_campaigns /
      │   tg_campaign_recipients / tg_campaign_effects / tg_recipient_eligibility /
      │   tg_campaign_operations / firecrawl_requests / audiences / suppressions
      │
[4] AUTOMATION_QUEUE → Worker gptbot-automation (queue consumer + cron */15)
      │   consumeLeadRadarQueueMessage (queue.ts:693) → claimJob (lease 2 мин, heartbeat 30 c)
      │   job types:
      │     discovery:{searchId}            → OSM/каталог-дискавери + fanout компаний
      │     enrichment:{companyId}          → обогащение сайта (см. §2)
      │     contact-resolve:{search}:{co}   → contact-source (Firecrawl/Jina) + Bridge resolution
      │     contact-pool:{searchId}:{n}     → пополнение/resume пула кандидатов
      │   cron: enqueueDueJobs, recovery expired leases (LIMIT 2), campaign dispatch ≤5
      │
[5] Внешние провайдеры извлечения (изнутри Worker):
      │   a) прямой HTTP fetch собственного сайта компании (бесплатно, sources.ts)
      │   b) Firecrawl search/map/scrape (платно; budget ledger в D1)
      │   c) Jina Reader — ТОЛЬКО fallback скачивания уже найденного URL (локально, не задеплоено)
      │
[6] Модель контакта: libphonenumber-js/max (E.164, тип линии) + telegram locator parser
      │   candidates: ownership company/unconfirmed/personal, lookupEligible
      │
[7] Ownership proof: first-party website evidence (confidence ≥0.8 + same-origin binding)
      │   каталоги: только special-case top.uz / structured entity; остальное — unconfirmed
      │
[8] Telegram resolution (проверка endpoint, не отправка):
      │   contact-resolution.ts:checkCorporateTelegramContact
      │   → proof_digest = hash(candidate + evidence + enrichment sources + binding)
      │   → lead_radar_contact_checks (TTL: resolved 24ч, failed 60с; ≤200/day)
      │   → gateway /v1/contacts/resolve → Bridge (MTProto, без сообщений)
      │   → resolved + ownership=company → компании пишется telegram_contact_json
      │       reason='bridge_resolved_corporate'; иначе 'bridge_resolved_unconfirmed'
      │
[9] Каталог/аудитории:
      │   GET /telegram-contacts → AudienceStore.directory → recipientDirectoryGroups
      │   (union-find по контакт-ключам через recipientContactChoices — тот же парсер, что в UI;
      │    статусы: blocked/conflict/contacted/verified/review; verified = strict Bridge check)
      │   audiences (≤500 companyIds) — выбор, НЕ получатели
      │
[10] Pre-campaign:
      │   preflight (readOnly) → evaluateSelection (campaign.ts:647-875):
      │   DNC → тип контакта → business-identity evidence → Bridge-verified (строгий) →
      │   contact history → authorization (contact_basis) → automatic ⊆ verified
      │   prepare → approval (TTL 10 мин, digest списка+текста+media+аккаунта)
      │   createApprovedTelegramCampaign: snapshot получателей (шифрованные endpoint/payload,
      │   eligibility rows, effect-ключи) — список иммутабелен
      │
[11] Отправка:
      │   cron/queue → claimNextTelegramCampaignRecipient (CAS lease, один в полёте)
      │   → dispatchClaimed... (повторные DNC/evidence/authorization проверки)
      │   → PrivateTelegramCampaignSender (telegram-account-service.ts:1299)
      │   → service binding POST /v1/messages/send, Idempotency-Key=effect_id,
      │     paid_message_policy=reject, timeout 125 c
      │   → gateway DO → Bridge → Telegram
      │   квота 30/UTC-день (D1 счетчик), интервал ≥120 c, лимит 50 кампаний
      │   исходы: sent / failed / ambiguous / skipped_dnc / skipped_stale / stopped
```

## 2. Контракты и состояния по переходам

| # | Переход | Вход → выход | Хранение состояния | Executor | Timeout/Retry | Идемпотентность | Terminal errors | Отличие local от prod |
|---|---|---|---|---|---|---|---|---|
| 1 | UI → POST /searches | {niche,city,country,desiredCount 5-50,languages,searchGoal} → 202 + search | lead_radar_searches (lease) | Pages Function | HTTP | Idempotency-Key обязателен | admission_paused, schema_unavailable | нет |
| 2 | → discovery job | job(3 попытки, backoff 45/90/180с) | lead_radar_jobs | Worker | lease 2м+heartbeat | idem `discovery:{id}` | dead_letter → убивает детей (QR-7) | нет |
| 3 | discovery → fanout ≤50 компаний | companies + enrichment children (барьер next_dispatch_at=9999) | companies, jobs | Worker, одна транзакция | — | idem `enrichment:{companyId}` | — | нет |
| 4 | enrichment | website → facts/evidence | evidence, companies | Worker | прямой fetch + Firecrawl fallback; budget ledger | effect `company_enrichment:v1` | robots/http/invalid — terminal; **transient 5xx → dead letter за 5 мин в prod** (QR-3) | фикс только локально (4c01c56) |
| 5 | contact-source | identity → sources+candidates | contact_enrichments (TTL 24ч) | Worker | Firecrawl search≤5 URL, scrape; **Jina fallback только локально** | idem ключ + firecrawl request_key | budget → парковка (прод. — замораживает пул, QR-2) | фикс/фича только локально |
| 6 | contact-resolve | candidate → Bridge resolve | lead_radar_contact_checks | Worker + Bridge | ≤200/day; resolved TTL 24ч | id (hash org+company+candidate+proof+account) | dead letter → **job невоссоздаваем** (QR-1) | нет |
| 7 | каталог | orgId → группы контактов | только чтение D1 | Pages Function | scan ≤5000 строк, verify ≤200 | — | directory_scan_limit 422 | нет |
| 8 | preflight | companyIds ≤50 → готовность | нет (readOnly) | Pages Function | — | — | eligibility_required, account/safety, media | нет |
| 9 | prepare→create | selection+template+media → кампания | campaigns+recipients+effects | Pages Function | approval TTL 10м | approval digest | approval_required при дрейфе | нет |
| 10 | dispatch | recipient → gateway send | effects (CAS) | Worker + gateway | 125 c; attempt=1 | Idempotency-Key=effect_id | flood/privacy → pause; unknown → ambiguous | нет |
| 11 | Bridge ↔ gateway | mailbox/heartbeat | DPAPI vault, ledger sqlite | Windows Bridge | heartbeat | pairing ack | session revoked | Bridge 1.5.0 vs gateway 1.5.1 — проверить совместимость при релизах |

## 3. Места, где цепочка рвётся (сводка, детали в FULL_AUDIT.md)

1. **QR-2/QR-3 (production, сейчас)**: budget-parked job замораживает пул; транзиентный сбой сайта = вечный terminal компании. Локальные фиксы не задеплоены.
2. **QR-1**: contact-resolution job после dead letter не пересоздаётся — компания молча выпадает из воронки контактов.
3. **DS-1**: публичные контакты (каталоги, t.me) добываются только Firecrawl search; Jina не заменяет discovery. Бюджет исчерпан → выход 0 при живом коде.
4. **DS-2**: цель «N проверенных контактов» считается только по `bridge_resolved_corporate` (первоисточник — собственный сайт). Каталожный username, успешно разрешённый Bridge, в цель не идёт.
5. **TG-1**: строгое подтверждение живёт 24 ч; без повторной проверки verified-набор ежедневно обнуляется.
6. **CP-1**: lease отправки (120 c) короче бюджета запроса (125 c) → редкий, но реальный путь ложного `ambiguous` и конкурентной отправки.
7. **CP-3**: текст кампании не сохраняется между reload (только media).
