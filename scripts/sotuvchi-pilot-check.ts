// Offline pilot readiness check for Sotuvchi (GPTBot Agents).
//
// It answers one question: is this checkout configured well enough that a
// human could safely run the pilot runbook? It is read-only by construction —
// it performs no network call, never contacts Telegram, never mutates a
// webhook and never prints a secret value. Only the NAMES of required
// variables and boolean "present/absent" results are reported.
//
// Applying anything is a separate, explicit step:
//   npx tsx scripts/telegram-agents-setup.ts setup
//   npx tsx scripts/telegram-agents-setup.ts setup --apply
//
// Usage:
//   npx tsx scripts/sotuvchi-pilot-check.ts
//   npx tsx scripts/sotuvchi-pilot-check.ts --json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildTelegramAgentsWebhookUrl,
  isProtectedAgentBotUsername,
  TELEGRAM_AGENTS_WEBHOOK_PATH,
} from '../functions/channels/telegram/setup';
import {
  isUsableSotuvchiBotUsername,
  SOTUVCHI_BOT_USERNAME,
  SOTUVCHI_SELLER_START_PAYLOAD,
  sotuvchiSellerCtaHref,
  sotuvchiSellerStartUrl,
} from '../src/shared/sotuvchi-config';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Migrations the pilot needs, in the exact order they must be applied. */
export const PILOT_MIGRATIONS = [
  '0013_platform_events.sql',
  '0014_platform_identity_orgs.sql',
  '0015_platform_knowledge.sql',
  '0016_platform_workflow.sql',
  '0017_telegram_agents_transport.sql',
  '0018_sotuvchi_store_onboarding.sql',
  '0019_sotuvchi_catalog.sql',
  '0020_sotuvchi_buyer_qa.sql',
  '0021_sotuvchi_checkout.sql',
  '0022_sotuvchi_orders_inventory.sql',
  '0023_sotuvchi_handoff.sql',
  '0024_first_party_automation.sql',
  '0025_owner_control_center_audit.sql',
  '0026_market_buyer_experience.sql',
  '0027_market_catalog_quality.sql',
  '0028_market_product_comparison.sql',
  '0029_market_checkout_comment.sql',
  '0030_market_telegram_reliability.sql',
] as const;

/** Names only. Values are never read into the report. */
export const REQUIRED_ENV_NAMES = [
  'TELEGRAM_AGENTS_BOT_TOKEN',
  'TELEGRAM_AGENTS_WEBHOOK_SECRET',
  'TELEGRAM_AGENTS_BOT_USERNAME',
] as const;

export const PILOT_LANDING_PAGES = [
  'content/pages/ru/sotuvchi.json',
  'content/pages/uz/sotuvchi.json',
] as const;

export type PilotCheckStatus = 'ok' | 'blocked';

export interface PilotCheckItem {
  id: string;
  ok: boolean;
  /** Content-free detail; never contains a secret or a token. */
  detail: string;
}

export interface PilotCheckReport {
  status: PilotCheckStatus;
  mode: 'read-only';
  items: readonly PilotCheckItem[];
}

export interface PilotCheckEnvironment {
  TELEGRAM_AGENTS_BOT_TOKEN?: string;
  TELEGRAM_AGENTS_WEBHOOK_SECRET?: string;
  TELEGRAM_AGENTS_BOT_USERNAME?: string;
  SITE_URL?: string;
}

export interface PilotCheckOptions {
  root?: string;
  botUsername?: string | null;
}

function envItems(environment: PilotCheckEnvironment): PilotCheckItem[] {
  return REQUIRED_ENV_NAMES.map((name) => {
    const present = typeof environment[name] === 'string'
      && (environment[name] as string).length > 0;
    return {
      id: `env:${name}`,
      ok: present,
      detail: present ? 'present' : 'missing',
    };
  });
}

function webhookItem(environment: PilotCheckEnvironment): PilotCheckItem {
  try {
    const url = buildTelegramAgentsWebhookUrl(
      environment.SITE_URL ?? 'https://gptbot.uz',
    );
    const ok = url.endsWith(TELEGRAM_AGENTS_WEBHOOK_PATH);
    return {
      id: 'webhook:url',
      ok,
      detail: ok ? url : 'unexpected endpoint path',
    };
  } catch {
    return { id: 'webhook:url', ok: false, detail: 'invalid SITE_URL' };
  }
}

function botIdentityItems(
  environment: PilotCheckEnvironment,
  landingUsername: string | null,
): PilotCheckItem[] {
  const configured = environment.TELEGRAM_AGENTS_BOT_USERNAME ?? '';
  const items: PilotCheckItem[] = [];

  const protectedHit = configured
    ? isProtectedAgentBotUsername(configured)
    : false;
  items.push({
    id: 'bot:not-protected',
    ok: Boolean(configured) && !protectedHit,
    detail: !configured
      ? 'TELEGRAM_AGENTS_BOT_USERNAME missing'
      : protectedHit
        ? 'refuses lead/Javob bot username'
        : 'distinct from lead and Javob bots',
  });

  const landingUsable = isUsableSotuvchiBotUsername(landingUsername);
  items.push({
    id: 'landing:bot-username',
    ok: landingUsable,
    detail: landingUsable
      ? 'public landing config has a usable username'
      : 'not set: landing CTA falls back to the on-page pilot section',
  });

  const matches = landingUsable
    && configured.toLowerCase() === String(landingUsername).toLowerCase();
  items.push({
    id: 'landing:matches-runtime',
    ok: matches,
    detail: matches
      ? 'landing CTA and runtime bot are the same namespace'
      : 'landing CTA does not yet point at the runtime bot',
  });

  const cta = sotuvchiSellerCtaHref(landingUsername);
  const deepLink = sotuvchiSellerStartUrl(landingUsername);
  const safeCta = deepLink === null
    ? cta.startsWith('#')
    : cta === deepLink && cta.endsWith(`?start=${SOTUVCHI_SELLER_START_PAYLOAD}`);
  items.push({
    id: 'landing:cta-safe',
    ok: safeCta,
    detail: safeCta ? cta : 'unsafe CTA target',
  });

  return items;
}

function fileItems(root: string): PilotCheckItem[] {
  const items: PilotCheckItem[] = PILOT_MIGRATIONS.map((name, index) => {
    const exists = fs.existsSync(path.join(root, 'migrations', name));
    return {
      id: `migration:${index + 1}:${name}`,
      ok: exists,
      detail: exists ? 'present (NOT applied by this script)' : 'missing',
    };
  });
  for (const page of PILOT_LANDING_PAGES) {
    const exists = fs.existsSync(path.join(root, page));
    items.push({
      id: `landing:${page}`,
      ok: exists,
      detail: exists ? 'present' : 'missing',
    });
  }
  return items;
}

export function runSotuvchiPilotCheck(
  environment: PilotCheckEnvironment,
  options: PilotCheckOptions = {},
): PilotCheckReport {
  const root = options.root ?? ROOT;
  const landingUsername = options.botUsername === undefined
    ? SOTUVCHI_BOT_USERNAME
    : options.botUsername;
  const items: PilotCheckItem[] = [
    ...envItems(environment),
    webhookItem(environment),
    ...botIdentityItems(environment, landingUsername),
    ...fileItems(root),
  ];
  return {
    status: items.every((item) => item.ok) ? 'ok' : 'blocked',
    mode: 'read-only',
    items,
  };
}

function print(report: PilotCheckReport, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('Sotuvchi pilot check (read-only, no network, no mutation)');
  for (const item of report.items) {
    console.log(`  [${item.ok ? 'ok' : '--'}] ${item.id}: ${item.detail}`);
  }
  console.log(`Result: ${report.status}`);
  if (report.status === 'blocked') {
    console.log(
      'Blocked items must be resolved before running the pilot runbook.',
    );
  }
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const report = runSotuvchiPilotCheck(process.env);
  print(report, process.argv.includes('--json'));
  // A blocked report is information, not a crash: exit 0 keeps this usable
  // inside a runbook step without pretending the pilot is ready.
  process.exitCode = 0;
}
