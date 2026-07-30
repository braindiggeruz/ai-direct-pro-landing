# P3.1 production release evidence

Recorded: 2026-07-30

| Evidence | Result |
| --- | --- |
| Released source | `9629db58e6b7ec334b680acad053fce161d05137` |
| Merge method | controlled local `--no-ff` fallback; normal push, no force |
| Feature source retained | `3d646b95d74e4f84965ea727dcba0a10bbb93bc8` |
| Local corpus | 925/925, 36 suites |
| Owner suite | 69/69 |
| Post-merge critical corpus | 151/151 |
| Root / Functions TypeScript | pass / pass |
| Root / backend builds | pass / pass |
| Pages Functions bundle | pass |
| Production dependency audits | 0 root findings; 0 backend findings |
| Exact build | 111 pages, 109 articles, sitemap 223 |
| Fresh backup bytes | 10,528,651 |
| Fresh backup SHA-256 | `2B50D4388B9D9AC458B0AC195B2FBBAEDCDFF686347FEBB2CEFC0D1E61A093F4` |
| Backup restore | `integrity_check=ok` |
| Pending migration before | only `0025_owner_control_center_audit.sql` |
| Pending migration after | none |
| Remote objects | 69 tables, 102 named indexes |
| Pages deployment | `20d4c6e2-a69f-489a-b662-2d59122ac8ed` |
| Deployment source | exact released commit |
| Admin asset | `AdminRoot-CpqKduUX.js`, 396129 bytes |
| Admin asset SHA-256 | `2DEEBCC472CEFD7FBFE751E0F17CDD5880E0F30C903154C67FDB61564BF1F5A0` |
| Canonical vs immutable asset | identical |
| Production env contract | 28 vars; names/types digest `9e5d4bad1331b820f7b3ab81485a85a777c7c40f4668d92e2c6bb9c09a923094` |
| Retired n8n names in production env | 0 |
| Synthetic operational rows after cleanup | 0 |
| Retained bounded audit evidence | 5 events |
| Existing drafts after canary | 42 (`5 imported`, `37 pending_review`) |
| Automatic publication | disabled; no publication occurred |
| Cloudflare automatic deployment | disabled |
| Railway GitHub trigger | disconnected |
| GitHub SEO scheduler | `disabled_manually` |

## Production canary matrix

- Owner login: `200` before and after controlled mutations.
- Owner reads: overview, stores, store detail, orders, handoffs, automation,
  audit and pilot all `200`.
- Support Owner read: `200`; support Owner mutation: `403`; support legacy
  SEO-admin read: `403`.
- Seller/unknown role: `403`; expired/wrong-issuer/missing token: `401`.
- Missing reason: `400 invalid_reason_code`.
- Wrong typed confirmation: `400 confirmation_mismatch`.
- Request-supplied foreign organization: `400 unexpected_field`; foreign
  synthetic store stayed active.
- Suspend/restore: applied once, duplicate replay returned the same audit event,
  changed logical operation under the same key returned
  `409 idempotency_conflict`.
- Pilot activate/pause: applied once each; duplicate activation replayed the
  same audit event.
- Automation replay: real Queue/Worker execution; duplicate API replay did not
  send twice; synthetic missing reference returned safely to `dead_letter`.
- KV login lockout: five failed attempts in one process and the next request in
  a different process returned `429`.
- Retired ingest: `POST /api/admin/ai-drafts` returned `410`.
- Agents webhook without a dedicated bot identity: `503 no-store`.
- All inspected API/HTML responses were free of credentials and stack
  fragments. The immutable JS bundle contains only code-authored config labels
  and flags, not credential values.

## Rollback evidence

- Previous Pages deployment:
  `7fd0e9df-c782-4cc3-a3c4-5ed7270666b0`.
- Previous source:
  `5d4c7e8d1db036e4c04f1a7413b4e442aecc99f0`.
- Protected checkpoint:
  `F:\Claude\gptbot-p3.1-production-backups\20260730-p3.1-pre0025-9629db5\rollback-checkpoint.json`.
- Migration `0025` is additive. On code rollback retain its tables and all
  owner audit rows.

## Limitations recorded without weakening the verdict

The Codex in-app browser webview did not attach, so no visual session is
claimed. Production UI evidence consists of live route responses,
`no-store`/`noindex` headers, exact immutable asset identity, route parity and
behavioral UI/API tests.

The legacy JWT contract has no audience claim; a wrong-audience canary is
therefore not applicable. Issuer, algorithm, expiry, email and role were
tested.
