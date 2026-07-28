import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isUsableSotuvchiBotUsername } from '../../src/shared/sotuvchi-config';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CONTRACT_PATH = path.join(ROOT, 'config', 'production-env.schema.json');

export interface EnvironmentVariableContract {
  name: string;
  runtime: string;
  required_for_r1: boolean;
  secret: boolean;
  kind: string;
  purpose: string;
  validation: string;
  owner: string;
}

export interface EnvironmentContract {
  version: number;
  value_policy: 'names_only';
  placeholder_markers: string[];
  bot_identities: Record<string, {
    transport: string;
    webhook_secret: string;
    business_flow: string;
    shared_transport_with?: string;
    canonical_start_payload?: string;
  }>;
  variables: EnvironmentVariableContract[];
}

export interface ContractCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface EnvironmentReport {
  status: 'pass' | 'blocked';
  mode: 'structure' | 'r1';
  checks: ContractCheck[];
}

export function loadEnvironmentContract(): EnvironmentContract {
  return JSON.parse(
    fs.readFileSync(CONTRACT_PATH, 'utf8'),
  ) as EnvironmentContract;
}

export function validateContractStructure(
  contract = loadEnvironmentContract(),
): EnvironmentReport {
  const checks: ContractCheck[] = [];
  const names = contract.variables.map((item) => item.name);
  const uniqueNames = new Set(names);
  checks.push({
    name: 'contract:value-policy',
    ok: contract.value_policy === 'names_only',
    detail: contract.value_policy === 'names_only'
      ? 'names_only'
      : 'invalid',
  });
  checks.push({
    name: 'contract:unique-names',
    ok: uniqueNames.size === names.length,
    detail: uniqueNames.size === names.length ? 'unique' : 'duplicate',
  });
  for (const item of contract.variables) {
    const complete = Boolean(
      item.name
      && item.runtime
      && item.kind
      && item.purpose
      && item.validation
      && item.owner
      && typeof item.required_for_r1 === 'boolean'
      && typeof item.secret === 'boolean',
    );
    checks.push({
      name: `contract:${item.name}`,
      ok: complete,
      detail: complete ? 'defined' : 'invalid-definition',
    });
  }
  const bots = contract.bot_identities;
  const isolated = (
    bots.lead.transport !== bots.javob.transport
    && bots.lead.transport !== bots.agents.transport
    && bots.javob.transport !== bots.agents.transport
    && bots.lead.webhook_secret !== bots.javob.webhook_secret
    && bots.lead.webhook_secret !== bots.agents.webhook_secret
    && bots.javob.webhook_secret !== bots.agents.webhook_secret
    && bots.tahlil.shared_transport_with === 'javob'
    && bots.tahlil.business_flow !== bots.javob.business_flow
    && bots.agents.canonical_start_payload === 'agent_seller'
  );
  checks.push({
    name: 'contract:bot-boundaries',
    ok: isolated,
    detail: isolated ? 'separated' : 'crossed',
  });
  return {
    status: checks.every((check) => check.ok) ? 'pass' : 'blocked',
    mode: 'structure',
    checks,
  };
}

function isPlaceholder(value: string, markers: readonly string[]): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || markers.some((marker) =>
    normalized.includes(marker.toLowerCase()));
}

function validHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
    );
  } catch {
    return false;
  }
}

function validKind(
  item: EnvironmentVariableContract,
  value: string,
): boolean {
  switch (item.kind) {
    case 'https_url':
      return validHttpsUrl(value);
    case 'https_url_list':
      return value.split(',').every((entry) => validHttpsUrl(entry.trim()));
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
    case 'telegram_username':
      return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value.replace(/^@/, ''));
    case 'telegram_token':
      return /^\d{8,10}:[A-Za-z0-9_-]{30,}$/.test(value);
    case 'telegram_chat_id':
      return /^-?\d+$/.test(value);
    case 'port': {
      const port = Number(value);
      return Number.isInteger(port) && port > 0 && port <= 65_535;
    }
    case 'pbkdf2_hash':
      return /^pbkdf2_sha256\$100000\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/
        .test(value);
    case 'environment_name':
      return value === 'production';
    case 'model_id':
      return /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(value);
    case 'identifier':
      return /^[A-Za-z0-9._/-]+$/.test(value);
    case 'opaque':
      return value.length >= 24;
    case 'forbidden_production_fallback':
      return false;
    default:
      return true;
  }
}

export function validateProductionEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  contract = loadEnvironmentContract(),
): EnvironmentReport {
  const structure = validateContractStructure(contract);
  const checks = [...structure.checks];
  for (const item of contract.variables) {
    const value = environment[item.name];
    const present = typeof value === 'string' && value.length > 0;
    if (item.kind === 'forbidden_production_fallback') {
      checks.push({
        name: `env:${item.name}`,
        ok: !present,
        detail: present ? 'forbidden-in-production' : 'absent',
      });
      continue;
    }
    if (!present) {
      checks.push({
        name: `env:${item.name}`,
        ok: !item.required_for_r1,
        detail: item.required_for_r1 ? 'missing' : 'optional-absent',
      });
      continue;
    }
    const placeholder = isPlaceholder(value, contract.placeholder_markers);
    const shape = !placeholder && validKind(item, value);
    checks.push({
      name: `env:${item.name}`,
      ok: shape,
      detail: placeholder ? 'placeholder-rejected' : shape ? 'present' : 'invalid-shape',
    });
  }

  const agentsUsername = environment.TELEGRAM_AGENTS_BOT_USERNAME;
  checks.push({
    name: 'env:agents-identity',
    ok: isUsableSotuvchiBotUsername(agentsUsername),
    detail: isUsableSotuvchiBotUsername(agentsUsername)
      ? 'approved'
      : 'missing-or-forbidden',
  });

  const credentialNames = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ASSISTANT_BOT_TOKEN',
    'TELEGRAM_AGENTS_BOT_TOKEN',
  ] as const;
  const configuredTokens = credentialNames
    .map((name) => environment[name])
    .filter((value): value is string => Boolean(value));
  const uniqueTokens = new Set(configuredTokens);
  checks.push({
    name: 'env:telegram-token-separation',
    ok: uniqueTokens.size === configuredTokens.length,
    detail: uniqueTokens.size === configuredTokens.length
      ? 'separated'
      : 'credential-reuse-rejected',
  });

  const webhookNames = [
    'TELEGRAM_WEBHOOK_SECRET',
    'TELEGRAM_ASSISTANT_WEBHOOK_SECRET',
    'TELEGRAM_AGENTS_WEBHOOK_SECRET',
  ] as const;
  const configuredSecrets = webhookNames
    .map((name) => environment[name])
    .filter((value): value is string => Boolean(value));
  checks.push({
    name: 'env:telegram-webhook-separation',
    ok: new Set(configuredSecrets).size === configuredSecrets.length,
    detail: new Set(configuredSecrets).size === configuredSecrets.length
      ? 'separated'
      : 'credential-reuse-rejected',
  });

  return {
    status: checks.every((check) => check.ok) ? 'pass' : 'blocked',
    mode: 'r1',
    checks,
  };
}

function printReport(report: EnvironmentReport): void {
  for (const check of report.checks) {
    console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.name} ${check.detail}`);
  }
  console.log(`ENV_CONTRACT=${report.status.toUpperCase()}`);
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const mode = process.argv.includes('--check-r1') ? 'r1' : 'structure';
  const report = mode === 'r1'
    ? validateProductionEnvironment(process.env)
    : validateContractStructure();
  printReport(report);
  if (report.status !== 'pass') process.exitCode = 1;
}
