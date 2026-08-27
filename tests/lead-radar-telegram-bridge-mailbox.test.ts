import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { pollTelegramAccountConnection } from '../functions/platform/lead-radar/telegram-account-service';

const schema = 'gptbot.lead-radar.telegram-account-service.v1';
const orgId = `org_${'a'.repeat(32)}`;
const deviceId = `lrtgbd_${'1'.repeat(32)}`;
const accountRef = `lracct_${'A'.repeat(43)}`;
const envelope = { alg: 'RSA-OAEP-256+A256GCM', key_id: '4'.repeat(64), wrapped_key: 'D'.repeat(342), iv: 'E'.repeat(16), ciphertext: 'F'.repeat(64) };
// The bundled DO is loaded dynamically; storage values are heterogeneous JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

class Storage {
  values = new Map<string, Row | string>();
  alarm: number | null = null;
  async get(key: string) { return structuredClone(this.values.get(key)); }
  async put(key: string | Row, value?: unknown) {
    for (const [name, item] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) this.values.set(name, structuredClone(item));
  }
  async delete(key: string | string[]) { for (const name of Array.isArray(key) ? key : [key]) this.values.delete(name); }
  async list(options: { prefix?: string; startAfter?: string; limit?: number } = {}) {
    return new Map([...this.values].sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => (!options.prefix || key.startsWith(options.prefix)) && (!options.startAfter || key > options.startAfter))
      .slice(0, options.limit ?? Infinity).map(([key, value]) => [key, structuredClone(value)]));
  }
  async transaction<T>(fn: (storage: Storage) => Promise<T>) { return fn(this); }
  async getAlarm() { return this.alarm; }
  async setAlarm(value: number) { this.alarm = value; }
}

const bundled = build({
  entryPoints: ['workers/lead-radar-telegram-account/bridge-mailbox.ts'], bundle: true, write: false,
  format: 'esm', platform: 'neutral', target: 'es2023',
  plugins: [{ name: 'durable-runtime', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'runtime', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export class DurableObject { constructor(ctx,env) { this.ctx=ctx; this.env=env; } }', loader: 'js' }));
  } }],
}).then(async result => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`));

async function fixture() {
  const { LeadRadarTelegramBridgeMailbox } = await bundled;
  const storage = new Storage();
  const device = { version: 1, deviceId, orgId, accountRef, state: 'online', bridgeVersion: '1.2.0', lastSeenAt: new Date().toISOString(), encryptionKeyId: envelope.key_id, encryptionPublicKeySpki: 'A'.repeat(400) };
  await storage.put(`bridge:device:${deviceId}`, device);
  await storage.put(`bridge:org-device:${orgId}`, deviceId);
  const mailbox = new LeadRadarTelegramBridgeMailbox({ storage }, {
    LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY: Buffer.alloc(32, 8).toString('base64url'),
    LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY: Buffer.alloc(32, 9).toString('base64url'),
  });
  // Interactive routes must never wait for a desktop response in an HTTP request.
  mailbox.waitTerminal = async () => { throw new Error('synchronous auth wait'); };
  const call = (action: string, body: Row) => mailbox.fetch(new Request(`https://lead-radar-telegram-account-do.internal/internal/accounts/connect/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema, org_id: orgId, ...body }),
  })) as Promise<Response>;
  const start = await call('phone/start', { account_ref: accountRef, operation_id: 'operation_fixture_1234' });
  assert.equal(start.status, 200, await start.clone().text());
  const initial = await start.json() as Row;
  const authId = initial.auth_id;
  const result = async (commandId: string, status: string, code: string, data: Row) => {
    const command = await storage.get(`bridge:command:${commandId}`);
    assert.ok(command, 'command persisted before delivery');
    await mailbox.applyResult(command, { status, result_code: code, result: data }, `test-result:${commandId}`, 'digest');
    await storage.put(`bridge:command:${commandId}`, { ...command, status, lastSequence: 1 });
  };
  const state = async () => {
    const service = { fetch: () => call('state', { auth_id: authId }) } as unknown as Fetcher;
    return pollTelegramAccountConnection({ service, internalServiceToken: 't'.repeat(43), orgId, authId });
  };
  await result(initial.bridge_command_id, 'succeeded', 'awaiting_phone', {
    auth_id: authId, auth_state: 'awaiting_phone', expires_at: initial.expires_at,
  });
  await call('adopt', { auth_id: authId });
  return { mailbox, storage, device, authId, initial, call, result, state };
}

test('production mailbox → Pages parser accepts real ten-minute phone/code/2FA stages without synchronous waits', async () => {
  const f = await fixture();
  let state = await f.state();
  assert.equal(state.status, 'connecting');
  assert.ok('authState' in state && state.authState === 'awaiting_phone');
  assert.ok(Date.parse(state.expiresAt) - Date.now() > 500_000);
  const phoneId = state.inputCommandId!;
  const body = { auth_id: f.authId, input_command_id: phoneId, input_action: 'phone', input_envelope: envelope };
  assert.equal((await f.call('input', body)).status, 200);
  assert.equal((await f.call('input', body)).status, 200, 'exact retry reuses accepted command');
  state = await f.state();
  assert.ok('pendingAction' in state && state.pendingAction === 'phone');
  assert.equal([...f.storage.values.values()].filter(v => v?.kind === 'submit_auth').length, 1);
  await f.result(phoneId, 'succeeded', 'awaiting_code', { auth_id: f.authId, auth_state: 'awaiting_code', expires_at: f.initial.expires_at });
  state = await f.state();
  assert.ok('authState' in state && state.authState === 'awaiting_code');
  assert.equal(state.pendingAction, null);
  const codeId = state.inputCommandId!;
  assert.equal((await f.call('input', { ...body, input_command_id: codeId, input_action: 'code' })).status, 200);
  await f.result(codeId, 'succeeded', 'awaiting_password', { auth_id: f.authId, auth_state: 'awaiting_password', expires_at: f.initial.expires_at });
  state = await f.state();
  assert.ok('authState' in state && state.authState === 'awaiting_password');
  const passwordId = state.passwordCommandId!;
  assert.equal((await f.call('password', { auth_id: f.authId, password_command_id: passwordId, password_envelope: envelope })).status, 200);
  state = await f.state();
  assert.ok('pendingAction' in state && state.pendingAction === 'password');
  await f.result(passwordId, 'succeeded', 'connected', { auth_id: f.authId, account_ref: accountRef, masked_label: '@c•••z', connected_at: new Date().toISOString() });
  assert.equal((await f.call('finalize', { auth_id: f.authId })).status, 202);
  assert.equal((await f.call('finalize', { auth_id: f.authId })).status, 202);
  assert.equal((await f.storage.get(`bridge:account:${accountRef}`)).finalized, false);
  const probes = [...f.storage.values.values()].filter(v => v?.kind === 'probe');
  assert.equal(probes.length, 1, 'polling must not duplicate finalization');
  await f.result(probes[0].commandId, 'succeeded', 'probed', { account_ref: accountRef, state: 'connected', masked_label: '@c•••z', checked_at: new Date().toISOString() });
  assert.equal((await f.call('finalize', { auth_id: f.authId })).status, 204);
  assert.equal((await f.storage.get(`bridge:account:${accountRef}`)).finalized, true);
});

test('production mailbox rejects cross-tenant input and never downgrades to a fake short-lived fixture', async () => {
  const f = await fixture();
  const state = await f.state();
  assert.ok('inputCommandId' in state);
  assert.equal((await f.call('input', { org_id: `org_${'b'.repeat(32)}`, auth_id: f.authId, input_command_id: state.inputCommandId, input_action: 'phone', input_envelope: envelope })).status, 409);
  assert.equal([...f.storage.values.values()].filter(v => v?.kind === 'submit_auth').length, 0);
});

test('local auth validation failure is acknowledged and closes the one-use command without a provider retry', async () => {
  const f = await fixture();
  let state = await f.state();
  const phoneId = state.inputCommandId!;
  assert.equal((await f.call('input', {
    auth_id: f.authId,
    input_command_id: phoneId,
    input_action: 'phone',
    input_envelope: envelope,
  })).status, 200);
  await f.result(phoneId, 'failed', 'local_validation_failed', {});
  state = await f.state();
  assert.equal(state.status, 'error');
  assert.equal(state.reasonCode, 'bridge_input_rejected');
  assert.equal(state.inputCommandId ?? null, null);
  assert.equal('pendingAction' in state ? state.pendingAction : null, null);
});

test('local 2FA validation failure is acknowledged and rotates only the password slot', async () => {
  const f = await fixture();
  let state = await f.state();
  const phoneId = state.inputCommandId!;
  assert.equal((await f.call('input', {
    auth_id: f.authId, input_command_id: phoneId, input_action: 'phone', input_envelope: envelope,
  })).status, 200);
  await f.result(phoneId, 'succeeded', 'awaiting_code', {
    auth_id: f.authId, auth_state: 'awaiting_code', expires_at: f.initial.expires_at,
  });
  state = await f.state();
  const codeId = state.inputCommandId!;
  assert.equal((await f.call('input', {
    auth_id: f.authId, input_command_id: codeId, input_action: 'code', input_envelope: envelope,
  })).status, 200);
  await f.result(codeId, 'succeeded', 'awaiting_password', {
    auth_id: f.authId, auth_state: 'awaiting_password', expires_at: f.initial.expires_at,
  });
  state = await f.state();
  const passwordId = state.passwordCommandId!;
  assert.equal((await f.call('password', {
    auth_id: f.authId, password_command_id: passwordId, password_envelope: envelope,
  })).status, 200);
  await f.result(passwordId, 'failed', 'local_validation_failed', {});
  state = await f.state();
  assert.equal(state.status, 'connecting');
  assert.equal(state.authState, 'awaiting_password');
  assert.equal(state.reasonCode, 'bridge_password_input_rejected');
  assert.equal(state.pendingAction, null);
  assert.notEqual(state.passwordCommandId, passwordId);
  assert.match(state.passwordCommandId, /^lrtgbc_[a-f0-9]{32}$/u);
});

test('fast auth polling is version-compatible and returns to idle pacing', async () => {
  const f = await fixture();
  f.mailbox.nextCommand = async () => null;
  const poll = async (version: string) => {
    const response = await f.mailbox.poll(new Request('https://bridge.example/v1/bridge/poll'), {
      device: { ...f.device, bridgeVersion: version },
      verified: { body: { schema: 'gptbot.lead-radar.telegram-bridge.v1', version, capabilities: ['qr', 'phone_code', 'two_factor_password', 'text', 'image'] }, deviceSecret: new Uint8Array(32), nonce: 'n'.repeat(24) },
    });
    return response.json();
  };
  assert.equal((await poll('1.1.2')).poll_after_seconds, 15);
  assert.equal((await poll('1.2.0')).poll_after_seconds, 2);
  const auth = await f.storage.get(`bridge:auth:${f.authId}`);
  await f.storage.put(`bridge:auth:${f.authId}`, { ...auth, finalized: true });
  assert.equal((await poll('1.2.0')).poll_after_seconds, 15);
});
