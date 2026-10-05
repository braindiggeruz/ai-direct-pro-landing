// Deploy-time live gate (paid-chat plan WP-18, decisions L9 and L13).
//
// A deploy whose committed runtime config says GPT_BILLING_LIVE_READY = "true"
// and puts a provider in live mode goes out only when what a live sale
// promises is really in place:
//   - for every provider in live mode, no name liveReadiness() reports that
//     the committed config can settle (terms, the lawyer's approval date,
//     fiscal settings, Uzum's live URLs, sign-in);
//   - both offers, /ru/oferta/ and /uz/oferta/: published and indexable, at
//     GPT_BILLING_TERMS_RU/UZ, stating the edition GPT_BILLING_TERMS_VERSION,
//     approved on GPT_BILLING_TERMS_APPROVED_AT (their legalReviewedAt) and
//     built into dist with that edition, the seller's requisites and a
//     sitemap entry;
//   - complete requisites (content/global/legal-entity.json) whose STIR is
//     the receipts' GPT_FISCAL_TIN, which must be set for Uzum too;
//   - a legalReviewedAt on both privacy policies;
//   - the secrets of the live providers and of the shared machinery, by NAME,
//     in Cloudflare Pages production. `check-production` and `deploy` read the
//     names from the Pages project; offline (`stamp`, `check`) they are listed
//     as deferred. Contents are never read here: liveReadiness() validates
//     them at runtime and fails closed.
// A deploy that switches live off is never held: with GPT_BILLING_LIVE_READY
// other than "true", or with no provider in live mode, none of the rules above
// applies, so either stop switch always ships. One rule holds regardless: a
// Pages variable named like a billing setting would silently override the
// reviewed JSON at runtime (hydrateRuntimeConfig fills only what is missing),
// so check-production and deploy refuse one.
//
//   npx tsx scripts/release/live-gate.ts                    the committed config
//   npx tsx scripts/release/live-gate.ts --assume-live click   what Click live
//                                                              still lacks
// Both print names and file paths only, never a value.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  liveReadiness,
  PROVIDERS,
  providerMode,
  type BillingEnv,
  type LocalProvider,
} from '../../functions/lib/gpt-chat/billing-config';
import type { Locale, Page } from '../../src/shared/types';
import { legalEntityIssues, type LegalEntity } from '../legal-entity';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SITE = 'https://gptbot.uz';
const LOCALES: readonly Locale[] = ['ru', 'uz'];

export const OFFER_FILES: Record<Locale, string> = {
  ru: 'content/pages/ru/oferta.json',
  uz: 'content/pages/uz/oferta.json',
};
export const POLICY_FILES: Record<Locale, string> = {
  ru: 'content/pages/ru/politika-konfidentsialnosti.json',
  uz: 'content/pages/uz/maxfiylik-siyosati.json',
};
const TERMS_SETTING: Record<Locale, 'GPT_BILLING_TERMS_RU' | 'GPT_BILLING_TERMS_UZ'> = {
  ru: 'GPT_BILLING_TERMS_RU',
  uz: 'GPT_BILLING_TERMS_UZ',
};

/**
 * The settings liveReadiness() may name that only a Pages secret holds, each
 * with a stand-in that passes its format check: the gate knows a secret by
 * its name alone, and runtime validates the real value.
 */
const LONG = 'x'.repeat(64);
const SECRET_STAND_INS: Record<string, string> = {
  GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({
    live: { service_id: '1', merchant_id: '1', secret_key: LONG, merchant_user_id: '1' },
  }),
  UZUM_CREDENTIALS_JSON: JSON.stringify({
    checkout: { live: { terminalId: '00000000-0000-4000-8000-000000000000', apiKey: LONG } },
    merchant: { live: { serviceId: 1, login: 'stand-in', password: LONG } },
    fiscal: { live: { apiKey: LONG } },
  }),
  GPT_IDENTITY_SECRET: LONG,
  GPT_HASH_SALT: LONG,
  GPT_BILLING_MAINTENANCE_SECRET: LONG,
  TELEGRAM_ASSISTANT_BOT_TOKEN: LONG,
  TELEGRAM_ASSISTANT_WEBHOOK_SECRET: LONG,
  GPT_NOTIFY_BOT_TOKEN: LONG,
  GPT_NOTIFY_CHAT_ID: LONG,
  TELEGRAM_ADMIN_CHAT_ID: LONG,
  GPT_TELEGRAM_CLIENT_SECRET: LONG,
};
export const LIVE_SECRETS: readonly string[] = Object.keys(SECRET_STAND_INS);

/** Settings the reviewed GPTBOT_RUNTIME_CONFIG_JSON owns; no Pages variable may shadow them. */
export const BILLING_SETTINGS: ReadonlySet<string> = new Set([
  'GPT_PAYMENT_PROVIDERS', 'GPT_BILLING_MODE', 'GPT_BILLING_MODE_CLICK', 'GPT_BILLING_MODE_UZUM',
  'GPT_BILLING_LIVE_READY', 'GPT_BILLING_TERMS_RU', 'GPT_BILLING_TERMS_UZ', 'GPT_BILLING_TERMS_VERSION',
  'GPT_BILLING_TERMS_APPROVED_AT', 'GPT_FISCAL_IKPU', 'GPT_FISCAL_PACKAGE_CODE', 'GPT_FISCAL_VAT_PERCENT',
  'GPT_FISCAL_TIN', 'UZUM_API', 'UZUM_AUTOFISCAL', 'UZUM_CHECKOUT_BASE_URL', 'UZUM_FISCAL_BASE_URL',
  'GPT_GUEST_CHECKOUT',
]);

export interface LiveGateInput {
  /** The packed public runtime config (GPTBOT_RUNTIME_CONFIG_JSON). */
  config: Record<string, string>;
  /** wrangler.toml binds the D1 database GPTBOT_DRAFTS_DB. */
  d1Bound: boolean;
  offers: Record<Locale, Page | null>;
  policies: Record<Locale, Page | null>;
  entity: unknown;
  /** A file of the built artifact (dist), or null when it is missing. */
  built: (file: string) => string | null;
  /** Names of the Pages production variables and secrets; null when not read (offline). */
  production: ReadonlySet<string> | null;
  now?: number;
}

export interface LiveGateReport {
  /** GPT_BILLING_LIVE_READY is "true" and a provider is in live mode: the live rules applied. */
  live: boolean;
  providers: LocalProvider[];
  /** What refuses the deploy; names and paths only. */
  issues: string[];
  /** Secrets a live sale needs that only the Pages project can confirm (offline runs). */
  deferred: string[];
}

/** YYYY-MM-DD that is a real calendar day and has come. */
function pastDay(value: unknown, now: number): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value && at <= now;
}

const root = (name: string) => name.split('.')[0];

/**
 * A stand-in value for each of `names` that only a Pages secret holds (the
 * others are skipped): a secret known by its name alone passes liveReadiness().
 * scripts/paid-chat/ingest-keys.ts uses the same set.
 */
export function standIns(names: Iterable<string>): Record<string, string> {
  return Object.fromEntries([...names].filter((name) => name in SECRET_STAND_INS).map((name) => [name, SECRET_STAND_INS[name]]));
}

export function liveGate(input: LiveGateInput): LiveGateReport {
  const now = input.now ?? Date.now();
  const issues: string[] = [];
  const deferred = new Set<string>();
  if (input.production) {
    for (const name of input.production) {
      if (BILLING_SETTINGS.has(name)) issues.push(`Pages variable ${name} overrides the reviewed GPTBOT_RUNTIME_CONFIG_JSON: remove it`);
    }
  }
  const base = { ...input.config, GPTBOT_DRAFTS_DB: input.d1Bound ? {} : undefined };
  const env = (secrets: Iterable<string>) => ({ ...base, ...standIns(secrets) }) as unknown as BillingEnv;
  // Nothing sells live without both the switch and a provider in live mode,
  // so either one taken back is a stop that ships (the R-table rollback:
  // GPT_BILLING_LIVE_READY=false or a provider's mode cleared).
  const providers = input.config.GPT_BILLING_LIVE_READY === 'true'
    ? PROVIDERS.filter((provider) => providerMode(env([]), provider) === 'live')
    : [];
  if (!providers.length) return { live: false, providers, issues, deferred: [] };
  for (const provider of providers) {
    if (input.production) {
      // Present secrets stand in as valid: what is still named is either a
      // config issue or a secret that production lacks.
      for (const name of liveReadiness(env(input.production), provider, now)) {
        issues.push(root(name) in SECRET_STAND_INS
          ? `${provider}: Pages secret ${root(name)} is not set in production`
          : `${provider}: ${name}`);
      }
    } else {
      for (const name of liveReadiness(env([]), provider, now)) {
        if (root(name) in SECRET_STAND_INS) deferred.add(root(name));
      }
      for (const name of liveReadiness(env(LIVE_SECRETS), provider, now)) issues.push(`${provider}: ${name}`);
    }
  }

  const version = input.config.GPT_BILLING_TERMS_VERSION || '';
  const approvedAt = input.config.GPT_BILLING_TERMS_APPROVED_AT || '';
  const entity = (input.entity ?? {}) as Partial<LegalEntity>;
  const sitemap = input.built('sitemap.xml') ?? '';
  for (const locale of LOCALES) {
    const url = `/${locale}/oferta/`;
    const href = `${SITE}${url}`;
    const offer = input.offers[locale];
    if (!offer) {
      issues.push(`${OFFER_FILES[locale]} is missing`);
      continue;
    }
    if (offer.status !== 'published' || offer.robotsIndex !== true) issues.push(`${url}: not published and indexable`);
    if (offer.url !== url || offer.canonical !== href) issues.push(`${url}: url or canonical differs from ${href}`);
    if (input.config[TERMS_SETTING[locale]] !== href) issues.push(`${TERMS_SETTING[locale]} is not ${href}`);
    if (!version || offer.termsVersion !== version) issues.push(`${url}: termsVersion differs from GPT_BILLING_TERMS_VERSION`);
    if (offer.requisites !== 'seller') issues.push(`${url}: does not show the seller's requisites`);
    if (!pastDay(offer.legalReviewedAt, now)) issues.push(`${url}: legalReviewedAt (the lawyer's approval) is missing`);
    else if (offer.legalReviewedAt !== approvedAt) issues.push(`${url}: legalReviewedAt differs from GPT_BILLING_TERMS_APPROVED_AT`);
    const html = input.built(`${url.slice(1)}index.html`);
    if (!html) {
      issues.push(`dist${url}index.html is missing`);
    } else {
      if (!version || !html.includes(`data-terms-version="${version}"`)) issues.push(`dist${url}: the built page does not state edition GPT_BILLING_TERMS_VERSION`);
      if (!/<meta name="robots" content="index, follow/.test(html)) issues.push(`dist${url}: the built page is not indexable`);
      if (!entity.stir || !entity.account || !html.includes(entity.stir) || !html.includes(entity.account)) {
        issues.push(`dist${url}: the built page lacks the seller's requisites`);
      }
    }
    if (!sitemap.includes(`<loc>${href}</loc>`)) issues.push(`dist/sitemap.xml lacks ${href}`);
    const policy = input.policies[locale];
    if (!policy || policy.status !== 'published') issues.push(`${POLICY_FILES[locale]}: the privacy policy is not published`);
    else if (!pastDay(policy.legalReviewedAt, now)) issues.push(`${policy.url}: legalReviewedAt (the lawyer's approval) is missing`);
  }
  issues.push(...legalEntityIssues(input.entity).map((field) => `content/global/legal-entity.json: ${field}`));
  // Set and equal whatever the provider: liveReadiness() asks only Click's
  // receipt for the TIN, yet every live sale is made by this seller.
  if (input.config.GPT_FISCAL_TIN !== entity.stir) {
    issues.push('GPT_FISCAL_TIN is not the seller\'s STIR (content/global/legal-entity.json)');
  }
  return { live: true, providers, issues: [...new Set(issues)], deferred: [...deferred].sort() };
}

/** The packed public runtime config of wrangler.toml, as production reads it. */
export function committedRuntimeConfig(wranglerToml: string): Record<string, string> {
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(wranglerToml)?.[1];
  if (!packed) throw new Error('wrangler.toml has no GPTBOT_RUNTIME_CONFIG_JSON.');
  return JSON.parse(packed) as Record<string, string>;
}

function readJson<T>(file: string): T | null {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as T : null;
}

/** The gate's inputs from a checkout (`root`) and its built artifact (`dist`). */
export function loadLiveGateInput(
  root: string,
  dist: string,
  production: ReadonlySet<string> | null,
): LiveGateInput {
  const toml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  const pages = (files: Record<Locale, string>) =>
    Object.fromEntries(LOCALES.map((locale) => [locale, readJson<Page>(path.join(root, files[locale]))])) as Record<Locale, Page | null>;
  return {
    config: committedRuntimeConfig(toml),
    d1Bound: /\[\[d1_databases\]\]\s*binding\s*=\s*"GPTBOT_DRAFTS_DB"/.test(toml),
    offers: pages(OFFER_FILES),
    policies: pages(POLICY_FILES),
    entity: readJson(path.join(root, 'content/global/legal-entity.json')),
    built: (file) => {
      const absolute = path.join(dist, ...file.split('/'));
      return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
    },
    production,
  };
}

/** Throws, listing every issue, when the gate refuses the deployment. */
export function assertLiveGate(input: LiveGateInput): LiveGateReport {
  const report = liveGate(input);
  if (report.issues.length) {
    throw new Error(`Live billing gate refused the deployment (docs/paid-chat/OFFER-RU.md):\n- ${report.issues.join('\n- ')}`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const flag = process.argv.indexOf('--assume-live');
  const assumed = flag >= 0 ? process.argv[flag + 1] as LocalProvider : null;
  if (assumed !== null && !PROVIDERS.includes(assumed)) {
    console.error(`Usage: live-gate.ts [--assume-live ${PROVIDERS.join('|')}]`);
    process.exitCode = 1;
  } else {
    const input = loadLiveGateInput(ROOT, path.join(ROOT, 'dist'), null);
    if (assumed) {
      const setting = assumed === 'click' ? 'GPT_BILLING_MODE_CLICK' : assumed === 'uzum' ? 'GPT_BILLING_MODE_UZUM' : 'GPT_BILLING_MODE';
      input.config = { ...input.config, GPT_BILLING_LIVE_READY: 'true', [setting]: 'live' };
    }
    const report = liveGate(input);
    console.log(JSON.stringify({ assumedLive: assumed, ...report }, null, 2));
    if (!assumed && report.issues.length) process.exitCode = 1;
  }
}
