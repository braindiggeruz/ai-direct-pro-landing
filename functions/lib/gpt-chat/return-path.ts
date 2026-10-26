// The page a payment of the AI pack sends the buyer back to (Ш2-lite,
// monetization ROADMAP 2026-10-25 §5.2; 06-pages-audit Ш2).
//
// The pack window names the page the checkout started from
// (location.pathname). The server takes it only when it is, character for
// character, one of the pages that embed the chat: content/pages with
// pageType "gpt-chat" that the build writes (status other than "draft").
// tests/gpt-billing.test.ts keeps this list equal to those pages, so a new
// chat page joins it on purpose, never by accident. Anything else (an origin,
// "//host", a backslash, %-encoding, a query or a fragment, another case,
// the other language's page, an unknown or overlong path, a non-string) goes
// back to the language's main chat, as every payment did before Ш2-lite.
//
// The path is not stored anywhere: it only shapes the return URL of the
// provider's page (subscribe.ts). Amount, order, idempotency key and provider
// calls do not depend on it.

export type ReturnLocale = "ru" | "uz";

/** Where a payment returned before Ш2-lite, and where anything off the list still returns. */
export const CHAT_HOME_PATH: Readonly<Record<ReturnLocale, string>> = Object.freeze({
  ru: "/ru/gpt-chat/",
  uz: "/uz/gpt-uzbek-tilida/",
});

/** The shape every listed path has: /ru/ or /uz/, one lowercase slug, a closing slash. */
export const RETURN_PATH_SHAPE = /^\/(?:ru|uz)\/[a-z0-9-]+\/$/;

/** Longer than any listed path: a longer value is refused before the list is read. */
export const RETURN_PATH_MAX = 64;

/** The 23 pages that embed the chat (content/pages, pageType "gpt-chat"), exact paths only. */
export const CHAT_RETURN_PATHS: readonly string[] = Object.freeze([
  "/ru/generator-pozdravleniy/",
  "/ru/gpt-chat/",
  "/ru/kalkulyator/",
  "/ru/kirillica-v-latinicu/",
  "/ru/nepravilnye-glagoly/",
  "/ru/russko-uzbekskiy-perevodchik/",
  "/ru/vremena-angliyskogo-yazyka/",
  "/uz/ai-sher-yozish/",
  "/uz/ai-tabrik-generatori/",
  "/uz/fizika-test/",
  "/uz/gpt-telegram-instagram-ideya/",
  "/uz/gpt-uzbek-tilida/",
  "/uz/informatika-test/",
  "/uz/ingliz-tili-zamonlari/",
  "/uz/kalkulyator/",
  "/uz/kirill-lotin/",
  "/uz/matematika-test/",
  "/uz/notogri-fellar/",
  "/uz/onlayn-testlar/",
  "/uz/past-simple/",
  "/uz/present-continuous/",
  "/uz/present-simple/",
  "/uz/rus-ozbek-tarjimon/",
]);

/**
 * The site path a payment in `locale` returns to: `value` when it is a
 * listed chat page of that language, else the language's main chat.
 */
export function chatReturnPath(locale: ReturnLocale, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > RETURN_PATH_MAX ||
    !RETURN_PATH_SHAPE.test(value) ||
    !value.startsWith(`/${locale}/`) ||
    !CHAT_RETURN_PATHS.includes(value)
  )
    return CHAT_HOME_PATH[locale];
  return value;
}
