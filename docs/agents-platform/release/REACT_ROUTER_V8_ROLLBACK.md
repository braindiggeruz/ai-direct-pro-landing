# React Router 8 local rollback

This runbook is for a local release-candidate rollback only. It grants no
permission for a force-push, remote ref rewrite, production deployment,
Cloudflare/Railway change, webhook mutation, D1 mutation or n8n mutation.
The operating rule is explicit: no force-push and no production deployment.

Baseline before the migration:
`b128772e5375cfee87ad57622d546e7e363acc03`.

## Preferred response

Use a forward fix when the patched dependency graph can be retained. Reverting
to React Router 7.18.1 restores a package in the reviewed affected range and is
therefore an emergency containment option, not a production-ready end state.

## Local rollback procedure

1. Stop before any push or deployment and record the current local candidate
   commit.
2. Work in a disposable clone or worktree created from the verified full
   bundle or mirror backup.
3. Revert the two local migration commits with ordinary `git revert`; do not
   use reset, force-push or remote history rewriting.
4. Confirm the resulting tree matches the baseline commit above.
5. Restore dependencies with the baseline `package.json`, `yarn.lock` and root
   `package-lock.json`; keep `apps/gpt-backend/package-lock.json` unchanged.
6. Run frozen Yarn install, root typecheck, production build, prerender,
   sitemap generation, route parity and the complete regression suite.
7. Run both dependency audits. A rollback to Router 7.18.1 is expected to
   restore the reviewed Router advisory; that result blocks release and
   requires a forward fix.
8. Run the canonical secret scan and verify governance still says R0.3
   `in_progress`, R0.3B blocked, R0.4 incomplete and R1/P3 not started.

## Success and stop conditions

A rehearsal succeeds only if the reverted tree equals the verified baseline,
all baseline functional/build/route gates behave as documented, no external
mutation occurs and the restored advisory is explicitly treated as blocking.

Stop immediately on tree mismatch, route loss, auth-boundary change,
prerender/sitemap failure, a new audit finding, secret-scan finding, unexpected
Functions typecheck delta or any request to mutate a remote or production
system. Preserve the disposable rehearsal and backup evidence for review.
