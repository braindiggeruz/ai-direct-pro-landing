import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  assertLeadRadarAuditQueryIsReadOnly,
  auditLeadRadarSchema,
  type LeadRadarSchemaProfile,
  type LeadRadarSchemaReader,
} from '../../functions/platform/lead-radar/schema-contract';

interface CliOptions {
  database: string;
  location: 'remote' | 'local';
  profile: LeadRadarSchemaProfile;
  config: string | null;
}

interface D1Envelope {
  success?: boolean;
  results?: Array<Record<string, unknown>>;
}

const DATABASE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    database: 'gptbot-ai-drafts',
    location: 'remote',
    profile: 'auto',
    config: null,
  };
  let locationSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--database') {
      const value = argv[index + 1];
      if (!value || !DATABASE_NAME.test(value)) throw new Error('invalid --database');
      options.database = value;
      index += 1;
    } else if (argument === '--profile') {
      const value = argv[index + 1];
      if (value !== 'target' && value !== 'production-preflight' && value !== 'auto') {
        throw new Error('invalid --profile');
      }
      options.profile = value;
      index += 1;
    } else if (argument === '--config') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('invalid --config');
      options.config = value;
      index += 1;
    } else if (argument === '--remote' || argument === '--local') {
      if (locationSeen) throw new Error('choose exactly one of --remote or --local');
      locationSeen = true;
      options.location = argument === '--remote' ? 'remote' : 'local';
    } else {
      throw new Error(`unknown argument: ${argument ?? ''}`);
    }
  }
  return options;
}

function wranglerReader(options: CliOptions): LeadRadarSchemaReader {
  const require = createRequire(import.meta.url);
  const wranglerCli = require.resolve('wrangler');
  return {
    async query(sql) {
      assertLeadRadarAuditQueryIsReadOnly(sql);
      const args = [
        wranglerCli,
        'd1',
        'execute',
        options.database,
        `--${options.location}`,
        '--command',
        sql,
        '--json',
      ];
      if (options.config) args.push('--config', options.config);
      const command = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      // Captured stderr/stdout are never relayed on failure: Wrangler output can
      // contain an account-scoped D1 identifier.
      if (command.status !== 0 || command.error) {
        throw new Error('lead_radar_schema_audit_remote_query_failed');
      }
      let envelopes: D1Envelope[];
      try {
        envelopes = JSON.parse(command.stdout) as D1Envelope[];
      } catch {
        throw new Error('lead_radar_schema_audit_invalid_json');
      }
      if (envelopes.length !== 1 || envelopes[0]?.success !== true || !Array.isArray(envelopes[0].results)) {
        throw new Error('lead_radar_schema_audit_invalid_envelope');
      }
      return envelopes[0].results;
    },
  };
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch {
    console.log(JSON.stringify({
      status: 'blocked',
      readOnly: true,
      contractVersion: 'lead-radar-schema-v2',
      issues: [{ code: 'invalid_arguments', object: 'cli' }],
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  const report = await auditLeadRadarSchema(
    wranglerReader(options),
    options.profile,
    options.location === 'remote' ? 'quick_check' : 'integrity_check',
  );
  console.log(JSON.stringify({
    ...report,
    scope: {
      database: options.database,
      location: options.location,
    },
  }, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

await main();
