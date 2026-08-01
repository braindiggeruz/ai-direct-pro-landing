# GPTBot Market rollback evidence

Release: deployment `68747046-8e1e-492a-8b81-dc4e4065916f`, source
`08c21568581bf90e7122a566f2805a619cd9e81d`.

Immediate rollback target: deployment
`d9ca163e-947b-40ba-856d-8143308c8402`, source
`c670e4eebff79e2cc4b9027ffede865f0af813ab`, immutable URL
`https://d9ca163e.ai-direct-pro-landing.pages.dev`.

Rollback is application-only. This release introduced no migration, D1 write,
secret mutation, webhook mutation, Railway deployment, Queue/Worker mutation,
BotFather change or real-store data. Do not run a D1 rollback and do not run
`wrangler d1 migrations apply --remote`.

Trigger rollback for a production outage, auth/schema regression, incorrect
identity, cross-tenant exposure, duplicate effect, lost notification or
material public-truth defect. Promote/redeploy the recorded target through the
controlled Cloudflare Pages release path, then repeat the HTTP/auth canary and
D1 read-only aggregate query. Keep the failed deployment immutable for
evidence; do not delete it during incident response.
