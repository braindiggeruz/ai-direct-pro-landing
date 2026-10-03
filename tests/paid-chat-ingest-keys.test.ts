// Intake of the owner's keys (paid-chat plan WP-23): scripts/paid-chat/ingest-keys.ts.
// The schemas of click.json, uzum.json, zai.txt and business.json (every
// missing, malformed or unknown field named, the planned secrets read back by
// the site's own parsers), no value of the inbox in any output, --dry-run
// writing and starting nothing, --apply putting each secret through stdin and
// writing both copies of the runtime config and the requisites, the dark
// rehearsal's test blocks kept, and the guards. Nothing here reaches
// Cloudflare: --apply runs against a copy of the repository files with a fake
// secret store, and the wrangler runner against a fake wrangler.
// Run: node --import tsx --test tests/paid-chat-ingest-keys.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clickCredentials,
  liveReadiness,
  type BillingEnv,
} from "../functions/lib/gpt-chat/billing-config";
import {
  checkoutCredentials,
  merchantCredentials,
  uzumFiscalApiKey,
  type UzumEnv,
} from "../functions/lib/gpt-chat/uzum-config";
import { writeTestCredentials, readTestCredentials } from "../scripts/paid-chat/dark-rehearsal";
import {
  cloudflareEnv,
  examine,
  loadRepo,
  main,
  readInbox,
  sameText,
  SCHEMAS,
  setRuntimeSettings,
  wranglerPagesSecrets,
  type PagesSecrets,
} from "../scripts/paid-chat/ingest-keys";
import { LIVE_SECRETS } from "../scripts/release/live-gate";

const ROOT = path.resolve(import.meta.dirname, "..");
const NOW = Date.parse("2026-10-20T00:00:00Z");
const CLICK = "GPT_CLICK_CREDENTIALS_JSON";
const UZUM = "UZUM_CREDENTIALS_JSON";

function scratch(): { dir: string; done: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gptbot-wp23-test-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A copy of the three repository files the script reads and writes. */
function fixtureRepo(dir: string): string {
  const root = path.join(dir, "repo");
  mkdirSync(path.join(root, "content/global"), { recursive: true });
  for (const file of ["wrangler.toml", "content/global/legal-entity.json", "content/global/site.json"])
    writeFileSync(path.join(root, file), readFileSync(path.join(ROOT, file)));
  return root;
}

const digits = (count: number, first = "8") => first + Array.from(randomBytes(count - 1), (byte) => String(byte % 10)).join("");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

/** A complete inbox of random values: every one of them is a marker that must never be printed. */
function freshKeys() {
  const entity = JSON.parse(readFileSync(path.join(ROOT, "content/global/legal-entity.json"), "utf8"));
  const site = JSON.parse(readFileSync(path.join(ROOT, "content/global/site.json"), "utf8"));
  const click = {
    live: { service_id: digits(9), merchant_id: digits(9), secret_key: `K${hex(16)}`, merchant_user_id: Number(digits(9)) },
    test: { service_id: digits(9), secret_key: `T${hex(16)}` },
  };
  const uzum = {
    api: "checkout",
    checkout: {
      live: { terminalId: randomUUID() as string, apiKey: randomBytes(24).toString("base64url") },
      test: { terminalId: randomUUID() as string, apiKey: randomBytes(24).toString("base64url") },
    },
    merchant: { live: { serviceId: digits(9), login: `m${hex(6)}`, password: hex(20) } },
    fiscal: { live: { apiKey: randomBytes(24).toString("base64url") } },
    baseUrls: { checkoutLive: `https://chk-${hex(4)}.uzumcheckout.uz/` },
    autofiscal: true,
    serviceTitle: "AI paket 300",
    accountField: "account",
  };
  const zai = `${hex(16)}.${hex(8)}`;
  // The seller as in the certificate: upper case and straight quotes, the typeset copy is the page's.
  const business = {
    legalEntity: {
      name: entity.name.ru.toUpperCase().replace(/[«»]/g, '"'),
      shortName: entity.shortName.ru.replace(/[«»]/g, '"'),
      stir: entity.stir,
      legalAddress: entity.address.ru,
      bank: entity.bank,
      account: entity.account,
      mfo: entity.mfo,
      email: site.email,
      phone: site.phone,
      director: entity.director.ru,
      registrationDate: "2023-07-07",
    },
    fiscal: { ikpu: "10305008002000000", packageCode: "1514296", vatPercent: 12, tin: entity.stir, taxRegime: "vat" },
    lawyerApprovedAt: "2026-10-01",
    retentionDays: null,
  };
  return { click, uzum, zai, business, entity };
}
type Keys = ReturnType<typeof freshKeys>;

function writeInbox(dir: string, keys: Partial<Pick<Keys, "click" | "uzum" | "zai" | "business">>): string {
  const inbox = path.join(dir, "inbox");
  mkdirSync(inbox, { recursive: true });
  if (keys.click) writeFileSync(path.join(inbox, "click.json"), JSON.stringify(keys.click, null, 2));
  if (keys.uzum) writeFileSync(path.join(inbox, "uzum.json"), JSON.stringify(keys.uzum, null, 2));
  if (keys.zai) writeFileSync(path.join(inbox, "zai.txt"), `\uFEFF${keys.zai}\r\n`);
  if (keys.business) writeFileSync(path.join(inbox, "business.json"), JSON.stringify(keys.business, null, 2));
  return inbox;
}

/** Every leaf value of the inbox, as text: none may appear in any output. */
function valuesOf(keys: Partial<Keys>): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string" || typeof node === "number") {
      const text = String(node);
      if (text.length >= 6 && !/^(checkout|merchant|account|AI paket 300|10305008002000000|1514296)$/.test(text)) out.push(text);
    } else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk({ click: keys.click, uzum: keys.uzum, zai: keys.zai, account: keys.business?.legalEntity.account });
  return out;
}

function assertNoValue(text: string, values: string[]): void {
  for (const value of values) assert.ok(!text.includes(value), `a value of the inbox was printed: ${value.length > 12 ? "(long)" : value}`);
  assert.doesNotMatch(text, /\d{9,}/, "no id, account or code");
  assert.doesNotMatch(text, /[0-9a-f]{24}/i, "no key");
}

/** A fake Pages secret store: records puts, never touches the network. */
function fakePages(names: string[] = [...LIVE_SECRETS, "ZAI_API_KEY"], failOn: string | null = null) {
  const puts: { name: string; value: string }[] = [];
  let listed = 0;
  const pages: PagesSecrets = {
    async list() {
      listed += 1;
      return new Set(names);
    },
    async put(name, value) {
      if (name === failOn) throw new Error(`wrangler pages secret put ${name} failed (exit 1)`);
      puts.push({ name, value });
    },
  };
  return { pages, puts, listed: () => listed };
}

const bomb = (): PagesSecrets => {
  throw new Error("--dry-run must not reach Cloudflare");
};

async function run(args: string[], deps: Parameters<typeof main>[2] = {}): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await main(args, (line) => lines.push(line), { now: NOW, ...deps });
  return { code, text: lines.join("\n") };
}

test("schemas: a complete inbox passes, and every planned secret is what the site's own parsers read", () => {
  const { dir, done } = scratch();
  try {
    const keys = freshKeys();
    const repo = loadRepo(fixtureRepo(dir));
    const { report, plan } = examine(readInbox(writeInbox(dir, keys)), repo, null, NOW);
    assert.equal(report.issues, 0, JSON.stringify(report.lines.filter((line) => line.blocking)));
    assert.deepEqual(plan.secrets.map((secret) => [secret.name, secret.blocks]), [
      [CLICK, ["live", "test"]],
      [UZUM, ["checkout.live", "checkout.test", "merchant.live", "fiscal.live"]],
      ["ZAI_API_KEY", ["key"]],
    ]);
    const secret = (name: string) => plan.secrets.find((item) => item.name === name)!.value;
    const clickEnv = { [CLICK]: secret(CLICK) } as unknown as BillingEnv;
    assert.deepEqual(clickCredentials(clickEnv, "live"), {
      serviceId: keys.click.live.service_id,
      merchantId: keys.click.live.merchant_id,
      secretKey: keys.click.live.secret_key,
      merchantUserId: String(keys.click.live.merchant_user_id),
    });
    assert.equal(clickCredentials(clickEnv, "test")?.secretKey, keys.click.test.secret_key);
    // The Uzum secret holds the credentials only, in the runtime's format: serviceId a number.
    const uzumEnv = { [UZUM]: secret(UZUM) } as unknown as UzumEnv;
    assert.deepEqual(Object.keys(JSON.parse(secret(UZUM))), ["checkout", "merchant", "fiscal"]);
    assert.deepEqual(checkoutCredentials(uzumEnv, "live"), keys.uzum.checkout.live);
    assert.deepEqual(checkoutCredentials(uzumEnv, "test"), keys.uzum.checkout.test);
    assert.deepEqual(merchantCredentials(uzumEnv, "live"), { ...keys.uzum.merchant.live, serviceId: Number(keys.uzum.merchant.live.serviceId) });
    assert.equal(uzumFiscalApiKey(uzumEnv, "live"), keys.uzum.fiscal.live.apiKey);
    assert.equal(secret("ZAI_API_KEY"), keys.zai, "the BOM and the line break are dropped");
    // Public settings: Uzum's, normalized; the receipt codes already in place.
    assert.deepEqual(plan.settings, {
      UZUM_API: "checkout",
      UZUM_CHECKOUT_BASE_URL: keys.uzum.baseUrls.checkoutLive.replace(/\/$/, ""),
      UZUM_AUTOFISCAL: "true",
    });
    assert.deepEqual(plan.unchanged.sort(), ["GPT_FISCAL_IKPU", "GPT_FISCAL_PACKAGE_CODE", "GPT_FISCAL_TIN", "GPT_FISCAL_VAT_PERCENT"]);
    // The certificate's spelling is the page's, typeset: nothing to change.
    assert.equal(plan.entity, null);
    assert.ok(sameText("ООО \"FREEDOM IS HEAVEN\"", "ООО «Freedom  is heaven»"));
    assert.ok(!sameText("ООО «FREEDOM»", "ООО «FREEDOM IS HEAVEN»"));
  } finally {
    done();
  }
});

test("schemas: a missing, malformed or unknown field is named, never shown, and blocks --apply; the site's parsers agree", () => {
  const { dir, done } = scratch();
  try {
    const repo = loadRepo(fixtureRepo(dir));
    const cases: { name: string; mutate: (keys: Keys) => void; file: string; field: string; status: RegExp }[] = [
      { name: "Click merchant_user_id", mutate: (k) => delete (k.click.live as Partial<typeof k.click.live>).merchant_user_id, file: "click.json", field: "live.merchant_user_id", status: /^missing$/ },
      { name: "Click secret with a space", mutate: (k) => (k.click.live.secret_key = "has a space inside"), file: "click.json", field: "live.secret_key", status: /^invalid \(expected 8-256 printable/ },
      { name: "Click typo", mutate: (k) => Object.assign(k.click.live, { secretKey: "x" }), file: "click.json", field: "live.secretKey", status: /^unknown field/ },
      { name: "Uzum terminal", mutate: (k) => (k.uzum.checkout.live.terminalId = "not-a-uuid"), file: "uzum.json", field: "checkout.live.terminalId", status: /^invalid \(expected a UUID\)$/ },
      { name: "Uzum login with a colon", mutate: (k) => (k.uzum.merchant.live.login = "a:b"), file: "uzum.json", field: "merchant.live.login", status: /^invalid/ },
      { name: "Uzum api", mutate: (k) => (k.uzum.api = "both"), file: "uzum.json", field: "api", status: /^invalid/ },
      { name: "Uzum api without its section", mutate: (k) => { k.uzum.api = "merchant"; delete (k.uzum as Partial<typeof k.uzum>).merchant; }, file: "uzum.json", field: "merchant", status: /^missing \(api is "merchant"\)$/ },
      { name: "Uzum host outside the allowlist", mutate: (k) => (k.uzum.baseUrls.checkoutLive = "https://uzumcheckout.uz.evil.example"), file: "uzum.json", field: "baseUrls.checkoutLive", status: /^invalid/ },
      { name: "Uzum http", mutate: (k) => (k.uzum.baseUrls.checkoutLive = "http://chk.uzumcheckout.uz"), file: "uzum.json", field: "baseUrls.checkoutLive", status: /^invalid/ },
      { name: "Uzum account field", mutate: (k) => (k.uzum.accountField = "code"), file: "uzum.json", field: "accountField", status: /params\.account/ },
      { name: "Uzum autofiscal as text", mutate: (k) => Object.assign(k.uzum, { autofiscal: "true" }), file: "uzum.json", field: "autofiscal", status: /^invalid/ },
      { name: "Z.ai two lines", mutate: (k) => (k.zai = `${k.zai}\nsecond`), file: "zai.txt", field: "key", status: /one line/ },
      { name: "account of 19 digits", mutate: (k) => (k.business.legalEntity.account = digits(19)), file: "business.json", field: "legalEntity.account", status: /20 digits/ },
      { name: "TIN not the STIR", mutate: (k) => (k.business.fiscal.tin = digits(9, "1")), file: "business.json", field: "fiscal.tin", status: /STIR/ },
      { name: "IKPU as a number", mutate: (k) => Object.assign(k.business.fiscal, { ikpu: 10305008002000000 }), file: "business.json", field: "fiscal.ikpu", status: /17 digits, in quotes/ },
      { name: "VAT over 100", mutate: (k) => (k.business.fiscal.vatPercent = 112), file: "business.json", field: "fiscal.vatPercent", status: /0-100/ },
      { name: "a new name in one language", mutate: (k) => (k.business.legalEntity.name = "ООО «Другое имя»"), file: "business.json", field: "legalEntity.name", status: /give it as \{"ru"/ },
      { name: "a lawyer's day to come", mutate: (k) => (k.business.lawyerApprovedAt = "2027-01-01"), file: "business.json", field: "lawyerApprovedAt", status: /has not come/ },
      { name: "a retention outside the clamp", mutate: (k) => Object.assign(k.business, { retentionDays: 3 }), file: "business.json", field: "retentionDays", status: /7-3650/ },
      { name: "unknown top-level field", mutate: (k) => Object.assign(k.business, { lawyer: "x" }), file: "business.json", field: "lawyer", status: /^unknown field/ },
    ];
    for (const item of cases) {
      const keys = freshKeys();
      item.mutate(keys);
      const sub = path.join(dir, item.name.replace(/\W+/g, "-"));
      const { report, plan } = examine(readInbox(writeInbox(sub, keys)), repo, null, NOW);
      // The field's issue: a line that blocks --apply (an "ok" for its format may precede it).
      const line = report.lines.find((entry) => entry.file === item.file && entry.field === item.field && entry.blocking);
      assert.ok(line, `${item.name}: ${item.file} ${item.field} is reported as an issue`);
      assert.match(line.status, item.status, item.name);
      // A file with an issue plans nothing: no half secret, no setting of it.
      if (item.file === "click.json") assert.ok(!plan.secrets.some((secret) => secret.name === CLICK), item.name);
      if (item.file === "uzum.json") assert.ok(!plan.secrets.some((secret) => secret.name === UZUM) && !("UZUM_API" in plan.settings), item.name);
      assertNoValue(JSON.stringify(report.lines), valuesOf(keys));
    }

    // Each Click field the schema rejects, the site rejects too (liveReadiness names it).
    for (const field of Object.keys(SCHEMAS.clickLive)) {
      const keys = freshKeys();
      const named = () =>
        liveReadiness({ [CLICK]: JSON.stringify(keys.click), GPT_BILLING_MODE_CLICK: "live" } as unknown as BillingEnv, "click")
          .filter((name) => name.startsWith(CLICK));
      assert.deepEqual(named(), [], "the untouched block is complete");
      (keys.click.live as Record<string, unknown>)[field] = field === "secret_key" ? "short" : "0123";
      assert.equal(SCHEMAS.clickLive[field as keyof typeof SCHEMAS.clickLive].parse((keys.click.live as Record<string, unknown>)[field]), null, field);
      assert.deepEqual(named(), [`${CLICK}.live.${field}`], field);
    }
    // And each Uzum credential field.
    for (const [section, field, bad] of [["checkout", "terminalId", "x"], ["checkout", "apiKey", "short"], ["merchant", "serviceId", -1], ["merchant", "login", "a:b"], ["merchant", "password", "short"], ["fiscal", "apiKey", "bad key!"]] as const) {
      const rules = { checkout: SCHEMAS.uzumCheckout, merchant: SCHEMAS.uzumMerchant, fiscal: SCHEMAS.uzumFiscal }[section] as Record<string, { parse: (value: unknown) => unknown }>;
      assert.equal(rules[field].parse(bad), null, `${section}.${field}`);
      const keys = freshKeys();
      const block = (keys.uzum[section] as Record<string, Record<string, unknown>>).live;
      if (section === "merchant") block.serviceId = Number(block.serviceId);
      const read = () => {
        const env = { [UZUM]: JSON.stringify(keys.uzum) } as unknown as UzumEnv;
        return section === "checkout" ? checkoutCredentials(env, "live") : section === "merchant" ? merchantCredentials(env, "live") : uzumFiscalApiKey(env, "live");
      };
      assert.notEqual(read(), null, `${section}: the untouched block is read`);
      block[field] = bad;
      assert.equal(read(), null, `${section}.${field}`);
    }

    // A file that is not JSON: the parser's message (it quotes the input) is never shown.
    const marker = `MARKER${hex(8)}`;
    const broken = path.join(dir, "broken", "inbox");
    mkdirSync(broken, { recursive: true });
    writeFileSync(path.join(broken, "click.json"), `{"live": ${marker}`);
    writeFileSync(path.join(broken, "uzum.json.txt"), "{}");
    const { report } = examine(readInbox(broken), repo, null, NOW);
    assert.deepEqual(report.lines.filter((line) => line.blocking).map((line) => [line.file, line.status]), [
      ["uzum.json.txt", "rename it to uzum.json (Windows hides the .txt extension)"],
      ["click.json", "not valid JSON"],
    ]);
    assert.ok(!JSON.stringify(report.lines).includes(marker));
  } finally {
    done();
  }
});

test("--dry-run prints names only, writes nothing, starts nothing and reads no Cloudflare credential", async () => {
  const { dir, done } = scratch();
  try {
    const keys = freshKeys();
    // A change of requisites as the owner would send it: both languages.
    keys.business.legalEntity.account = digits(20, "2");
    (keys.business.legalEntity as Record<string, unknown>).name = { ru: `ООО «Marker ${hex(3)}»`, uz: `«Marker ${hex(3)}» MChJ` };
    const root = fixtureRepo(dir);
    const inbox = writeInbox(dir, keys);
    const snapshot = () =>
      ["wrangler.toml", "content/global/legal-entity.json"].map((file) => readFileSync(path.join(root, file), "utf8"))
        .concat(["click.json", "uzum.json", "zai.txt", "business.json"].map((file) => readFileSync(path.join(inbox, file), "utf8")));
    const before = snapshot();
    const realBefore = readFileSync(path.join(ROOT, "wrangler.toml"), "utf8") + readFileSync(path.join(ROOT, "content/global/legal-entity.json"), "utf8");

    const { code, text } = await run(["--inbox", inbox, "--dry-run"], { root, pagesSecrets: bomb });
    assert.equal(code, 0, text);
    assert.deepEqual(snapshot(), before, "the repository copy and the inbox are untouched");
    assert.match(text, /UZUM_API, UZUM_CHECKOUT_BASE_URL, UZUM_AUTOFISCAL will change/);
    assert.match(text, /content\/global\/legal-entity\.json: name, account will change \(and _source\)/);
    assert.match(text, /GPT_CLICK_CREDENTIALS_JSON \(live, test\); UZUM_CREDENTIALS_JSON .*; ZAI_API_KEY \(key\) would be put/);
    assert.match(text, /live\.secret_key: ok/);
    assert.match(text, /click: nothing missing for live/);
    assert.match(text, /uzum: nothing missing for live/);
    assert.match(text, /unconfirmed \(Pages secrets outside the inbox; --apply reads their names\): .*GPT_IDENTITY_SECRET/);
    assert.match(text, /--dry-run: nothing was written and nothing was sent; 0 issue\(s\)\./);
    assertNoValue(text.replaceAll(inbox.replace(/\\/g, "/"), "<inbox>"), [...valuesOf(keys), "Marker"]);

    // The default root is this checkout: it stays as it was too.
    assert.equal((await run(["--inbox", inbox, "--dry-run"], { pagesSecrets: bomb })).code, 0);
    assert.equal(readFileSync(path.join(ROOT, "wrangler.toml"), "utf8") + readFileSync(path.join(ROOT, "content/global/legal-entity.json"), "utf8"), realBefore);

    // An issue makes the exit code 1; a Cloudflare credential is refused outright.
    keys.click.live.secret_key = "bad key";
    const failing = await run(["--inbox", writeInbox(path.join(dir, "bad"), keys), "--dry-run"], { root, pagesSecrets: bomb });
    assert.equal(failing.code, 1);
    assert.match(failing.text, /1 issue\(s\)/);
    const refused = await run(["--inbox", inbox, "--dry-run", "--cloudflare-env", path.join(dir, "x.env")], { root, pagesSecrets: bomb });
    assert.equal(refused.code, 1);
    assert.match(refused.text, /--cloudflare-env is for --apply only/);
  } finally {
    done();
  }
});

test("--apply puts each secret, writes both copies of the runtime config and the requisites, and reminds the owner", async () => {
  const { dir, done } = scratch();
  try {
    const keys = freshKeys();
    keys.business.legalEntity.account = digits(20, "2");
    keys.business.legalEntity.bank = `Marker Bank ${hex(3)}`;
    const root = fixtureRepo(dir);
    const inbox = writeInbox(dir, keys);
    const inboxBefore = ["click.json", "uzum.json", "zai.txt", "business.json"].map((file) => readFileSync(path.join(inbox, file), "utf8"));
    const entityBefore = JSON.parse(readFileSync(path.join(root, "content/global/legal-entity.json"), "utf8"));
    const tomlBefore = readFileSync(path.join(root, "wrangler.toml"), "utf8");
    const plan = examine(readInbox(inbox), loadRepo(root), null, NOW).plan;
    const fake = fakePages();

    const { code, text } = await run(["--inbox", inbox, "--apply"], { root, pagesSecrets: () => fake.pages });
    assert.equal(code, 0, text);
    assert.equal(fake.listed(), 1);
    assert.deepEqual(fake.puts, plan.secrets.map(({ name, value }) => ({ name, value })));

    // Both copies of the runtime config carry the new values, and nothing else moved.
    const repo = loadRepo(root);
    assert.equal(repo.config.UZUM_API, "checkout");
    assert.equal(repo.config.UZUM_AUTOFISCAL, "true");
    assert.equal(repo.config.UZUM_CHECKOUT_BASE_URL, keys.uzum.baseUrls.checkoutLive.replace(/\/$/, ""));
    assert.deepEqual(repo.table, repo.config, "the packed JSON and the nested table agree");
    const changedLines = repo.toml.split("\n").filter((line, index) => line !== tomlBefore.split("\n")[index]);
    assert.equal(changedLines.length, 4, "the packed line and three table lines");
    for (const secret of [CLICK, UZUM, "ZAI_API_KEY"]) assert.ok(!repo.toml.includes(secret + " ="), secret);

    // The requisites: the changed fields, the typeset names kept, the source recorded.
    const entity = JSON.parse(readFileSync(path.join(root, "content/global/legal-entity.json"), "utf8"));
    assert.equal(entity.account, keys.business.legalEntity.account);
    assert.equal(entity.bank, keys.business.legalEntity.bank);
    assert.deepEqual(entity.name, entityBefore.name);
    assert.ok(entity._source.startsWith(entityBefore._source));
    assert.match(entity._source, /Updated on 2026-10-20 by scripts\/paid-chat\/ingest-keys\.ts from the owner's .*business\.json \(outside Git\): account, bank\.$/);
    assert.equal(readFileSync(path.join(root, "content/global/legal-entity.json"), "utf8"), `${JSON.stringify(entity, null, 2)}\n`);

    // The inbox is read, never touched; the owner is told what to delete.
    assert.deepEqual(["click.json", "uzum.json", "zai.txt", "business.json"].map((file) => readFileSync(path.join(inbox, file), "utf8")), inboxBefore);
    assert.match(text, /Owner: delete click\.json, uzum\.json, zai\.txt from /);
    assert.match(text, /business\.json holds no secret/);
    assert.match(text, /put GPT_CLICK_CREDENTIALS_JSON \(live, test\): values not shown/);
    assert.match(text, /click: nothing missing for live/);
    assert.match(text, /Z\.ai: answers first/);
    assert.doesNotMatch(text, /unconfirmed/, "the names Pages holds are known");
    assertNoValue(text.replaceAll(inbox.replace(/\\/g, "/"), "<inbox>"), [...valuesOf(keys), keys.business.legalEntity.bank]);

    // A second run finds everything in place except the secrets, which a put replaces.
    const again = fakePages();
    assert.equal((await run(["--inbox", inbox, "--apply"], { root, pagesSecrets: () => again.pages })).code, 0);
    assert.deepEqual(again.puts.map((put) => put.name), [CLICK, UZUM, "ZAI_API_KEY"]);
    assert.equal(loadRepo(root).toml, repo.toml);
  } finally {
    done();
  }
});

test("--apply refuses on any issue and stops before the repository files when a put fails", async () => {
  const { dir, done } = scratch();
  try {
    const root = fixtureRepo(dir);
    const before = readFileSync(path.join(root, "wrangler.toml"), "utf8") + readFileSync(path.join(root, "content/global/legal-entity.json"), "utf8");
    const files = () => readFileSync(path.join(root, "wrangler.toml"), "utf8") + readFileSync(path.join(root, "content/global/legal-entity.json"), "utf8");

    const bad = freshKeys();
    bad.uzum.checkout.live.terminalId = "x";
    const refused = fakePages();
    const first = await run(["--inbox", writeInbox(path.join(dir, "bad"), bad), "--apply"], { root, pagesSecrets: () => refused.pages });
    assert.equal(first.code, 1);
    assert.match(first.text, /refusing --apply: 1 issue\(s\) above\. Nothing was written and nothing was sent\./);
    assert.equal(refused.listed(), 0);
    assert.equal(files(), before);

    const keys = freshKeys();
    keys.business.legalEntity.account = digits(20, "2");
    const failing = fakePages(undefined, UZUM);
    const second = await run(["--inbox", writeInbox(path.join(dir, "good"), keys), "--apply"], { root, pagesSecrets: () => failing.pages });
    assert.equal(second.code, 1);
    assert.deepEqual(failing.puts.map((put) => put.name), [CLICK]);
    assert.match(second.text, /stopped: put GPT_CLICK_CREDENTIALS_JSON; not put: UZUM_CREDENTIALS_JSON, ZAI_API_KEY\. The repository files were not written\./);
    assert.equal(files(), before);

    // Nothing new in the inbox: nothing to apply, Cloudflare not asked.
    const idle = fakePages();
    const same = freshKeys();
    const third = await run(["--inbox", writeInbox(path.join(dir, "same"), { business: same.business }), "--apply"], { root, pagesSecrets: () => idle.pages });
    assert.equal(third.code, 0);
    assert.match(third.text, /nothing to apply/);
    assert.equal(idle.listed(), 0);
  } finally {
    done();
  }
});

test("--test-credentials keeps the dark rehearsal's test blocks beside the owner's, and the owner's own test block wins", async () => {
  const { dir, done } = scratch();
  try {
    const generated = path.join(dir, "dark-rehearsal");
    writeTestCredentials(generated);
    const rehearsal = readTestCredentials(generated);
    const root = fixtureRepo(dir);
    const keys = freshKeys();
    delete (keys.click as Partial<typeof keys.click>).test;
    const fake = fakePages([...LIVE_SECRETS, CLICK, UZUM]);
    const { code, text } = await run(["--inbox", writeInbox(dir, { click: keys.click, uzum: keys.uzum }), "--apply", "--test-credentials", generated], { root, pagesSecrets: () => fake.pages });
    assert.equal(code, 0, text);
    const put = (name: string) => fake.puts.find((item) => item.name === name)!.value;
    const clickEnv = { [CLICK]: put(CLICK) } as unknown as BillingEnv;
    assert.equal(clickCredentials(clickEnv, "live")?.secretKey, keys.click.live.secret_key);
    assert.deepEqual(clickCredentials(clickEnv, "test"), rehearsal.click);
    assert.deepEqual(merchantCredentials({ [UZUM]: put(UZUM) } as unknown as UzumEnv, "test"), rehearsal.uzum);
    assert.match(text, /put GPT_CLICK_CREDENTIALS_JSON \(live, test \(dark rehearsal\)\)/);
    assert.match(text, /merchant\.test \(dark rehearsal\)/);
    assert.doesNotMatch(text, /replaced without a test block/);
    assertNoValue(text.replaceAll(dir.replace(/\\/g, "/"), "<dir>"), [rehearsal.click!.secretKey, rehearsal.uzum!.password, rehearsal.uzum!.login]);

    // The owner's test block wins over the generated one.
    const owner = freshKeys();
    const examined = examine(readInbox(writeInbox(path.join(dir, "owner"), { click: owner.click })), loadRepo(root), {
      click: { service_id: "900000001", secret_key: "g".repeat(40) },
      uzumMerchant: null,
    }, NOW);
    assert.equal(clickCredentials({ [CLICK]: examined.plan.secrets[0].value } as unknown as BillingEnv, "test")?.secretKey, owner.click.test.secret_key);

    // Without it, replacing an existing secret says that its test block goes.
    const plain = fakePages([...LIVE_SECRETS, CLICK]);
    const noted = await run(["--inbox", writeInbox(path.join(dir, "plain"), { click: keys.click }), "--apply"], { root, pagesSecrets: () => plain.pages });
    assert.match(noted.text, /note: GPT_CLICK_CREDENTIALS_JSON exists in Pages and is replaced without a test block/);
  } finally {
    done();
  }
});

test("guards: the inbox and the test credentials stay outside the repository; usage", async () => {
  const { dir, done } = scratch();
  try {
    const root = fixtureRepo(dir);
    const inside = path.join(root, "keys");
    mkdirSync(inside);
    for (const args of [["--inbox", inside, "--dry-run"], ["--inbox", dir, "--dry-run", "--test-credentials", inside]]) {
      const result = await run(args, { root, pagesSecrets: bomb });
      assert.equal(result.code, 1);
      assert.match(result.text, /inside the repository/);
    }
    for (const args of [[], ["--inbox", dir], ["--inbox", dir, "--dry-run", "--apply"], ["--dry-run"]]) {
      const result = await run(args, { root, pagesSecrets: bomb });
      assert.equal(result.code, 1);
      assert.match(result.text, /usage: ingest-keys\.ts/);
    }
    assert.match((await run(["--inbox", path.join(dir, "absent"), "--dry-run"], { root })).text, /the inbox folder does not exist/);
  } finally {
    done();
  }
});

test("wrangler runner: the value goes through stdin only, the token reaches wrangler alone, a failure is redacted", async () => {
  const { dir, done } = scratch();
  try {
    // A fake wrangler: records its arguments and stdin, answers list, fails on demand by echoing everything.
    const bin = path.join(dir, "wrangler.mjs");
    writeFileSync(bin, `
import { writeFileSync } from "node:fs";
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  writeFileSync(${JSON.stringify(path.join(dir, "call.json"))}, JSON.stringify({ args, input, token: process.env.CLOUDFLARE_API_TOKEN === "tok" + "en-${"x".repeat(8)}" }));
  if (args[2] === "list") { console.log('The "production" environment has access to the following secrets:\\n  - GPT_HASH_SALT: Value Encrypted\\n  - ZAI_API_KEY: Value Encrypted'); return; }
  if (input.includes("FAIL")) { console.error("echo " + input + " " + process.env.CLOUDFLARE_API_TOKEN + "\\nboom"); process.exit(1); }
  console.log("Success! Uploaded secret " + args[3]);
});
`);
    const envFile = path.join(dir, "cf.env");
    writeFileSync(envFile, `\uFEFFCLOUDFLARE_ACCOUNT_ID="acc${"1".repeat(6)}"\nOTHER=1\nCLOUDFLARE_API_TOKEN=token-${"x".repeat(8)}\n`);
    const credentials = cloudflareEnv(envFile);
    assert.deepEqual(Object.keys(credentials).sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
    writeFileSync(path.join(dir, "empty.env"), "CLOUDFLARE_ACCOUNT_ID=1\n");
    assert.throws(() => cloudflareEnv(path.join(dir, "empty.env")), /no CLOUDFLARE_API_TOKEN/);

    const pages = wranglerPagesSecrets({ root: dir, credentials, wranglerBin: bin, timeoutMs: 30_000 });
    assert.deepEqual([...(await pages.list())], ["GPT_HASH_SALT", "ZAI_API_KEY"]);
    const value = JSON.stringify({ live: { secret_key: `V${hex(16)}` } });
    await pages.put("GPT_CLICK_CREDENTIALS_JSON", value);
    const call = JSON.parse(readFileSync(path.join(dir, "call.json"), "utf8"));
    assert.deepEqual(call.args, ["pages", "secret", "put", "GPT_CLICK_CREDENTIALS_JSON", "--project-name", "ai-direct-pro-landing"]);
    assert.equal(call.input, value, "the value arrives on stdin");
    assert.equal(call.token, true, "the token from the env file reaches wrangler");

    const failing = JSON.stringify({ live: { secret_key: `FAIL${hex(16)}` } });
    await assert.rejects(pages.put("GPT_CLICK_CREDENTIALS_JSON", failing), (error: Error) => {
      assert.match(error.message, /^wrangler pages secret put failed \(exit 1\): /);
      assert.match(error.message, /<redacted>/);
      assert.ok(!error.message.includes("FAIL") && !error.message.includes("token-"), "neither the value nor the token");
      return true;
    });
  } finally {
    done();
  }
});

test("setRuntimeSettings writes both copies or nothing", () => {
  const toml = readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
  const written = setRuntimeSettings(toml, { UZUM_API: "merchant" });
  assert.equal(written.split("\n").filter((line, index) => line !== toml.split("\n")[index]).length, 2);
  assert.match(written, /^UZUM_API = "merchant"$/m);
  assert.match(written, /"UZUM_API":"merchant"/);
  assert.throws(() => setRuntimeSettings(toml, { UZUM_NEW_SETTING: "x" }), /add it by hand first/);
  assert.throws(() => setRuntimeSettings(toml, { UZUM_API: "it's" }), /cannot be written/);
  assert.throws(() => setRuntimeSettings(toml, { UZUM_API: 'a"b' }), /cannot be written/);
});
