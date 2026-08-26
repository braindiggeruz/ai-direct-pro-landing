import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { build } from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVICE_SCHEMA = 'gptbot.lead-radar.telegram-account-service.v1';
const CONTAINER_SCHEMA = 'gptbot.lead-radar.tdlib-container.v1';
const ACCOUNT_ORIGIN = 'https://lead-radar-telegram-account-do.internal';
const ORG_ID = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACCOUNT_REF = `lracct_${'A'.repeat(43)}`;

type DurableAccount = {
  fetch(request: Request): Promise<Response>;
  alarm(): Promise<void>;
};

class MemoryStorage {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const [key, value] of this.values) {
      if (options?.prefix && !key.startsWith(options.prefix)) continue;
      result.set(key, value as T);
      if (options?.limit && result.size >= options.limit) break;
    }
    return result;
  }

  async transaction<T>(operation: (transaction: MemoryStorage) => Promise<T>): Promise<T> {
    return operation(this);
  }

  async setAlarm(value: number | Date): Promise<void> {
    this.alarmAt = value instanceof Date ? value.getTime() : value;
  }

  async deleteAlarm(): Promise<void> {
    this.alarmAt = null;
  }
}

class MemoryR2 {
  readonly values = new Map<string, Uint8Array>();

  async get(key: string): Promise<{ body: Uint8Array; httpMetadata: { contentType: string } } | null> {
    const value = this.values.get(key);
    return value ? { body: value, httpMetadata: { contentType: 'application/octet-stream' } } : null;
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView): Promise<void> {
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.values.set(key, new Uint8Array(bytes));
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class FakeTdlibContainer {
  running = false;
  state: 'not_started' | 'awaiting_phone' | 'awaiting_qr' | 'connected' | 'revoked' = 'not_started';
  readonly bootId: string;
  disconnectFailures = 0;
  disconnectCalls = 0;
  destroyCalls = 0;

  constructor(sequence: number) {
    this.bootId = `fixture_boot_${String(sequence).padStart(8, '0')}`;
  }

  start(): void {
    this.running = true;
  }

  getTcpPort(): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } {
    return { fetch: (input) => this.fetch(input) };
  }

  async destroy(): Promise<void> {
    this.destroyCalls += 1;
    this.running = false;
    this.state = 'revoked';
  }

  private stateEnvelope(): Record<string, unknown> {
    return {
      schema: CONTAINER_SCHEMA,
      status: this.state,
      ...(this.state === 'awaiting_qr' ? {
        qr_code_data_url: 'data:image/png;base64,AAAA',
        qr_login_url: 'tg://login?token=fixture_token_1234567890',
      } : {}),
      ...(this.state === 'connected' ? {
        masked_label: 'T•••',
        identity_verified_at: new Date().toISOString(),
      } : {}),
    };
  }

  private async fetch(input: RequestInfo | URL): Promise<Response> {
    const pathname = new URL(String(input)).pathname;
    if (pathname === '/v1/health') {
      return Response.json({
        schema: CONTAINER_SCHEMA,
        status: 'ok',
        boot_id: this.bootId,
        client_state: this.state,
      });
    }
    if (pathname === '/v1/auth/start') {
      this.state = 'awaiting_phone';
      return Response.json(this.stateEnvelope());
    }
    if (pathname === '/v1/auth/qr') {
      this.state = 'awaiting_qr';
      return Response.json(this.stateEnvelope());
    }
    if (pathname === '/v1/auth/state') return Response.json(this.stateEnvelope());
    if (pathname === '/v1/session/export') {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }
    if (pathname === '/v1/session/import') {
      return Response.json({ schema: CONTAINER_SCHEMA, status: 'imported' });
    }
    if (pathname === '/v1/account/disconnect') {
      this.disconnectCalls += 1;
      if (this.disconnectFailures > 0) {
        this.disconnectFailures -= 1;
        return Response.json({
          schema: CONTAINER_SCHEMA,
          status: 'error',
          reason_code: 'fixture_revoke_unavailable',
        }, { status: 503 });
      }
      this.state = 'revoked';
      return Response.json({ schema: CONTAINER_SCHEMA, status: 'revoked' });
    }
    return Response.json({
      schema: CONTAINER_SCHEMA,
      status: 'error',
      reason_code: 'not_found',
    }, { status: 404 });
  }
}

let accountClassPromise: Promise<new (ctx: unknown, env: unknown) => DurableAccount> | null = null;

async function accountClass(): Promise<new (ctx: unknown, env: unknown) => DurableAccount> {
  accountClassPromise ??= (async () => {
    const built = await build({
      entryPoints: [path.join(ROOT, 'workers/lead-radar-telegram-account/account-object.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2023',
      write: false,
      plugins: [{
        name: 'cloudflare-workers-test-double',
        setup(builder) {
          builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
            path: 'cloudflare-workers-test-double',
            namespace: 'test-double',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'test-double' }, () => ({
            contents: `export class DurableObject {
              constructor(ctx, env) { this.ctx = ctx; this.env = env; }
            }`,
            loader: 'js',
          }));
        },
      }],
    });
    const encoded = Buffer.from(built.outputFiles[0]?.contents ?? new Uint8Array()).toString('base64');
    const imported = await import(`data:text/javascript;base64,${encoded}`) as {
      LeadRadarTelegramAccount: new (ctx: unknown, env: unknown) => DurableAccount;
    };
    return imported.LeadRadarTelegramAccount;
  })();
  return accountClassPromise;
}

function fixture(sequence = 1, existing?: {
  storage: MemoryStorage;
  bucket: MemoryR2;
}): {
  storage: MemoryStorage;
  bucket: MemoryR2;
  container: FakeTdlibContainer;
  ctx: { storage: MemoryStorage; container: FakeTdlibContainer };
  env: Record<string, unknown>;
} {
  const storage = existing?.storage ?? new MemoryStorage();
  const bucket = existing?.bucket ?? new MemoryR2();
  const container = new FakeTdlibContainer(sequence);
  return {
    storage,
    bucket,
    container,
    ctx: { storage, container },
    env: {
      TELEGRAM_SESSION_BUCKET: bucket,
      TELEGRAM_ACCOUNTS: {},
      LEAD_RADAR_TELEGRAM_API_ID: '123456',
      LEAD_RADAR_TELEGRAM_API_HASH: 'a'.repeat(32),
      LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY: Buffer.alloc(32, 7).toString('base64url'),
      LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY: Buffer.alloc(32, 8).toString('base64url'),
      LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION: 'v1',
      LEAD_RADAR_TELEGRAM_TDLIB_SOURCE_COMMIT: 'd1085f9cebc5a62379991ae1652673954f229c1f',
      LEAD_RADAR_TELEGRAM_GATEWAY_VERSION: '1.0.0',
    },
  };
}

async function newAccount(f: ReturnType<typeof fixture>): Promise<DurableAccount> {
  const Account = await accountClass();
  return new Account(f.ctx, f.env);
}

async function post(
  account: DurableAccount,
  pathname: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return account.fetch(new Request(`${ACCOUNT_ORIGIN}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }));
}

async function begin(account: DurableAccount, operationId: string): Promise<string> {
  const response = await post(account, '/internal/accounts/connect/qr', {
    schema: SERVICE_SCHEMA,
    org_id: ORG_ID,
    operation_id: operationId,
    account_ref: ACCOUNT_REF,
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { auth_id: string };
  assert.match(body.auth_id, /^auth_[A-Za-z0-9_-]+$/u);
  return body.auth_id;
}

function expireProvisional(storage: MemoryStorage): void {
  const marker = storage.values.get('auth:provisional:v1') as {
    expiresAt: string;
  } | undefined;
  assert.ok(marker);
  storage.values.set('auth:provisional:v1', {
    ...marker,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });
}

async function pollConnected(account: DurableAccount, authId: string): Promise<Response> {
  return post(account, '/internal/accounts/connect/state', {
    schema: SERVICE_SCHEMA,
    org_id: ORG_ID,
    auth_id: authId,
  });
}

test('abandoned scanned QR is revoked by its provisional custody alarm without polling', async () => {
  const f = fixture(1);
  const account = await newAccount(f);
  await begin(account, 'operation_alarm_no_poll_0001');
  f.container.state = 'connected';
  expireProvisional(f.storage);

  await account.alarm();

  assert.equal(f.container.disconnectCalls, 1);
  assert.equal(f.container.destroyCalls, 1);
  assert.equal(f.storage.values.has('account:v1'), false);
  assert.equal(f.storage.values.has('auth:provisional:v1'), false);
  assert.equal(f.storage.alarmAt, null);
});

test('provider connection left by a D1/finalize failure remains provisional and is revoked', async () => {
  const f = fixture(2);
  const account = await newAccount(f);
  const authId = await begin(account, 'operation_alarm_d1_failure_0001');
  f.container.state = 'connected';
  assert.equal((await pollConnected(account, authId)).status, 200);
  assert.equal((f.storage.values.get('account:v1') as { status: string }).status, 'connected');
  assert.equal(f.storage.values.has('auth:provisional:v1'), true);
  expireProvisional(f.storage);

  await account.alarm();

  assert.equal(f.container.disconnectCalls, 1);
  assert.equal(f.storage.values.has('account:v1'), false);
  assert.equal(f.bucket.values.size, 0);
});

test('provisional custody survives Durable Object and container restart', async () => {
  const first = fixture(3);
  const firstAccount = await newAccount(first);
  await begin(firstAccount, 'operation_alarm_restart_0001');
  first.container.state = 'connected';
  expireProvisional(first.storage);

  const restarted = fixture(4, { storage: first.storage, bucket: first.bucket });
  restarted.container.state = 'connected';
  const restartedAccount = await newAccount(restarted);
  await restartedAccount.alarm();

  assert.equal(restarted.container.running, false);
  assert.equal(restarted.container.disconnectCalls, 1);
  assert.equal(restarted.storage.values.has('auth:provisional:v1'), false);
  assert.equal(restarted.storage.values.has('account:v1'), false);
});

test('unconfirmed provisional revoke retains custody and retries before cleanup', async () => {
  const f = fixture(5);
  const account = await newAccount(f);
  await begin(account, 'operation_alarm_retry_0001');
  f.container.state = 'connected';
  f.container.disconnectFailures = 1;
  expireProvisional(f.storage);

  await account.alarm();
  const retained = f.storage.values.get('auth:provisional:v1') as { retryCount: number };
  assert.equal(retained.retryCount, 1);
  assert.equal(f.storage.values.has('account:v1'), true);
  assert.ok((f.storage.alarmAt ?? 0) > Date.now());
  assert.equal(f.container.destroyCalls, 0);

  await account.alarm();
  assert.equal(f.container.disconnectCalls, 2);
  assert.equal(f.storage.values.has('auth:provisional:v1'), false);
  assert.equal(f.storage.values.has('account:v1'), false);
});

test('finalize atomically clears provisional custody and a stale alarm cannot revoke', async () => {
  const f = fixture(6);
  const account = await newAccount(f);
  const authId = await begin(account, 'operation_alarm_finalize_0001');
  f.container.state = 'connected';
  assert.equal((await pollConnected(account, authId)).status, 200);
  const finalized = await post(account, '/internal/accounts/connect/finalize', {
    schema: SERVICE_SCHEMA,
    org_id: ORG_ID,
    auth_id: authId,
  });
  assert.equal(finalized.status, 204);
  assert.equal(f.storage.values.has('auth:provisional:v1'), false);
  assert.equal(f.storage.alarmAt, null);

  await account.alarm();

  assert.equal(f.container.disconnectCalls, 0);
  assert.equal((f.storage.values.get('account:v1') as { status: string }).status, 'connected');
});
