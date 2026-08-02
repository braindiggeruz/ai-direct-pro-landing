# GPTBot Market Mini App risk register

Probability and impact are pre-mitigation planning estimates. “Owner” is the
accountable role, not proof that a person has accepted it.

| ID | Risk | Probability | Impact | Detection | Prevention | Contingency | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | business rules duplicated in BFF/client | medium | critical | service/contract diff, code review | BFF calls existing commands/queries; client shares DTOs only | disable duplicate endpoint, revert to bot/service path | Principal engineer |
| R-02 | bot and Mini App show inconsistent state | medium | high | parity fixtures, same-user cross-surface E2E | one D1/domain truth, activation refetch, no local authority | app flag off; bot canonical; reconcile server state | Product + engineering |
| R-03 | seller authorization drifts | medium | critical | revoke/pause tests, auth audit | re-read active owner membership/store on each seller request | disable seller surface; incident review | Security owner |
| R-04 | cross-store IDOR | medium | critical | two-store matrix, enumeration tests | server-derived scope and tenant-bound service calls | global kill switch, preserve logs/request IDs, incident response | Security owner |
| R-05 | `initDataUnsafe` or wrong HMAC use | medium | critical | forged/official vector suite | one strict validator, raw initData only, constant-time check | disable all Mini App auth | Security owner |
| R-06 | stale/replayed session acts after change | medium | high | revoke/replay/two-device tests | short session, fresh launch refresh, per-request lifecycle/role checks | expire/rotate secret if needed; seller flags off | Backend lead |
| R-07 | double order from repeated tap/network loss | medium | critical | concurrency/retry integration | stable idempotency key, one active draft, pending UI | commands off; use operation truth and bot recovery | Commerce domain owner |
| R-08 | double/negative inventory decrement | low | critical | movement uniqueness/OCC tests and monitoring | unchanged `confirmOrder` domain batch/version/unique move | seller confirm off; pause store; reconcile inventory ledger | Commerce domain owner |
| R-09 | duplicate/missing notification | medium | high | intent count vs transition, dispatcher telemetry | create intent inside unchanged domain operation; idempotent claim | keep order truth, retry via approved OCC path; bot support | Messaging owner |
| R-10 | WebView reload loses user effort | high | medium | reload/kill E2E | server checkout workflow; local unsaved warning; restore active draft | resume in bot; explain what was/was not saved | Frontend lead |
| R-11 | broken back navigation/handler leak | medium | medium | route matrix, listener-count tests | one Telegram adapter tied to Router lifecycle | frontend rollback; browser/in-app back control | Frontend lead |
| R-12 | abandoned checkout accumulation | medium | medium | draft age/count projection | reuse cancel/resume; no automatic duplicate; define later cleanup from evidence | bot resume/cancel; owner-assisted cleanup policy | Product owner |
| R-13 | optimistic/offline state contradicts server | medium | high | offline/response-lost E2E | no offline mutation, stock/status non-optimistic, conflict refetch | discard client cache and reload server truth | Frontend lead |
| R-14 | Telegram `file_id` incompatible with browser/media slow | high | high | proxy latency/error/MIME metrics | server proxy, bounded image, placeholder; later R2 only if justified | disable images; text card + bot photo | Media/platform owner |
| R-15 | low-end Android performance poor | high | high | real-device WebView trace, p75/p95 | isolated bundle, code split, image budget, low-motion UI | reduce media/motion, read-only cohort, frontend rollback | Frontend/performance owner |
| R-16 | RU/UZ expansion/clipping or unnatural UZ | high | high | width/200% snapshots, native review | flexible layout, no fixed labels, native Uzbek gate | hide affected action/localized fallback; do not expand cohort | Localization owner |
| R-17 | Telegram iOS/Android/Web API differences | medium | high | real-client capability matrix | version checks, adapter fallbacks, no critical gimmick | affected-client exclusion or global app flag off | Telegram platform owner |
| R-18 | BotFather/menu misconfiguration opens wrong app/cohort | medium | high | owner checklist, test link/getMe/launch smoke | exact URL/bot/environment record, staged menu action | revert menu/profile button; `/start` bot remains | Bot owner |
| R-19 | current wildcard CORS exposes authenticated BFF | high until fixed | critical | header contract with evil/null origin | exact path/origin allowlist, no credentialed cookies, `Vary` | global app off and BFF rollback | Security/backend owner |
| R-20 | Mini App deploy coupled to main website/backend | medium | high | release dependency map and regression | independent static project, API flags, exact-SHA compatibility | frontend independent rollback; BFF flags off before backend rollback | Release owner |
| R-21 | rollback target missing/incompatible | low | critical | pre-release immutable deployment/contract drill | record paired versions, flags, deployment IDs before enable | global flag off; bot-only operation | Release owner |
| R-22 | analytics/logs leak PII/initData | medium | critical | forbidden-value scans, payload snapshots | closed allowlist/PII validator; no raw URLs/IDs/content | disable events/log sink, access review and incident process | Privacy/security owner |
| R-23 | support burden rises during dual UI | high | medium | fallback/support volume, task failure reasons | tiny cohorts, truthful recovery, runbook and ownership | reduce cohort/commands, bot primary | Product operations |
| R-24 | legacy bot callbacks deprecated prematurely | medium | high | callback/fallback/task-success trend | stability window, independent callback flags, bot regression | re-enable callback immediately | Product owner |
| R-25 | schema/ledger mismatch triggers unsafe migration | medium | critical | physical/ledger reconciliation gate | no blind remote apply; no schema first slice | stop release; restore from tested backup only under owner plan | Data/release owner |
| R-26 | BFF exposes internal D1/PII shape | medium | high | DTO snapshot and property fuzzing | allowlisted presenters, separate list/detail, `no-store` | disable endpoint; rotate exposed sensitive data only if incident requires | Backend/privacy owner |
| R-27 | media proxy leaks bot token or becomes SSRF | medium | critical | token/bundle/log scan and arbitrary URL tests | opaque handles, fixed Telegram API host, never client URL, bounded bytes | proxy off, rotate bot token only under incident authority | Security/Telegram owner |
| R-28 | CSP/frame policy breaks Telegram Web or allows hostile embedding | medium | high | staging Telegram Web + hostile iframe | report-only rehearsal, exact compatible `frame-ancestors`, no XFO DENY | revert header/frontend, app flag off for affected client | Security/frontend owner |
| R-29 | seller product self-service publishes low-quality/false data | medium | high | quality/validation/pilot review | mutations delayed; drafts first; server validation/version; owner-approved media/freshness | unpublish via existing service/owner process; disable catalog commands | Product/catalog owner |
| R-30 | real seller/personal data enters synthetic canary | low | critical | fixture/provenance scan and cohort audit | synthetic-only store/identities and no production import | stop canary, isolate/delete only under approved privacy process | Pilot owner |

## Escalation classes

- **Immediate hard stop:** R-03–R-09, R-19, R-21–R-22, R-25, R-27 or R-30
  occurs or a test demonstrates it is currently possible.
- **Cohort pause:** performance, platform, localization, navigation, media or
  support gates miss target without security/data harm.
- **Backlog only:** cosmetic drift with a safe fallback and no task/access
  impact; still must be fixed before primary cutover if P1.

Risk acceptance for a real cohort must name an owner, expiry and measurable
guardrail. “Known issue” is not acceptance.
