// The Payme checkout link of every chat page (chat CRO 2026-11-17, P3).
// Payme's page takes ONE path segment, the base64 of "m=…;ac.order_id=…;a=…;
// c=<return URL>;l=…;ct=…". The return URL carries a "?": when it falls on the
// third byte of a base64 triplet the segment contains "/", and Payme's own
// router may read the rest as a second path segment. The link is built so no
// chat page, in any language of the return, has a "/" in it, and the
// parameters decode to exactly the merchant, the order, the amount and the
// return address the order has always had.
//
// Run: node --import tsx --test tests/gpt-payme-link.test.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import type { BillingEnv } from "../functions/lib/gpt-chat/billing-config";
import { PRICE_TIYIN } from "../functions/lib/gpt-chat/billing-config";
import { PAYME_CHECKOUT_BASE, PAYME_RETURN_DELAY_MS, paymeCheckoutUrl } from "../functions/lib/gpt-chat/payme-checkout";
import { CHAT_RETURN_PATHS, chatReturnPath } from "../functions/lib/gpt-chat/return-path";

const MERCHANT = "587f72c72cac0d162c722ae2";
const env = { GPT_PAYME_MERCHANT_ID: MERCHANT } as BillingEnv;
const ORDER = `pay_${"0123456789abcdef".repeat(2)}`;
const ORIGIN = "https://gptbot.uz";

/** The chat pages the site builds (content/pages, pageType "gpt-chat"), as site paths. */
function contentChatPaths(): string[] {
  const found: string[] = [];
  for (const locale of ["ru", "uz"]) {
    const dir = new URL(`../content/pages/${locale}/`, import.meta.url);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const page = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as { pageType?: string; status?: string; slug?: string };
      if (page.pageType === "gpt-chat" && page.slug) found.push(`/${locale}/${page.slug}/`);
    }
  }
  return found;
}

const PATHS = [...new Set([...contentChatPaths(), ...CHAT_RETURN_PATHS, "/ru/gpt-chat/", "/uz/gpt-uzbek-tilida/", "/not/listed/", "/"])];
const back = (locale: "ru" | "uz", path: string) => `${ORIGIN}${chatReturnPath(locale, path)}?pay=return`;
const segment = (url: string) => new URL(url).pathname.slice(1);
/** The order of keys and values the link has always carried. */
const classic = (locale: "ru" | "uz", c: string) =>
  `m=${MERCHANT};ac.order_id=${ORDER};a=${PRICE_TIYIN};c=${c};l=${locale};ct=${PAYME_RETURN_DELAY_MS}`;
const pairs = (text: string) => Object.fromEntries(text.split(";").map((part) => [part.slice(0, part.indexOf("=")), part.slice(part.indexOf("=") + 1)]));

test("P3: the content really has chat pages and at least one used to put a '/' into the segment", () => {
  assert.ok(contentChatPaths().length >= 20);
  const broken = PATHS.flatMap((path) => (["ru", "uz"] as const).filter((locale) => btoa(classic(locale, back(locale, path))).includes("/")));
  assert.ok(broken.length > 0, "the defect the diagnosis found (/uz/kirill-lotin/ and four more) is still reproducible with the old order");
});

test("P3: every chat page, both languages: no '/' in Payme's segment, and it decodes to the same parameters", () => {
  for (const mode of ["test", "live"] as const)
    for (const path of PATHS)
      for (const locale of ["ru", "uz"] as const) {
        const c = back(locale, path);
        const url = paymeCheckoutUrl(env, mode, ORDER, locale, c)!;
        assert.ok(url, `${mode} ${locale} ${path}`);
        assert.equal(new URL(url).origin, PAYME_CHECKOUT_BASE[mode]);
        const encoded = segment(url);
        assert.doesNotMatch(encoded, /\//, `${locale} ${path}: no slash in the segment`);
        assert.doesNotMatch(encoded, /\+/, `${locale} ${path}: no plus in the segment`);
        assert.match(encoded, /^[A-Za-z0-9]+={0,2}$/);
        assert.equal(url, `${PAYME_CHECKOUT_BASE[mode]}/${encoded}`, "one path segment, no query, no fragment");
        const decoded = atob(encoded);
        // Same merchant, account field, amount, return address, language and delay: only the order of the pairs may differ.
        assert.deepEqual(pairs(decoded), pairs(classic(locale, c)), `${locale} ${path}`);
        assert.equal(decoded.split(";").length, 6);
        assert.equal(pairs(decoded).m, MERCHANT);
        assert.equal(pairs(decoded)["ac.order_id"], ORDER);
        assert.equal(pairs(decoded).a, "2000000");
        assert.equal(pairs(decoded).c, c);
      }
});

test("P3: a page whose link was already fine keeps the link it always had, byte for byte", () => {
  for (const path of PATHS)
    for (const locale of ["ru", "uz"] as const) {
      const c = back(locale, path);
      const old = btoa(classic(locale, c));
      if (!old.includes("/")) assert.equal(segment(paymeCheckoutUrl(env, "live", ORDER, locale, c)!), old, `${locale} ${path}`);
    }
  // The documented sample of tests/gpt-payme.test.ts stays what it was.
  assert.equal(
    paymeCheckoutUrl(env, "test", ORDER, "ru", "https://gptbot.uz/ru/gpt-chat/?pay=return"),
    "https://test.paycom.uz/bT01ODdmNzJjNzJjYWMwZDE2MmM3MjJhZTI7YWMub3JkZXJfaWQ9cGF5XzAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmO2E9MjAwMDAwMDtjPWh0dHBzOi8vZ3B0Ym90LnV6L3J1L2dwdC1jaGF0Lz9wYXk9cmV0dXJuO2w9cnU7Y3Q9MTUwMDA=",
  );
});

test("P3: the same input always gives the same link, and a bad value still gives none", () => {
  const c = back("uz", "/uz/kirill-lotin/");
  assert.equal(paymeCheckoutUrl(env, "live", ORDER, "uz", c), paymeCheckoutUrl(env, "live", ORDER, "uz", c));
  assert.equal(paymeCheckoutUrl(env, "live", ORDER, "uz", `${c};a=1`), null);
  assert.equal(paymeCheckoutUrl(env, "live", `${ORDER} `, "uz", c), null);
  assert.equal(paymeCheckoutUrl({ GPT_PAYME_MERCHANT_ID: "" } as BillingEnv, "live", ORDER, "uz", c), null);
});
