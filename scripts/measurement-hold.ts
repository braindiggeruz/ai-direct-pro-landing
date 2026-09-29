// Pages under the snippet-formula CTR test released on 2026-09-19.
//
// Two commits applied the formula to nine unprotected pages:
//   3b40a2ef — the four ranking Uzbek advertising pages
//   2e574271 — five more Uzbek pages with the query wording they lacked
// docs/seo/gsc-audit-2026-09-17/ROADMAP_2026-09-19_CONVICTION.md §2.3 reads the
// result on 2026-10-03. Until then these pages get no visible change from the
// templates: no new block, form, navigation row, sticky bar or text. A change
// here would make the reading unattributable.
//
// Invisible changes (a head script, a query string on an outbound link) are
// allowed; they do not reach the snippet or the page a visitor sees.
export const MEASUREMENT_HOLD_UNTIL = '2026-10-03';

export const MEASUREMENT_HOLD_PATHS: ReadonlySet<string> = new Set([
  // 3b40a2ef
  '/uz/internet-reklama-toshkent/',
  '/uz/telegram-reklama/',
  '/uz/blog/internet-reklama-narxi-ozbekiston-2026/',
  '/uz/blog/target-reklama-nima/',
  // 2e574271
  '/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/',
  '/uz/blog/marketing-nima/',
  '/uz/ai-sotuvchi/',
  '/uz/gpt-bot-biznes-uchun/',
  '/uz/sayt-yaratish/',
]);

export function isMeasurementHoldPath(url: string): boolean {
  return MEASUREMENT_HOLD_PATHS.has(url);
}
