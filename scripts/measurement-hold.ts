// Measurement hold for the snippet-formula CTR test released on 2026-09-19.
//
// Lifted 2026-09-29 (GSC-driven release): the 2026-10-03 read cannot be valid.
// URL Inspection shows 4 of the 9 pages (/uz/blog/internet-reklama-narxi-ozbekiston-2026/,
// /uz/ai-sotuvchi/, /uz/blog/marketing-nima/, /uz/sayt-yaratish/) not recrawled
// since the 2026-09-19 change (last crawls 09-02, 09-03, 09-04, 09-18), and the
// other five had 0–66 impressions per 14 days (windows 09-05..18 and 09-16..29)
// with zero clicks — far below any detectable CTR effect. The pages now
// receive the same templates as their clusters.
//
// History. Two commits applied the formula to nine unprotected pages:
//   3b40a2ef — the four ranking Uzbek advertising pages
//   2e574271 — five more Uzbek pages with the query wording they lacked
// docs/seo/gsc-audit-2026-09-17/ROADMAP_2026-09-19_CONVICTION.md §2.3 planned
// to read the result on 2026-10-03, and until the lift these pages got no
// visible change from the templates (no section nav, form or sticky bar).
// docs/seo/CHANGE_LOG_2026-09.md records the lift.
//
// The mechanism stays: scripts/prerender.ts (renderLandingHeader) and
// scripts/lead-form.ts still consult this set, so a future test can put pages
// on hold again by listing them here with a new date and a reason.
//
// Former hold list (2026-09-19 → 2026-09-29):
//   // 3b40a2ef
//   '/uz/internet-reklama-toshkent/',
//   '/uz/telegram-reklama/',
//   '/uz/blog/internet-reklama-narxi-ozbekiston-2026/',
//   '/uz/blog/target-reklama-nima/',
//   // 2e574271
//   '/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/',
//   '/uz/blog/marketing-nima/',
//   '/uz/ai-sotuvchi/',
//   '/uz/gpt-bot-biznes-uchun/',
//   '/uz/sayt-yaratish/',
export const MEASUREMENT_HOLD_UNTIL = '2026-09-29';

export const MEASUREMENT_HOLD_PATHS: ReadonlySet<string> = new Set<string>([]);

export function isMeasurementHoldPath(url: string): boolean {
  return MEASUREMENT_HOLD_PATHS.has(url);
}
