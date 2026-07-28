import { pathToFileURL } from 'node:url';

export type SmokeMode =
  | 'predeploy'
  | 'postdeploy-read-only'
  | 'postdeploy-controlled-write';

export interface SmokeOptions {
  mode?: SmokeMode;
  baseUrl?: string;
  apply?: boolean;
  testTenant?: string;
}

export interface SmokeReport {
  status: 'pass' | 'blocked';
  mode: SmokeMode;
  writesPerformed: false;
  checks: { name: string; ok: boolean; detail: string }[];
}

export async function runSmoke(options: SmokeOptions = {}): Promise<SmokeReport> {
  const mode = options.mode ?? 'predeploy';
  const checks: SmokeReport['checks'] = [];
  if (mode === 'predeploy') {
    checks.push(
      { name: 'mode', ok: true, detail: 'local-read-only' },
      { name: 'production-order', ok: true, detail: 'not-created' },
    );
  } else if (mode === 'postdeploy-read-only') {
    let url: URL | undefined;
    try {
      url = new URL(options.baseUrl ?? '');
    } catch {
      url = undefined;
    }
    const valid = url?.protocol === 'https:';
    checks.push({
      name: 'base-url',
      ok: valid,
      detail: valid ? 'https' : 'missing-or-invalid',
    });
    if (valid && url) {
      for (const route of ['/', '/robots.txt', '/api/auth/config']) {
        try {
          const response = await fetch(new URL(route, url), {
            method: 'GET',
            redirect: 'manual',
          });
          checks.push({
            name: `route:${route}`,
            ok: response.status >= 200 && response.status < 500,
            detail: `http-${response.status}`,
          });
        } catch {
          checks.push({
            name: `route:${route}`,
            ok: false,
            detail: 'request-failed',
          });
        }
      }
    }
  } else {
    const explicit = options.apply === true;
    const isolated = Boolean(
      options.testTenant
      && /^pilot-test-[a-z0-9-]+$/.test(options.testTenant),
    );
    checks.push(
      {
        name: 'controlled-write:explicit-apply',
        ok: explicit,
        detail: explicit ? 'present' : 'required',
      },
      {
        name: 'controlled-write:test-tenant',
        ok: isolated,
        detail: isolated ? 'isolated' : 'required',
      },
      {
        name: 'controlled-write:implementation',
        ok: false,
        detail: 'production-order-creation-not-implemented',
      },
    );
  }
  return {
    status: checks.every((check) => check.ok) ? 'pass' : 'blocked',
    mode,
    writesPerformed: false,
    checks,
  };
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const modeArgument = process.argv.find((argument) =>
    argument.startsWith('--mode='))?.slice('--mode='.length) as SmokeMode | undefined;
  const baseUrl = process.argv.find((argument) =>
    argument.startsWith('--base-url='))?.slice('--base-url='.length);
  const testTenant = process.argv.find((argument) =>
    argument.startsWith('--test-tenant='))?.slice('--test-tenant='.length);
  const report = await runSmoke({
    mode: modeArgument,
    baseUrl,
    testTenant,
    apply: process.argv.includes('--apply'),
  });
  for (const check of report.checks) {
    console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.name} ${check.detail}`);
  }
  console.log(`SMOKE=${report.status.toUpperCase()}`);
  if (report.status !== 'pass') process.exitCode = 1;
}
