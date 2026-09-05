# AEO Studio production release - 2026-09-05

Owner explicitly authorized commit, push and deployment in this task.

Baseline: remote main and custom-domain manifest both 432eab906383b137474bb67bb95b57268aa93cca. Previous Pages deployment: 109137c6-6aae-4d08-bd27-a748ce863462. Auto deployment is disabled; use the guarded release script.

Backup: F:/Claude/aeo-production-20260905/_implementation/production-release/d1-before.sql, 23928687 bytes, SHA256 8c1ce37aa546171a4415217adae9c4a3a55f11e6b0145323b7821c6a27db5a0d. Private, never committed. Local full restore preserves 146 tables and passes structural integrity with check constraints ignored; strict local restore reports a lead_radar_signal_posts excerpt constraint. Live D1 reports zero invalid excerpts. This export/SQLite discrepancy is recorded, not claimed as corruption or repaired during AEO deployment.

Only additive AEO migrations 0062 and 0063 were applied and recorded in d1_migrations. New tables and index read back successfully. Existing operational rows were not edited.

Three free model IDs verified present with zero prompt/completion pricing in the current provider catalogue: minimax/minimax-m3:free, nvidia/nemotron-3-super-120b-a12b:free, dots-studio/dots-3-note-preview:free. AEO uses existing secret binding and strict zero-price routing. No paid model or web-search setting enabled. Actual provider canary pending.

Code commit, deployment result and live verification will be recorded after release. Validation logs remain outside Git at F:/Claude/aeo-production-20260905/aeo-release-*.log.
