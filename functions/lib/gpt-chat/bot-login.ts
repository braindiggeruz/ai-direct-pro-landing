// What the two ends of sign-in through the bot share (plan WP-16): the site's
// routes functions/api/gpt/auth/bot/* and the bot's functions/lib/telegram/
// web-login.ts. The state lives in bot-login-store.ts.

/** The browser's secret for its sign-in attempts: HttpOnly, 10 minutes. */
export const BOT_LOGIN_COOKIE = "__Host-gpt_botlogin";

/**
 * The /start payload of a sign-in: "login_" + the 128-bit nonce as 32 hex,
 * 38 characters. It overlaps neither the handoff's `w_…` nor `site_ru|uz`.
 */
export const LOGIN_PAYLOAD_PREFIX = "login_";
export const LOGIN_PAYLOAD_RE = /^login_[0-9a-f]{32}$/;

// First match wins: Edge, Opera, Yandex and Samsung say "Chrome" too, and
// Chrome says "Safari".
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bYaBrowser\//, "Yandex Browser"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows NT\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/**
 * The browser family and OS of a User-Agent, such as "Chrome, Android": what
 * the bot shows so the person can tell their own browser from someone
 * else's. Never the version, the device model or the address. Null when
 * neither is recognised.
 */
export function browserLabel(userAgent: string | null): string | null {
  const ua = (userAgent || "").slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  return [browser, system].filter(Boolean).join(", ") || null;
}
