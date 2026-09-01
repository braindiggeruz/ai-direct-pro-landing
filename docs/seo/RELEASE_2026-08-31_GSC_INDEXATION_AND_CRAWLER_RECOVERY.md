# GPTBot.uz — GSC indexation hygiene and Lead Radar crawler recovery

Date: 2026-08-31

This release combines the verified GSC indexation hygiene change with a source-controlled recovery of the live local crawler control plane. The previous live deployment contained an unpushed dirty collector superset. Deploying only the SEO branch would have removed its Functions and owner UI.

## Recovered collector contract

- Source migration `0056_lead_radar_crawler.sql` matches the existing production D1 objects.
- The authenticated local worker uses a bearer token whose SHA-256 digest is stored in D1; the raw token is never returned.
- Owner routes expose read-only status, one idempotent create action and one explicit cancel action.
- Worker routes are POST-only, auth-first, bounded, lease-fenced and receipt-idempotent.
- Public results may update `lead_radar_contact_enrichments`, but the crawler never authorizes messaging or sends anything.
- The existing worker row and production data are reused; no D1 migration is executed during deployment because `0056` is already ledgered remotely.
- The stable research schema fingerprint explicitly treats the crawler extension as independently gated additive schema.

## GSC corrections

- obsolete `SearchAction` removed;
- blog `q` templates collapse to clean indexes;
- three content-like historical 404s redirect to relevant published owners;
- retired redirect sources removed from active UI, money, hreflang, booster and LLM files;
- generic private-looking probes remain true noindex 404s.

## Deployment safety

The production workflow must snapshot the current crawler worker heartbeat and jobs before upload, rebuild from a clean commit, verify both origins and all 260 sitemap self-canonicals, then prove that a previously-online worker continues heartbeating. If any release canary fails, Cloudflare Pages must be rolled back to the captured previous deployment.
