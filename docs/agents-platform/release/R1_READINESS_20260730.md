# R1 readiness — 2026-07-30

Status: technically ready; pilot not started.

## Completed technical gates

- P3.1 is independently reviewed, merged and live from exact source.
- Production D1 has a fresh verified backup and migration `0025`.
- Owner/support authorization, tenant boundaries, bounded atomic audit,
  idempotency, Queue replay and KV lockout pass in production.
- Sotuvchi platform migrations and prior production canaries remain valid.
- First-party automation is the sole supported path.
- n8n is retired; automatic publication and the SEO scheduler are disabled.
- Cloudflare automatic deployments are disabled and Railway is disconnected.
- Rollback artifacts and hard-stop criteria are recorded.
- No real store, bot, webhook, buyer, order, inventory movement or payment was
  created during P3.1.

## Remaining owner/provider prerequisite

The owner must create and retain ownership of a dedicated Telegram Agents bot
in BotFather. This cannot be invented or safely completed without the owner.

The protected installation sequence is:

1. create the dedicated bot in BotFather;
2. verify the exact identity with Telegram `getMe`;
3. confirm that its username is syntactically valid and distinct from the
   protected Lead/Javob identities;
4. install its token and a new, distinct webhook secret through the protected
   owner credential path;
5. never send either credential in chat, Git, screenshots or governance;
6. separately authorize webhook mutation and verify the exact target URL;
7. select 1–3 real, consented and verified stores;
8. separately authorize and execute
   `R1_SOTUVCHI_CONTROLLED_PILOT_RUNBOOK.md`.

## Business and operator inputs not created by this release

Before the separately authorized pilot starts, the owner must also provide:

- 1–3 consented stores with verified legal/business owners;
- verified seller Telegram identities, each assigned only to its own store;
- approved initial categories and catalogs;
- integer UZS prices under the existing Sotuvchi contract;
- signed opening inventory baselines and a named correction owner;
- a seller response SLA and escalation contact;
- a named pilot support owner, incident lead and protected communication path.

These are controlled-pilot inputs, not missing platform implementation. No real
store or seller was silently created to make the readiness record look green.

## R1 hard boundaries

R1 does not authorize reconnecting Railway, enabling Cloudflare auto-deploy,
enabling a scheduler, restoring n8n, enabling automatic publication, launching
a public marketplace, enabling payments or creating synthetic substitutes for
real stores or the provider-owned bot.

```text
R1_TECHNICAL_READINESS=PASS
R1_PILOT_STARTED=NO
OWNER_PROVIDER_PREREQUISITE=DEDICATED_BOTFATHER_AGENTS_BOT
AGENTS_BOT_CREATED=NO
WEBHOOK_CONFIGURED=NO
REAL_STORES_SELECTED=NO
SELLER_IDENTITIES_VERIFIED=NO
CATALOGS_AND_INVENTORY_BASELINES_APPROVED=NO
SLA_AND_INCIDENT_OWNERS_ASSIGNED=NO
```
