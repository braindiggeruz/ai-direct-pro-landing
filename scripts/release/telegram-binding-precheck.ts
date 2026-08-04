import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

interface D1Envelope {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
}

const DATABASE = 'gptbot-ai-drafts';
const REQUIRED_INDEX = 'idx_seller_binding_challenge_open';

const aggregateSql = `
SELECT
  (SELECT COUNT(*) FROM organizations) AS organizations_total,
  (SELECT COUNT(*) FROM organizations WHERE status = 'active') AS organizations_active,
  (SELECT COUNT(*) FROM sotuvchi_stores) AS stores_total,
  (SELECT COUNT(*) FROM sotuvchi_stores WHERE status = 'active') AS stores_active,
  (SELECT COUNT(*) FROM (
    SELECT org_id FROM sotuvchi_stores GROUP BY org_id HAVING COUNT(*) > 1
  )) AS orgs_with_multiple_stores,
  (SELECT COUNT(*) FROM memberships) AS memberships_total,
  (SELECT COUNT(*) FROM memberships
    WHERE role = 'owner' AND status = 'active') AS active_owner_memberships,
  (SELECT COUNT(*) FROM memberships m
    JOIN identities i ON i.id = m.identity_id
    WHERE m.role = 'owner' AND m.status = 'active' AND i.provider = 'telegram'
  ) AS active_telegram_owner_memberships,
  (SELECT COUNT(*) FROM (
    SELECT org_id, identity_id FROM memberships
    GROUP BY org_id, identity_id HAVING COUNT(*) > 1
  )) AS duplicate_membership_pairs,
  (SELECT COUNT(*) FROM organizations o
    WHERE o.status = 'active' AND (
      SELECT COUNT(*) FROM memberships m
      WHERE m.org_id = o.id AND m.role = 'owner' AND m.status = 'active'
    ) <> 1
  ) AS active_orgs_without_exactly_one_owner,
  (SELECT COUNT(*) FROM seller_identity_binding_challenges
    WHERE redeemed_at IS NULL
      AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) AS active_binding_challenges,
  (SELECT COUNT(*) FROM seller_identity_binding_challenges) AS binding_challenges_total,
  (SELECT COUNT(*) FROM seller_identity_binding_challenges
    WHERE redeemed_at IS NOT NULL) AS binding_challenges_redeemed,
  (SELECT COUNT(*) FROM owner_audit_events
    WHERE action = 'seller.bind') AS seller_bind_audit_events,
  (SELECT COUNT(*) FROM owner_audit_events
    WHERE action = 'seller.unbind') AS seller_unbind_audit_events,
  (SELECT COUNT(*) FROM d1_migrations) AS migration_ledger_count,
  (SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1) AS last_migration,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_violations,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type = 'index'
      AND tbl_name = 'seller_identity_binding_challenges'
      AND name = '${REQUIRED_INDEX}'
  ) AS required_binding_index_count;
`;

function flag(source: string, name: string): boolean {
  const match = source.match(new RegExp(`^${name}\\s*=\\s*"(true|false)"\\s*$`, 'm'));
  if (!match) throw new Error(`missing ${name} in wrangler.toml`);
  return match[1] === 'true';
}

function readAggregate(): Record<string, unknown> {
  const require = createRequire(import.meta.url);
  const wranglerCli = require.resolve('wrangler');
  const command = spawnSync(process.execPath, [
    wranglerCli,
    'd1',
    'execute',
    DATABASE,
    '--remote',
    '--command',
    aggregateSql,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

  // Wrangler output is intentionally captured and never echoed: error output
  // can contain an account-scoped D1 identifier that does not belong in
  // release evidence or CI logs.
  if (command.status !== 0) {
    const code = command.error && 'code' in command.error ? String(command.error.code) : 'none';
    throw new Error(
      `remote read-only D1 precheck failed (status=${String(command.status)}, signal=${String(command.signal)}, code=${code})`,
    );
  }

  let envelopes: D1Envelope[];
  try {
    envelopes = JSON.parse(command.stdout) as D1Envelope[];
  } catch {
    throw new Error('remote read-only D1 precheck returned invalid JSON');
  }

  const row = envelopes[0]?.results?.[0];
  if (envelopes[0]?.success !== true || !row) {
    throw new Error('remote read-only D1 precheck returned no aggregate row');
  }
  return row;
}

function number(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid aggregate ${key}`);
  }
  return value;
}

function main(): void {
  const config = readFileSync('wrangler.toml', 'utf8');
  const row = readAggregate();
  const aggregates = {
    organizationsTotal: number(row, 'organizations_total'),
    organizationsActive: number(row, 'organizations_active'),
    storesTotal: number(row, 'stores_total'),
    storesActive: number(row, 'stores_active'),
    orgsWithMultipleStores: number(row, 'orgs_with_multiple_stores'),
    membershipsTotal: number(row, 'memberships_total'),
    activeOwnerMemberships: number(row, 'active_owner_memberships'),
    activeTelegramOwnerMemberships: number(row, 'active_telegram_owner_memberships'),
    duplicateMembershipPairs: number(row, 'duplicate_membership_pairs'),
    activeOrgsWithoutExactlyOneOwner: number(row, 'active_orgs_without_exactly_one_owner'),
    activeBindingChallenges: number(row, 'active_binding_challenges'),
    bindingChallengesTotal: number(row, 'binding_challenges_total'),
    bindingChallengesRedeemed: number(row, 'binding_challenges_redeemed'),
    sellerBindAuditEvents: number(row, 'seller_bind_audit_events'),
    sellerUnbindAuditEvents: number(row, 'seller_unbind_audit_events'),
    migrationLedgerCount: number(row, 'migration_ledger_count'),
    lastMigration: String(row.last_migration ?? ''),
    foreignKeyViolations: number(row, 'foreign_key_violations'),
    requiredBindingIndexCount: number(row, 'required_binding_index_count'),
  };
  const flags = {
    sellerReads: flag(config, 'MARKET_MINI_APP_SELLER_READS_ENABLED'),
    sellerCommands: flag(config, 'MARKET_MINI_APP_SELLER_COMMANDS_ENABLED'),
    ownerTelegramBinding: flag(config, 'MARKET_OWNER_TELEGRAM_BINDING_ENABLED'),
    quickPost: flag(config, 'MARKET_QUICKPOST_ENABLED'),
    quickPostAi: flag(config, 'MARKET_QUICKPOST_AI_ENABLED'),
  };

  const blockers: string[] = [];
  if (aggregates.orgsWithMultipleStores !== 0) blockers.push('multiple stores for one organization');
  if (aggregates.duplicateMembershipPairs !== 0) blockers.push('duplicate membership pair');
  if (aggregates.activeOrgsWithoutExactlyOneOwner !== 0) blockers.push('active organization owner ambiguity');
  if (aggregates.activeBindingChallenges !== 0) blockers.push('active seller binding challenge');
  if (aggregates.foreignKeyViolations !== 0) blockers.push('foreign-key violation');
  if (aggregates.requiredBindingIndexCount !== 1) blockers.push('binding challenge index mismatch');
  if (!flags.sellerReads || !flags.sellerCommands) blockers.push('seller authority flags are disabled');
  if (flags.ownerTelegramBinding || flags.quickPost || flags.quickPostAi) {
    blockers.push('owner-only feature flag is enabled before the ceremony');
  }

  console.log(JSON.stringify({
    verdict: blockers.length === 0 ? 'READY_FOR_OWNER_CEREMONY' : 'BLOCKED',
    scope: 'aggregate-only remote D1 precheck',
    flags,
    aggregates,
    blockers,
    ownerApiMembership: 'OWNER_SESSION_REQUIRED',
  }, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'telegram binding precheck failed');
  process.exitCode = 1;
}
