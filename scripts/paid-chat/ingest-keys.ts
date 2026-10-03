// Intake of the owner's keys for the paid AI chat (paid-chat plan WP-23 and
// §7; decisions L9, L10, L13). Runbook: docs/paid-chat/ONBOARDING-KEYS-RU.md.
//
// The owner puts up to four files into a folder OUTSIDE the repository
// (F:/Claude/gptbot-keys-inbox): click.json, uzum.json and zai.txt hold
// secrets; business.json holds the seller's requisites and the receipt codes,
// which are public. This script checks each file against a fixed schema and
// turns the inbox into what production reads:
//   - the Pages secrets GPT_CLICK_CREDENTIALS_JSON, UZUM_CREDENTIALS_JSON and
//     ZAI_API_KEY (one secret per provider, L9), put through wrangler's stdin;
//   - the public settings GPT_FISCAL_*, UZUM_API, UZUM_*_BASE_URL and
//     UZUM_AUTOFISCAL, in both copies of wrangler.toml's runtime config (the
//     packed JSON and the nested table, tests/runtime-config.test.ts);
//   - the seller's requisites in content/global/legal-entity.json, the one
//     source the offer and the policies render (scripts/legal-entity.ts).
//
//   node --import tsx scripts/paid-chat/ingest-keys.ts --inbox <dir> --dry-run
//       [--test-credentials <dir>]
//     Checks every file and prints field names with ok/missing, the plan and
//     what liveReadiness() would still name per provider. Writes nothing,
//     starts no process and reads no Cloudflare credential.
//   node --import tsx scripts/paid-chat/ingest-keys.ts --inbox <dir> --apply
//       [--cloudflare-env F:/Claude/.env] [--test-credentials <dir>]
//     Refuses while the check reports an issue. Then reads the NAMES of the
//     Pages secrets, puts each secret through stdin, writes the two repository
//     files and prints liveReadiness() per provider against what production
//     now holds. The secrets take effect with the next deploy.
//
// --test-credentials is the dark rehearsal's folder (scripts/paid-chat/
// dark-rehearsal.ts credentials): its Click "test" and Uzum "merchant.test"
// blocks go into the new secrets wherever the owner's files have none, so
// putting the owner's keys does not drop them (docs/paid-chat/DARK-REHEARSAL-RU.md).
//
// Never printed: a value from the inbox, a secret, a Cloudflare credential, a
// JSON parser message (it quotes the input). Only field and setting names,
// ok/missing and counts. The inbox is read, never written or deleted: the
// owner deletes the secret files, and the script says when.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aiChatReadiness } from "../../functions/lib/gpt-chat/admin-readiness";
import {
  clickCredentials,
  liveReadiness,
  paymentProviders,
  providerConfigured,
  type BillingEnv,
  type LocalProvider,
} from "../../functions/lib/gpt-chat/billing-config";
import { fiscalIssues } from "../../functions/lib/gpt-chat/fiscal-config";
import {
  checkoutCredentials,
  isUuid,
  merchantCredentials,
  uzumBaseUrl,
  uzumFiscalApiKey,
  uzumFiscalBaseUrl,
  type UzumEnv,
} from "../../functions/lib/gpt-chat/uzum-config";
import { legalEntityIssues } from "../legal-entity";
import { committedRuntimeConfig, LIVE_SECRETS, standIns } from "../release/live-gate";
import { CLICK_SECRET, readTestCredentials, UZUM_SECRET } from "./dark-rehearsal";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PAGES_PROJECT = "ai-direct-pro-landing";
export const ZAI_SECRET = "ZAI_API_KEY";
export const INBOX_FILES = ["click.json", "uzum.json", "zai.txt", "business.json"] as const;
const SECRET_FILES = ["click.json", "uzum.json", "zai.txt"] as const;
const ENTITY_FILE = "content/global/legal-entity.json";
const SITE_FILE = "content/global/site.json";
/** The runtime parsers' limits on the two JSON secrets (billing-config.ts, uzum-config.ts). */
const MAX_SECRET_LENGTH = { [CLICK_SECRET]: 4096, [UZUM_SECRET]: 8192 } as const;
const MODE_SETTING: Record<LocalProvider, string> = {
  click: "GPT_BILLING_MODE_CLICK",
  uzum: "GPT_BILLING_MODE_UZUM",
  payme: "GPT_BILLING_MODE",
};
const WRANGLER_TIMEOUT_MS = 120_000;

// ── report ──────────────────────────────────────────────────────────────────

export interface ReportLine {
  file: string;
  field: string;
  /** ok / missing / invalid (expected …) / a note; never a value. */
  status: string;
  /** An issue: --apply refuses while any is left. */
  blocking: boolean;
}

export class Report {
  readonly lines: ReportLine[] = [];
  /** A field that passed; `status` may add where it goes. */
  ok(file: string, field: string, status = "ok"): void {
    this.note(file, field, status);
  }
  /** Information that does not block --apply. */
  note(file: string, field: string, status: string): void {
    this.lines.push({ file, field, status, blocking: false });
  }
  issue(file: string, field: string, status: string): void {
    this.lines.push({ file, field, status, blocking: true });
  }
  issuesOf(file: string): number {
    return this.lines.filter((line) => line.file === file && line.blocking).length;
  }
  get issues(): number {
    return this.lines.filter((line) => line.blocking).length;
  }
}

// ── field rules (the schemas) ───────────────────────────────────────────────

/** A field of an inbox file: how a valid value looks and its normal form; null = malformed. */
export interface FieldRule {
  required: boolean;
  /** What a valid value looks like, for the report: never the value. */
  shape: string;
  parse(value: unknown): unknown;
}

const required = (shape: string, parse: (value: unknown) => unknown): FieldRule => ({ required: true, shape, parse });
const optional = (shape: string, parse: (value: unknown) => unknown): FieldRule => ({ required: false, shape, parse });

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function matching(pattern: RegExp): (value: unknown) => string | null {
  return (value) => (typeof value === "string" && pattern.test(value) ? value : null);
}

/** Printable one-line text without markup, as the requisites block accepts (scripts/legal-entity.ts). */
export function plainText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/[<>\n\r]/.test(value)
    ? value
    : null;
}

/** Click ids: digits, as a string or a safe integer (billing-config.ts clickId). */
function clickId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && /^[1-9]\d{0,11}$/.test(text) ? text : null;
}

/** Uzum's serviceId: the runtime reads a number, so a digit string becomes one. */
function serviceId(value: unknown): number | null {
  const number = typeof value === "string" && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : null;
}

function digitsOrInteger(pattern: RegExp): (value: unknown) => string | null {
  return (value) => {
    const text = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
    return typeof text === "string" && pattern.test(text) ? text : null;
  };
}

function calendarDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value ? value : null;
}

const CLICK_ID_SHAPE = "digits, at most 12";
const CLICK_SECRET_SHAPE = "8-256 printable ASCII characters";
const UZUM_KEY_SHAPE = "16-256 characters: letters, digits, . _ ~ + / = -";
const clickSecretKey = matching(/^[\x21-\x7e]{8,256}$/);
const uzumKey = matching(/^[A-Za-z0-9._~+/=-]{16,256}$/);

/** A base URL the runtime accepts for one setting, in its normal form (no trailing slash). */
function baseUrl(read: (value: string) => string | null): (value: unknown) => string | null {
  return (value) => (typeof value === "string" ? read(value) : null);
}

export const SCHEMAS = {
  clickLive: {
    service_id: required(CLICK_ID_SHAPE, clickId),
    merchant_id: required(CLICK_ID_SHAPE, clickId),
    secret_key: required(CLICK_SECRET_SHAPE, clickSecretKey),
    merchant_user_id: required(CLICK_ID_SHAPE, clickId),
  },
  clickTest: {
    service_id: required(CLICK_ID_SHAPE, clickId),
    merchant_id: optional(CLICK_ID_SHAPE, clickId),
    secret_key: required(CLICK_SECRET_SHAPE, clickSecretKey),
    merchant_user_id: optional(CLICK_ID_SHAPE, clickId),
  },
  uzumCheckout: {
    terminalId: required("a UUID", (value) => (isUuid(value) ? value : null)),
    apiKey: required(UZUM_KEY_SHAPE, uzumKey),
  },
  uzumMerchant: {
    serviceId: required("a positive whole number", serviceId),
    login: required("1-128 printable ASCII characters without ':'", matching(/^[\x21-\x39\x3b-\x7e]{1,128}$/)),
    password: required("8-256 printable ASCII characters", matching(/^[\x21-\x7e]{8,256}$/)),
  },
  uzumFiscal: {
    apiKey: required(UZUM_KEY_SHAPE, uzumKey),
  },
  uzumBaseUrls: {
    checkoutLive: optional("https on uzumbank.uz, uzumcheckout.uz or uzum.uz, no query",
      baseUrl((value) => uzumBaseUrl({ UZUM_CHECKOUT_BASE_URL: value } as UzumEnv, "live"))),
    checkoutTest: optional("https on uzumbank.uz, uzumcheckout.uz or uzum.uz, no query",
      baseUrl((value) => uzumBaseUrl({ UZUM_CHECKOUT_TEST_BASE_URL: value } as UzumEnv, "test"))),
    fiscalLive: optional("https on inplat-tech.com, ipt-merch.com or an Uzum domain, no query",
      baseUrl((value) => uzumFiscalBaseUrl({ UZUM_FISCAL_BASE_URL: value } as UzumEnv, "live"))),
    fiscalTest: optional("https on inplat-tech.com, ipt-merch.com or an Uzum domain, no query",
      baseUrl((value) => uzumFiscalBaseUrl({ UZUM_FISCAL_TEST_BASE_URL: value } as UzumEnv, "test"))),
  },
  businessFiscal: {
    ikpu: required("17 digits, in quotes", matching(/^\d{17}$/)),
    packageCode: required("the package code: letters or digits, at most 20", digitsOrInteger(/^[A-Za-z0-9]{1,20}$/)),
    vatPercent: required("a whole number 0-100", (value) => {
      const text = digitsOrInteger(/^\d{1,3}$/)(value);
      return text !== null && Number(text) <= 100 ? String(Number(text)) : null;
    }),
    tin: required("9 digits (or a 14-digit PINFL)", digitsOrInteger(/^(?:\d{9}|\d{14})$/)),
    taxRegime: optional("text", plainText),
    ikpuName: optional("text", plainText),
    ikpuVerified: optional("text", plainText),
    packageName: optional("text", plainText),
  },
} satisfies Record<string, Record<string, FieldRule>>;

/** Uzum's Fiscalization and Checkout hosts per base-URL field, as settings. */
const BASE_URL_SETTING = {
  checkoutLive: "UZUM_CHECKOUT_BASE_URL",
  checkoutTest: "UZUM_CHECKOUT_TEST_BASE_URL",
  fiscalLive: "UZUM_FISCAL_BASE_URL",
  fiscalTest: "UZUM_FISCAL_TEST_BASE_URL",
} as const;
const FISCAL_SETTING = {
  ikpu: "GPT_FISCAL_IKPU",
  packageCode: "GPT_FISCAL_PACKAGE_CODE",
  vatPercent: "GPT_FISCAL_VAT_PERCENT",
  tin: "GPT_FISCAL_TIN",
} as const;
/** The product name may not name GPT, Plus, Pro, obuna or a subscription (decision L16). */
const PRODUCT_NAME_FORBIDDEN = /gpt|chatgpt|plus|\bpro\b|obuna|подписк/i;
const ZAI_KEY = /^[A-Za-z0-9._~+/=-]{20,256}$/;

/** A field name from the owner's file is printed only when it looks like one. */
function fieldName(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key) && !/\d{4}/.test(key) ? key : "<a field whose name is not shown>";
}

const at = (prefix: string, key: string) => (prefix ? `${prefix}.${key}` : key);

/**
 * The fields of one object by `rules`: each reported, unknown keys reported
 * as issues (a typo would otherwise drop a value silently). Returns the
 * normalized object, or null when anything is missing, malformed or unknown.
 */
function fields(
  report: Report,
  file: string,
  prefix: string,
  raw: unknown,
  rules: Record<string, FieldRule>,
): Record<string, unknown> | null {
  const object = record(raw);
  if (!object) {
    report.issue(file, prefix || "(file)", "invalid (expected a JSON object)");
    return null;
  }
  const out: Record<string, unknown> = {};
  let complete = true;
  for (const [key, rule] of Object.entries(rules)) {
    const value = object[key];
    if (value === undefined || value === null || value === "") {
      if (rule.required) {
        report.issue(file, at(prefix, key), "missing");
        complete = false;
      } else {
        report.note(file, at(prefix, key), "absent (optional)");
      }
      continue;
    }
    const parsed = rule.parse(value);
    if (parsed === null) {
      report.issue(file, at(prefix, key), `invalid (expected ${rule.shape})`);
      complete = false;
    } else {
      out[key] = parsed;
      report.ok(file, at(prefix, key));
    }
  }
  for (const key of Object.keys(object)) {
    if (!Object.hasOwn(rules, key)) {
      report.issue(file, at(prefix, fieldName(key)), "unknown field (a typo?)");
      complete = false;
    }
  }
  return complete ? out : null;
}

/** Keys of `object` (at `prefix`) outside `known` are issues; a top-level "_comment" is allowed. */
function unknownKeys(
  report: Report,
  file: string,
  prefix: string,
  object: Record<string, unknown>,
  known: readonly string[],
): void {
  for (const key of Object.keys(object)) {
    if (known.includes(key) || (!prefix && key.startsWith("_"))) continue;
    report.issue(file, at(prefix, fieldName(key)), "unknown field (a typo?)");
  }
}

// ── the inbox ───────────────────────────────────────────────────────────────

export interface Inbox {
  dir: string;
  /** The parsed JSON of each present JSON file, or the error kind (never the parser's message). */
  json: Partial<Record<"click.json" | "uzum.json" | "business.json", { value: unknown } | { error: string }>>;
  zai: string | null;
  present: string[];
  /** Files named like an inbox file plus ".txt" (Windows hides the extension). */
  misnamed: string[];
  others: number;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative));
}

/** Text of a file the owner may have saved with a BOM (Notepad). */
function ownerText(file: string): string {
  return readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

export function readInbox(dir: string): Inbox {
  const names = readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isFile());
  const inbox: Inbox = { dir, json: {}, zai: null, present: [], misnamed: [], others: 0 };
  for (const name of names) {
    // Windows matches names case-insensitively: Click.json is read as click.json.
    if ((INBOX_FILES as readonly string[]).includes(name.toLowerCase())) continue;
    const intended = INBOX_FILES.find((file) => name.toLowerCase() === `${file}.txt`);
    if (intended) inbox.misnamed.push(intended);
    else inbox.others += 1;
  }
  for (const name of INBOX_FILES) {
    const file = path.join(dir, name);
    if (!existsSync(file)) continue;
    inbox.present.push(name);
    if (name === "zai.txt") {
      inbox.zai = ownerText(file);
      continue;
    }
    try {
      inbox.json[name] = { value: JSON.parse(ownerText(file)) };
    } catch {
      // The parser's message quotes the input: it is never shown.
      inbox.json[name] = { error: "not valid JSON" };
    }
  }
  return inbox;
}

// ── the repository ──────────────────────────────────────────────────────────

export interface Repo {
  root: string;
  toml: string;
  /** The packed runtime config (GPTBOT_RUNTIME_CONFIG_JSON). */
  config: Record<string, string>;
  /** The nested table [vars.GPTBOT_RUNTIME_CONFIG]. */
  table: Record<string, string>;
  entity: Record<string, unknown>;
  contact: { email: string; phone: string };
  d1Bound: boolean;
}

const TABLE_MARKER = "[vars.GPTBOT_RUNTIME_CONFIG]";
const PACKED = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u;

function nestedTable(toml: string): Record<string, string> {
  const start = toml.indexOf(TABLE_MARKER);
  if (start < 0) throw new Error(`wrangler.toml has no ${TABLE_MARKER}`);
  const section = toml.slice(start + TABLE_MARKER.length);
  return Object.fromEntries(
    [...section.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*$/gmu)].map((match) => [match[1], match[2]]),
  );
}

export function loadRepo(root: string): Repo {
  const toml = readFileSync(path.join(root, "wrangler.toml"), "utf8");
  const site = JSON.parse(readFileSync(path.join(root, SITE_FILE), "utf8")) as { email?: string; phone?: string };
  return {
    root,
    toml,
    config: committedRuntimeConfig(toml),
    table: nestedTable(toml),
    entity: JSON.parse(readFileSync(path.join(root, ENTITY_FILE), "utf8")) as Record<string, unknown>,
    contact: { email: (site.email ?? "").trim(), phone: `+${(site.phone ?? "").replace(/\D/g, "")}` },
    d1Bound: /\[\[d1_databases\]\]\s*binding\s*=\s*"GPTBOT_DRAFTS_DB"/.test(toml),
  };
}

/**
 * wrangler.toml with `changes` set in BOTH copies of the runtime config. Every
 * name must already exist in both; a value must not break either quoting.
 */
export function setRuntimeSettings(toml: string, changes: Record<string, string>): string {
  const packed = PACKED.exec(toml);
  if (!packed) throw new Error("wrangler.toml has no GPTBOT_RUNTIME_CONFIG_JSON");
  const config = JSON.parse(packed[1]) as Record<string, string>;
  if (JSON.stringify(config) !== packed[1]) throw new Error("GPTBOT_RUNTIME_CONFIG_JSON is not compact JSON: edit it by hand");
  const start = toml.indexOf(TABLE_MARKER);
  if (start < 0) throw new Error(`wrangler.toml has no ${TABLE_MARKER}`);
  let section = toml.slice(start);
  for (const [name, value] of Object.entries(changes)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`not a setting name: ${name}`);
    // Neither quoting can carry these (''' JSON, "…" TOML); no valid value has them.
    if (/['"\\]/.test(value) || [...value].some((char) => char < " " || char === "\u007f"))
      throw new Error(`${name}: the value cannot be written to wrangler.toml`);
    if (!(name in config)) throw new Error(`wrangler.toml lacks ${name} in GPTBOT_RUNTIME_CONFIG_JSON: add it by hand first`);
    config[name] = value;
    const line = new RegExp(`^(${name}\\s*=\\s*)"[^"]*"(\\s*)$`, "mu");
    if (!line.test(section)) throw new Error(`wrangler.toml lacks ${name} in ${TABLE_MARKER}: add it by hand first`);
    section = section.replace(line, (_match, head: string, tail: string) => `${head}"${value}"${tail}`);
  }
  const head = toml.slice(0, start).replace(PACKED, () => `GPTBOT_RUNTIME_CONFIG_JSON = '''${JSON.stringify(config)}'''`);
  return head + section;
}

// ── checks and the plan ─────────────────────────────────────────────────────

export interface SecretPlan {
  name: string;
  value: string;
  /** Which blocks the value holds, and from where: "live", "test (dark rehearsal)" … */
  blocks: string[];
}

export interface Plan {
  /** Settings whose value changes: name → new value (written to both copies). */
  settings: Record<string, string>;
  /**
   * wrangler.toml with `settings` in both copies, built before anything is
   * put, so a value it cannot carry is an issue of --dry-run, not a failure
   * after the secrets; null when no setting changes.
   */
  toml: string | null;
  /** Settings the inbox sets to the value they already have. */
  unchanged: string[];
  /** The new legal-entity.json, or null when nothing in it changes. */
  entity: Record<string, unknown> | null;
  entityFields: string[];
  secrets: SecretPlan[];
}

type Localized = { ru: string; uz: string };

/** The same words, whatever the case, the quote marks and the spacing. */
export function sameText(a: string, b: string): boolean {
  const normal = (text: string) =>
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[«»“”„‟"]/g, '"')
      .replace(/[’‘ʻʼ`´']/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  return normal(a) === normal(b);
}

/** Test blocks of the dark rehearsal (its credentials folder), in the secrets' own format. */
interface GeneratedTest {
  click: Record<string, unknown> | null;
  uzumMerchant: Record<string, unknown> | null;
}

export function generatedTest(dir: string): GeneratedTest {
  const { click, uzum } = readTestCredentials(dir);
  return {
    click: click && {
      service_id: click.serviceId,
      ...(click.merchantId ? { merchant_id: click.merchantId } : {}),
      secret_key: click.secretKey,
      ...(click.merchantUserId ? { merchant_user_id: click.merchantUserId } : {}),
    },
    uzumMerchant: uzum && { serviceId: uzum.serviceId, login: uzum.login, password: uzum.password },
  };
}

function jsonOf(inbox: Inbox, report: Report, file: "click.json" | "uzum.json" | "business.json"): Record<string, unknown> | null {
  const entry = inbox.json[file];
  if (!entry) return null;
  if ("error" in entry) {
    report.issue(file, "(file)", entry.error);
    return null;
  }
  const object = record(entry.value);
  if (!object) report.issue(file, "(file)", "invalid (expected a JSON object)");
  return object;
}

/** What one inbox file adds: a secret and/or public settings; only from a file without issues. */
interface Contribution {
  secret: SecretPlan | null;
  settings: Record<string, string>;
}

/** A block label holds test credentials ("test", "merchant.test (dark rehearsal)" …). */
const isTestBlock = (label: string) => /(^|\.)test\b/.test(label);
/** A block label holds live credentials ("live", "checkout.live" …). */
const isLiveBlock = (label: string) => /(^|\.)live\b/.test(label);

function examineClick(inbox: Inbox, report: Report, test: GeneratedTest | null): Contribution | null {
  const file = "click.json";
  const object = jsonOf(inbox, report, file);
  if (!object) return null;
  unknownKeys(report, file, "", object, ["live", "test"]);
  const blocks: Record<string, Record<string, unknown>> = {};
  const labels: string[] = [];
  if (object.live !== undefined) {
    const live = fields(report, file, "live", object.live, SCHEMAS.clickLive);
    if (live) {
      blocks.live = live;
      labels.push("live");
    }
  } else {
    report.note(file, "live", "absent: Click cannot go live (S2) before it is here");
  }
  if (object.test !== undefined) {
    const block = fields(report, file, "test", object.test, SCHEMAS.clickTest);
    if (block) {
      blocks.test = block;
      labels.push("test");
    }
  } else if (test?.click) {
    blocks.test = test.click;
    labels.push("test (dark rehearsal)");
    report.note(file, "test", "absent: the dark rehearsal's test block is kept (--test-credentials)");
  } else {
    report.note(file, "test", "absent (optional)");
  }
  if (object.live === undefined && object.test === undefined) report.issue(file, "live", "missing (give live, test or both)");
  if (blocks.live && blocks.test && blocks.live.secret_key === blocks.test.secret_key)
    report.note(file, "test.secret_key", "the same as live.secret_key: acceptable for Click's test playground on the live service only");
  if (report.issuesOf(file)) return null;
  const value = JSON.stringify(blocks);
  // The site's own parser must accept what is put (billing-config.ts).
  const env = { GPT_CLICK_CREDENTIALS_JSON: value } as BillingEnv;
  for (const mode of ["live", "test"] as const) {
    if (blocks[mode] && !(clickCredentials(env, mode) && providerConfigured(env, "click", mode)))
      report.issue(file, mode, "the site's parser rejects this block");
  }
  if (value.length > MAX_SECRET_LENGTH[CLICK_SECRET]) report.issue(file, "(file)", "too long for the secret");
  return report.issuesOf(file) ? null : { secret: { name: CLICK_SECRET, value, blocks: labels }, settings: {} };
}

const UZUM_SECTIONS = {
  checkout: SCHEMAS.uzumCheckout,
  merchant: SCHEMAS.uzumMerchant,
  fiscal: SCHEMAS.uzumFiscal,
} as const;

function examineUzum(inbox: Inbox, report: Report, test: GeneratedTest | null): Contribution | null {
  const file = "uzum.json";
  const object = jsonOf(inbox, report, file);
  if (!object) return null;
  unknownKeys(report, file, "", object, ["api", ...Object.keys(UZUM_SECTIONS), "baseUrls", "autofiscal", "serviceTitle", "accountField"]);
  const settings: Record<string, string> = {};
  const api = object.api;
  if (api === undefined || api === "") report.issue(file, "api", "missing");
  else if (api !== "checkout" && api !== "merchant") report.issue(file, "api", 'invalid (expected "checkout" or "merchant")');
  else {
    report.ok(file, "api");
    settings.UZUM_API = api;
    if (object[api] === undefined) report.issue(file, api, `missing (api is "${api}")`);
  }

  const secret: Record<string, Record<string, Record<string, unknown>>> = {};
  const labels: string[] = [];
  for (const [section, rules] of Object.entries(UZUM_SECTIONS)) {
    const modes: Record<string, Record<string, unknown>> = {};
    if (object[section] !== undefined) {
      const block = record(object[section]);
      if (!block) report.issue(file, section, "invalid (expected an object)");
      else if (!Object.keys(block).length) report.issue(file, section, "empty (give live, test or both)");
      else {
        unknownKeys(report, file, section, block, ["live", "test"]);
        for (const mode of ["live", "test"] as const) {
          if (block[mode] === undefined) continue;
          const parsed = fields(report, file, at(section, mode), block[mode], rules);
          if (parsed) {
            modes[mode] = parsed;
            labels.push(at(section, mode));
          }
        }
      }
    }
    if (section === "merchant" && !modes.test && test?.uzumMerchant && !(record(object.merchant)?.test)) {
      modes.test = test.uzumMerchant;
      labels.push("merchant.test (dark rehearsal)");
      report.note(file, "merchant.test", "absent: the dark rehearsal's test block is kept (--test-credentials)");
    }
    if (Object.keys(modes).length) secret[section] = modes;
  }

  if (object.baseUrls !== undefined) {
    const urls = fields(report, file, "baseUrls", object.baseUrls, SCHEMAS.uzumBaseUrls);
    for (const [key, value] of Object.entries(urls ?? {}))
      settings[BASE_URL_SETTING[key as keyof typeof BASE_URL_SETTING]] = value as string;
  }
  if (object.autofiscal !== undefined) {
    if (typeof object.autofiscal !== "boolean") report.issue(file, "autofiscal", "invalid (expected true or false)");
    else {
      report.ok(file, "autofiscal");
      settings.UZUM_AUTOFISCAL = String(object.autofiscal);
    }
  }
  if (object.serviceTitle !== undefined) {
    const title = plainText(object.serviceTitle);
    if (!title) report.issue(file, "serviceTitle", "invalid (expected one line of text)");
    else if (PRODUCT_NAME_FORBIDDEN.test(title))
      report.note(file, "serviceTitle", "names GPT, Plus, Pro, obuna or a subscription: ask Uzum for «AI paket 300» (decision L16); the site does not use it");
    else report.ok(file, "serviceTitle", "ok (Uzum's catalogue; the site does not use it)");
  }
  if (object.accountField !== undefined) {
    if (object.accountField !== "account")
      report.issue(file, "accountField", 'invalid: the site reads params.account, so the field in Uzum\'s catalogue must be named "account"');
    else report.ok(file, "accountField");
  }
  if (report.issuesOf(file)) return null;
  const value = JSON.stringify(secret);
  const env = { UZUM_CREDENTIALS_JSON: value } as UzumEnv;
  for (const [section, modes] of Object.entries(secret)) {
    for (const mode of Object.keys(modes) as ("live" | "test")[]) {
      const accepted =
        section === "checkout" ? checkoutCredentials(env, mode)
          : section === "merchant" ? merchantCredentials(env, mode)
            : uzumFiscalApiKey(env, mode);
      if (!accepted) report.issue(file, at(section, mode), "the site's parser rejects this block");
    }
  }
  if (value.length > MAX_SECRET_LENGTH[UZUM_SECRET]) report.issue(file, "(file)", "too long for the secret");
  if (report.issuesOf(file)) return null;
  return { secret: labels.length ? { name: UZUM_SECRET, value, blocks: labels } : null, settings };
}

function examineZai(inbox: Inbox, report: Report): Contribution | null {
  if (inbox.zai === null) return null;
  const lines = inbox.zai.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) report.issue("zai.txt", "key", "missing (the file is empty)");
  else if (lines.length > 1) report.issue("zai.txt", "key", "invalid (expected one line: the key only)");
  else if (!ZAI_KEY.test(lines[0])) report.issue("zai.txt", "key", "invalid (expected 20-256 characters: letters, digits, . _ ~ + / = -)");
  else {
    report.ok("zai.txt", "key");
    return { secret: { name: ZAI_SECRET, value: lines[0], blocks: ["key"] }, settings: {} };
  }
  return null;
}

/** business.json's localized fields → the legal-entity.json field each one is. */
const LOCALIZED = { name: "name", shortName: "shortName", legalAddress: "address", director: "director" } as const;
const ENTITY_DIGITS = { stir: 9, account: 20, mfo: 5 } as const;
/** Kept in business.json as the record of where the requisites come from; not on the pages. */
const ENTITY_RECORD_KEYS = ["registrationDate", "registrationNumber", "certificateNumber", "registeredBy"] as const;

/**
 * business.json → the requisites (legal-entity.json) and the receipt settings.
 * A localized field given as one string must say what legal-entity.json
 * already says in Russian, whatever the case and the quote marks: the page's
 * typesetting stays. A new text comes as {"ru","uz"}, so the Uzbek page never
 * keeps an old name. The contact is content/global/site.json, compared only.
 */
function examineBusiness(
  inbox: Inbox,
  report: Report,
  repo: Repo,
  now: number,
): (Contribution & { entity: Record<string, unknown>; changed: string[] }) | null {
  const file = "business.json";
  const object = jsonOf(inbox, report, file);
  if (!object) return null;
  unknownKeys(report, file, "", object, ["legalEntity", "fiscal", "lawyerApprovedAt", "retentionDays", "lawyerApprovalNote"]);
  const entity = structuredClone(repo.entity);
  const changed: string[] = [];
  const change = (field: string, target: string, value: unknown) => {
    entity[target] = value;
    changed.push(target);
    report.ok(file, field, `ok (changes ${ENTITY_FILE})`);
  };
  const same = (field: string) => report.ok(file, field, `ok (the same as ${ENTITY_FILE})`);

  const raw = record(object.legalEntity);
  if (!raw) report.issue(file, "legalEntity", object.legalEntity === undefined ? "missing" : "invalid (expected an object)");
  else {
    unknownKeys(report, file, "legalEntity", raw, [...Object.keys(LOCALIZED), "address", ...Object.keys(ENTITY_DIGITS), "bank", "email", "phone", ...ENTITY_RECORD_KEYS]);
    if ("address" in raw && "legalAddress" in raw) report.issue(file, "legalEntity.address", "give one of legalAddress and address");
    for (const [key, target] of Object.entries(LOCALIZED)) {
      const source = key === "legalAddress" && !("legalAddress" in raw) && "address" in raw ? "address" : key;
      const field = `legalEntity.${source}`;
      const value = raw[source];
      const current = record(entity[target]) as Localized | null;
      const pair = record(value);
      if (value === undefined || value === null || value === "") report.issue(file, field, "missing");
      else if (typeof value === "string") {
        if (!plainText(value)) report.issue(file, field, "invalid (expected one line of text)");
        else if (current && sameText(value, current.ru)) same(field);
        else report.issue(file, field, `differs from ${ENTITY_FILE}: give it as {"ru": "…", "uz": "…"} so both pages change together`);
      } else if (pair && Object.keys(pair).length === 2 && plainText(pair.ru) && plainText(pair.uz)) {
        if (current && sameText(pair.ru as string, current.ru) && sameText(pair.uz as string, current.uz)) same(field);
        else change(field, target, { ru: pair.ru, uz: pair.uz });
      } else {
        report.issue(file, field, 'invalid (expected text or {"ru": "…", "uz": "…"})');
      }
    }
    for (const [key, digits] of Object.entries(ENTITY_DIGITS)) {
      const field = `legalEntity.${key}`;
      const value = raw[key];
      if (value === undefined || value === "") report.issue(file, field, "missing");
      else if (typeof value !== "string" || !new RegExp(`^\\d{${digits}}$`).test(value)) report.issue(file, field, `invalid (expected ${digits} digits, in quotes)`);
      else if (value === entity[key]) same(field);
      else change(field, key, value);
    }
    if (raw.bank === undefined || raw.bank === "") report.issue(file, "legalEntity.bank", "missing");
    else if (!plainText(raw.bank)) report.issue(file, "legalEntity.bank", "invalid (expected one line of text)");
    else if (typeof entity.bank === "string" && sameText(raw.bank as string, entity.bank)) same("legalEntity.bank");
    else change("legalEntity.bank", "bank", raw.bank);
    // The studio contact is content/global/site.json, which every page shows
    // (protected ones included): compared here, never written.
    const differs = `differs from ${SITE_FILE}, which every page shows: not written here; a new contact is a release of its own`;
    if (raw.email !== undefined) {
      if (typeof raw.email !== "string" || !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(raw.email.trim()))
        report.issue(file, "legalEntity.email", "invalid (expected an e-mail address)");
      else if (raw.email.trim().toLowerCase() === repo.contact.email.toLowerCase()) report.ok(file, "legalEntity.email", `ok (the same as ${SITE_FILE})`);
      else report.note(file, "legalEntity.email", differs);
    }
    if (raw.phone !== undefined) {
      const digits = typeof raw.phone === "string" ? raw.phone.replace(/[\s()+-]/g, "") : "";
      if (!/^998\d{9}$/.test(digits)) report.issue(file, "legalEntity.phone", "invalid (expected +998 and 9 digits)");
      else if (`+${digits}` === repo.contact.phone) report.ok(file, "legalEntity.phone", `ok (the same as ${SITE_FILE})`);
      else report.note(file, "legalEntity.phone", differs);
    }
    for (const key of ENTITY_RECORD_KEYS) {
      if (raw[key] === undefined) continue;
      if (!plainText(raw[key])) report.issue(file, `legalEntity.${key}`, "invalid (expected one line of text)");
      else report.ok(file, `legalEntity.${key}`, "ok (a record, not shown on the pages)");
    }
  }

  const settings: Record<string, string> = {};
  if (object.fiscal === undefined) report.issue(file, "fiscal", "missing");
  else {
    const fiscal = fields(report, file, "fiscal", object.fiscal, SCHEMAS.businessFiscal);
    if (fiscal) {
      for (const [key, setting] of Object.entries(FISCAL_SETTING)) settings[setting] = fiscal[key] as string;
      if (raw && typeof raw.stir === "string" && fiscal.tin !== raw.stir)
        report.issue(file, "fiscal.tin", "differs from legalEntity.stir: the receipts carry the seller's STIR, and the live gate refuses otherwise");
    }
  }

  if (object.lawyerApprovedAt !== undefined) {
    const day = calendarDay(object.lawyerApprovedAt);
    const approved = repo.config.GPT_BILLING_TERMS_APPROVED_AT || "";
    if (!day) report.issue(file, "lawyerApprovedAt", "invalid (expected YYYY-MM-DD)");
    else if (Date.parse(`${day}T00:00:00Z`) > now) report.issue(file, "lawyerApprovedAt", "invalid (a day that has not come)");
    else
      report.note(
        file,
        "lawyerApprovedAt",
        day < approved
          ? "ok; earlier than GPT_BILLING_TERMS_APPROVED_AT, so the lawyer has not seen the current edition. Not written: an approval belongs to an edition (docs/paid-chat/OFFER-RU.md)"
          : day === approved
            ? "ok; the same day as GPT_BILLING_TERMS_APPROVED_AT. Not written (docs/paid-chat/OFFER-RU.md)"
            : "ok; later than GPT_BILLING_TERMS_APPROVED_AT. Not written: record the approval of the current edition and of the policies by docs/paid-chat/OFFER-RU.md",
      );
  }
  if (object.retentionDays !== undefined) {
    const days = object.retentionDays;
    if (days === null) report.note(file, "retentionDays", "null: chat messages are kept until deleted on request (GPT_MESSAGES_RETENTION_DAYS stays empty)");
    else if (typeof days !== "number" || !Number.isSafeInteger(days) || days < 7 || days > 3650)
      report.issue(file, "retentionDays", "invalid (expected null or a whole number 7-3650)");
    else report.note(file, "retentionDays", "ok. Not written: GPT_MESSAGES_RETENTION_DAYS changes the privacy policy in the same release (docs/paid-chat/SALT-RU.md)");
  }
  if (object.lawyerApprovalNote !== undefined) {
    if (!plainText(object.lawyerApprovalNote)) report.issue(file, "lawyerApprovalNote", "invalid (expected one line of text)");
    else report.ok(file, "lawyerApprovalNote", "ok (a note, not used)");
  }

  if (report.issuesOf(file)) return null;
  // The one validation the pages and the live gate apply (scripts/legal-entity.ts).
  for (const issue of legalEntityIssues(entity, repo.contact)) report.issue(file, `legalEntity → ${ENTITY_FILE} ${issue}`, "invalid");
  for (const name of fiscalIssues({ ...repo.config, ...settings }, { tin: true })) report.issue(file, `fiscal → ${name}`, "the site rejects it");
  if (report.issuesOf(file)) return null;
  if (changed.length) {
    const day = new Date(now).toISOString().slice(0, 10);
    const from = path.join(inbox.dir, file).replace(/\\/g, "/");
    entity._source = `${typeof entity._source === "string" ? `${entity._source} ` : ""}Updated on ${day} by scripts/paid-chat/ingest-keys.ts from the owner's ${from} (outside Git): ${changed.join(", ")}.`;
  }
  return { secret: null, settings, entity, changed };
}

export interface Examination {
  report: Report;
  plan: Plan;
}

/** Checks the inbox against the schemas and the repository; plans what --apply does. */
export function examine(inbox: Inbox, repo: Repo, test: GeneratedTest | null = null, now = Date.now()): Examination {
  const report = new Report();
  for (const file of inbox.misnamed)
    report.issue(`${file}.txt`, "(file)", `rename it to ${file} (Windows hides the .txt extension)`);
  for (const file of INBOX_FILES) if (!inbox.present.includes(file)) report.note(file, "(file)", "not in the inbox");
  if (inbox.others) report.note("(inbox)", "(other files)", `${inbox.others} not read`);
  for (const key of Object.keys(repo.config)) {
    if (repo.table[key] !== repo.config[key])
      report.issue("wrangler.toml", key, "the packed JSON and the nested table differ (tests/runtime-config.test.ts)");
  }

  const click = examineClick(inbox, report, test);
  const uzum = examineUzum(inbox, report, test);
  const zai = examineZai(inbox, report);
  const business = examineBusiness(inbox, report, repo, now);
  const contributions = [click, uzum, zai, business];
  const settings: Record<string, string> = {};
  const unchanged: string[] = [];
  for (const [name, value] of Object.entries(Object.assign({}, ...contributions.map((item) => item?.settings ?? {})) as Record<string, string>)) {
    if (repo.config[name] === value) unchanged.push(name);
    else settings[name] = value;
  }
  let toml: string | null = null;
  if (Object.keys(settings).length) {
    try {
      toml = setRuntimeSettings(repo.toml, settings);
    } catch (error) {
      // setRuntimeSettings names the setting, never its value.
      report.issue("wrangler.toml", "(runtime config)", error instanceof Error ? error.message : "cannot be written");
    }
  }
  return {
    report,
    plan: {
      settings,
      toml,
      unchanged,
      entity: business?.changed.length ? business.entity : null,
      entityFields: business?.changed ?? [],
      secrets: contributions.flatMap((item) => (item?.secret ? [item.secret] : [])),
    },
  };
}

// ── readiness ───────────────────────────────────────────────────────────────

const rootName = (name: string) => name.split(".")[0];

/**
 * What liveReadiness() names per provider once its mode is "live" and
 * GPT_BILLING_LIVE_READY is "true" (the runbook's S2/S4 switches), against
 * the planned config and the secrets: the inbox's own values, and the other
 * Pages secrets by name. `production` = the names Pages holds; null offline,
 * where secrets outside the inbox stand in and are listed as unconfirmed.
 */
export function readinessLines(
  config: Record<string, string>,
  d1Bound: boolean,
  secrets: readonly SecretPlan[],
  production: ReadonlySet<string> | null,
  now = Date.now(),
): string[] {
  const own = Object.fromEntries(secrets.map((secret) => [secret.name, secret.value]));
  const others = LIVE_SECRETS.filter((name) => !(name in own) && (production === null || production.has(name)));
  const base = { ...config, GPTBOT_DRAFTS_DB: d1Bound ? {} : undefined };
  const env = (withOthers: boolean) => ({ ...base, ...(withOthers ? standIns(others) : {}), ...own }) as unknown as BillingEnv;
  const lines: string[] = [];
  for (const provider of paymentProviders(env(true))) {
    const live = (withOthers: boolean) =>
      ({ ...env(withOthers), GPT_BILLING_LIVE_READY: "true", [MODE_SETTING[provider]]: "live" }) as BillingEnv;
    const missing = liveReadiness(live(true), provider, now);
    lines.push(`  ${provider}: ${missing.length ? `missing for live: ${missing.join(", ")}` : "nothing missing for live"}`);
    if (production === null) {
      const unconfirmed = [...new Set(liveReadiness(live(false), provider, now).filter((name) => !missing.includes(name)).map(rootName))];
      if (unconfirmed.length) lines.push(`    unconfirmed (Pages secrets outside the inbox; --apply reads their names): ${unconfirmed.join(", ")}`);
    }
    lines.push(`    switches, set in S2/S4 only: ${MODE_SETTING[provider]}="live", GPT_BILLING_LIVE_READY="true"`);
  }
  // Z.ai answers first with its three switches (decision L10), as the admin's «Готовность» says.
  const zaiInInbox = ZAI_SECRET in own;
  const zaiKey = zaiInInbox || production === null || production.has(ZAI_SECRET) ? { ZAI_API_KEY: own[ZAI_SECRET] ?? "stand-in" } : {};
  const zai = aiChatReadiness({ ...env(true), ...zaiKey } as BillingEnv, now).models.zaiMissing;
  lines.push(`  Z.ai: ${zai.length ? `missing ${zai.join(", ")}` : "answers first"}`);
  if (production === null && !zaiInInbox) lines.push(`    unconfirmed (a Pages secret outside the inbox): ${ZAI_SECRET}`);
  return lines;
}

// ── Cloudflare Pages secrets ────────────────────────────────────────────────

/** The two operations --apply needs; names out, values only in. */
export interface PagesSecrets {
  /** Names of the production secrets of the Pages project. */
  list(): Promise<Set<string>>;
  /** Puts one secret; the value travels through the child's stdin only. */
  put(name: string, value: string): Promise<void>;
}

/** CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from an env file (as F:/Claude/gptbot-tools/wr.py reads them). */
export function cloudflareEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && (match[1] === "CLOUDFLARE_ACCOUNT_ID" || match[1] === "CLOUDFLARE_API_TOKEN"))
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!out.CLOUDFLARE_API_TOKEN) throw new Error("the --cloudflare-env file has no CLOUDFLARE_API_TOKEN");
  return out;
}

/**
 * wrangler of this repository (node_modules), in `root`. Its output is read,
 * redacted of every value it was given and of the Cloudflare credentials,
 * and only a failure's last lines are ever shown.
 */
export function wranglerPagesSecrets(options: {
  root: string;
  credentials?: Record<string, string>;
  wranglerBin?: string;
  timeoutMs?: number;
}): PagesSecrets {
  const bin = options.wranglerBin ?? path.join(options.root, "node_modules/wrangler/bin/wrangler.js");
  const hidden = Object.values(options.credentials ?? {}).filter(Boolean);
  const run = (args: string[], input: string | null) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], {
        cwd: options.root,
        env: { ...process.env, ...options.credentials, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
      const timer = setTimeout(() => child.kill(), options.timeoutMs ?? WRANGLER_TIMEOUT_MS);
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error(`wrangler ${args.slice(0, 3).join(" ")} could not start`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve(output);
        let shown = output;
        for (const value of [...hidden, ...(input ? [input, ...leaves(input)] : [])]) shown = shown.split(value).join("<redacted>");
        const tail = shown.trim().split(/\r?\n/).slice(-3).join(" | ");
        reject(new Error(`wrangler ${args.slice(0, 3).join(" ")} failed (exit ${code ?? "killed"})${tail ? `: ${tail}` : ""}`));
      });
      // A child that exits before reading stdin must not crash this process.
      child.stdin.on("error", () => {});
      child.stdin.end(input ?? "");
    });
  return {
    async list() {
      const output = await run(["pages", "secret", "list", "--project-name", PAGES_PROJECT], null);
      // "  - NAME: Value Encrypted" (wrangler colours only the words after the name).
      return new Set([...output.matchAll(/^\s+-\s+([A-Za-z_][A-Za-z0-9_]*):/gm)].map((match) => match[1]));
    },
    async put(name, value) {
      await run(["pages", "secret", "put", name, "--project-name", PAGES_PROJECT], value);
    },
  };
}

/** Every string inside a JSON secret, for redaction. */
function leaves(value: string): string[] {
  try {
    const out: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "string" || typeof node === "number") {
        if (String(node).length >= 6) out.push(String(node));
      } else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(JSON.parse(value));
    return out;
  } catch {
    return [];
  }
}

// ── the command line ────────────────────────────────────────────────────────

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

export interface Dependencies {
  /** The repository the files are read from and written to (default: this checkout). */
  root?: string;
  /** Cloudflare Pages secrets; default wrangler of the repository. Only --apply calls it. */
  pagesSecrets?: (credentials: Record<string, string> | undefined) => PagesSecrets;
  now?: number;
}

const USAGE =
  "usage: ingest-keys.ts --inbox <folder outside Git> (--dry-run | --apply [--cloudflare-env <file>]) [--test-credentials <folder>]";

function printReport(report: Report, log: (line: string) => void): void {
  let file = "";
  for (const line of report.lines) {
    if (line.file !== file) {
      file = line.file;
      log(`${file}:`);
    }
    log(`  ${line.field}: ${line.status}`);
  }
}

function printPlan(plan: Plan, apply: boolean, log: (line: string) => void): void {
  const will = apply ? "changed" : "will change";
  log(apply ? "applied:" : "plan (nothing is written by --dry-run):");
  const settings = Object.keys(plan.settings);
  log(`  wrangler.toml (packed JSON and nested table): ${settings.length ? `${settings.join(", ")} ${will}` : "no change"}${plan.unchanged.length ? `; unchanged: ${plan.unchanged.join(", ")}` : ""}`);
  log(`  ${ENTITY_FILE}: ${plan.entityFields.length ? `${plan.entityFields.join(", ")} ${will} (and _source)` : "no change"}`);
  log(`  Pages secrets: ${plan.secrets.length ? plan.secrets.map((secret) => `${secret.name} (${secret.blocks.join(", ")})`).join("; ") : "none"}${plan.secrets.length && !apply ? " would be put" : ""}`);
}

/** The command line; returns the exit code. `log` gets every line printed. */
export async function main(args: string[], log: (line: string) => void = console.log, deps: Dependencies = {}): Promise<number> {
  try {
    const dry = args.includes("--dry-run");
    const apply = args.includes("--apply");
    const inboxArg = option(args, "--inbox");
    if (!inboxArg || dry === apply) throw new Error(USAGE);
    const root = path.resolve(deps.root ?? REPO_ROOT);
    const inboxDir = path.resolve(inboxArg);
    if (inside(root, inboxDir)) throw new Error("the inbox is inside the repository: keep the key files outside Git");
    if (!existsSync(inboxDir) || !statSync(inboxDir).isDirectory()) throw new Error("the inbox folder does not exist");
    const testArg = option(args, "--test-credentials");
    if (args.includes("--test-credentials") && !testArg) throw new Error("--test-credentials needs a folder");
    if (testArg && inside(root, path.resolve(testArg))) throw new Error("--test-credentials is inside the repository");
    if (dry && args.includes("--cloudflare-env")) throw new Error("--cloudflare-env is for --apply only: --dry-run reads no credential");

    const repo = loadRepo(root);
    const test = testArg ? generatedTest(path.resolve(testArg)) : null;
    // Asked to keep the rehearsal's test blocks: a mistyped or empty folder
    // must not drop them silently.
    if (test && !test.click && !test.uzumMerchant)
      throw new Error(`--test-credentials holds neither ${CLICK_SECRET}.json nor ${UZUM_SECRET}.json: leave the option out if the dark rehearsal has not run`);
    const inbox = readInbox(inboxDir);
    const { report, plan } = examine(inbox, repo, test, deps.now);
    log(`inbox: ${inboxDir.replace(/\\/g, "/")} (outside the repository)`);
    printReport(report, log);
    const planned = { ...repo.config, ...plan.settings };

    if (dry) {
      printPlan(plan, false, log);
      log("liveReadiness() after this intake, offline:");
      for (const line of readinessLines(planned, repo.d1Bound, plan.secrets, null, deps.now)) log(line);
      log("Not checked here: the offers, the policies' review dates and the built pages; after npm run build:fast run npx tsx scripts/release/live-gate.ts --assume-live <click|uzum>.");
      log(`--dry-run: nothing was written and nothing was sent; ${report.issues} issue(s).`);
      return report.issues ? 1 : 0;
    }

    if (report.issues) {
      log(`refusing --apply: ${report.issues} issue(s) above. Nothing was written and nothing was sent.`);
      return 1;
    }
    if (!plan.secrets.length && !Object.keys(plan.settings).length && !plan.entity) {
      log("nothing to apply: every value in the inbox is already in place.");
      return 0;
    }
    const envFile = option(args, "--cloudflare-env");
    if (args.includes("--cloudflare-env") && !envFile) throw new Error("--cloudflare-env needs a file");
    const credentials = envFile ? cloudflareEnv(envFile) : undefined;
    const pages = (deps.pagesSecrets ?? ((given) => wranglerPagesSecrets({ root, credentials: given })))(credentials);
    const production = await pages.list();
    const put: string[] = [];
    for (const secret of plan.secrets) {
      if (production.has(secret.name) && secret.name !== ZAI_SECRET && !secret.blocks.some(isTestBlock))
        log(`note: ${secret.name} exists in Pages and is replaced without a test block; pass --test-credentials <dark rehearsal folder> to keep one.`);
      // A put replaces the whole secret: a file with test blocks only drops the live keys.
      if (production.has(secret.name) && secret.name !== ZAI_SECRET && !secret.blocks.some(isLiveBlock))
        log(`note: ${secret.name} exists in Pages and is replaced without a live block: live keys it holds are dropped; the owner's file must be complete.`);
      try {
        await pages.put(secret.name, secret.value);
      } catch (error) {
        log(`error: ${error instanceof Error ? error.message : "put failed"}`);
        const rest = plan.secrets.map((item) => item.name).filter((name) => !put.includes(name));
        log(`stopped: put ${put.length ? put.join(", ") : "nothing"}; not put: ${rest.join(", ")}. The repository files were not written. Fix the cause and run --apply again (a put replaces the value).`);
        return 1;
      }
      put.push(secret.name);
      log(`put ${secret.name} (${secret.blocks.join(", ")}): values not shown`);
    }
    if (plan.toml !== null) writeFileSync(path.join(root, "wrangler.toml"), plan.toml);
    if (plan.entity) writeFileSync(path.join(root, ENTITY_FILE), `${JSON.stringify(plan.entity, null, 2)}\n`);
    printPlan(plan, true, log);
    log("liveReadiness() after this intake, against the Pages secrets by name:");
    for (const line of readinessLines(planned, repo.d1Bound, plan.secrets, new Set([...production, ...put]), deps.now)) log(line);
    log("Next (docs/paid-chat/ONBOARDING-KEYS-RU.md, step 1): review git diff, run the runbook's tests, commit the repository files, then npm run build:production and the guarded deploy: a Pages secret takes effect only with a deploy. The admin's «Готовность» shows the same names afterwards.");
    const secretFiles = SECRET_FILES.filter((file) => inbox.present.includes(file));
    if (secretFiles.length)
      log(`Owner: delete ${secretFiles.join(", ")} from ${inboxDir.replace(/\\/g, "/")} as soon as the runbook's local test steps that read them are done (S1, S3), and keep no other copy: the keys now live in Cloudflare Pages.`);
    if (inbox.present.includes("business.json"))
      log("business.json holds no secret: keep it as the source of the requisites, or delete it too.");
    return 0;
  } catch (error) {
    // This script's own messages only: never a value, never a parser's quote.
    log(`error: ${error instanceof Error ? error.message : "ingest failed"}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  void main(process.argv.slice(2)).then((code) => process.exit(code));
