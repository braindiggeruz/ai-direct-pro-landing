import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTelegramProductCommand,
  TELEGRAM_AGENT_COMMAND_NAMES,
  TELEGRAM_AGENT_METADATA,
  validateTelegramAgentMetadata,
} from '../functions/channels/telegram';
import { runTelegramAgentsSetup } from '../scripts/telegram-agents-setup';

const USERNAME = 'gptbot_market_bot';

test('Telegram metadata is closed, localized and maps to implemented actions', () => {
  assert.doesNotThrow(
    () => validateTelegramAgentMetadata(TELEGRAM_AGENT_METADATA),
  );
  assert.deepEqual(TELEGRAM_AGENT_COMMAND_NAMES, [
    'start',
    'catalog',
    'orders',
    'help',
    'language',
  ]);
  for (const metadata of TELEGRAM_AGENT_METADATA) {
    assert.doesNotMatch(
      `${metadata.description} ${metadata.shortDescription}`,
      /оплат(?:а|ить)|доставим|real brand|haqiqiy brend mavjud/iu,
    );
    assert.equal(metadata.name, 'Bormi');
    for (const command of metadata.commands) {
      if (command.command === 'start') continue;
      const parsed = parseTelegramProductCommand(
        `/${command.command}@${USERNAME}`,
        USERNAME,
      );
      assert.equal(parsed?.command, command.command);
      assert.match(parsed?.actionId ?? '', /^buyer-/);
    }
  }
});

test('metadata setup is read-only by default', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const method = String(input).split('/').pop() ?? '';
    calls.push(method);
    return new Response(JSON.stringify({
      ok: true,
      result: {
        id: 123456789,
        is_bot: true,
        username: USERNAME,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await runTelegramAgentsSetup({
      TELEGRAM_AGENTS_BOT_TOKEN: 'synthetic-transport',
      TELEGRAM_AGENTS_BOT_USERNAME: USERNAME,
    }, ['metadata']);
    assert.deepEqual(calls, ['getMe']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('metadata apply verifies identity then writes all locale scopes', async () => {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const method = String(input).split('/').pop() ?? '';
    const body = init?.body
      ? JSON.parse(String(init.body)) as Record<string, unknown>
      : {};
    calls.push({ method, body });
    const result = method === 'getMe'
      ? {
          id: 123456789,
          is_bot: true,
          username: USERNAME,
        }
      : true;
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await runTelegramAgentsSetup({
      TELEGRAM_AGENTS_BOT_TOKEN: 'synthetic-transport',
      TELEGRAM_AGENTS_BOT_USERNAME: USERNAME,
    }, ['metadata', '--apply']);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0]?.method, 'getMe');
  assert.deepEqual(
    calls.slice(1).map(({ method }) => method),
    [
      'setMyName',
      'setMyCommands',
      'setMyDescription',
      'setMyShortDescription',
      'setMyName',
      'setMyCommands',
      'setMyDescription',
      'setMyShortDescription',
      'setMyName',
      'setMyCommands',
      'setMyDescription',
      'setMyShortDescription',
    ],
  );
  assert.deepEqual(
    calls
      .filter(({ method }) => method === 'setMyCommands')
      .map(({ body }) => body.language_code ?? 'default'),
    ['default', 'ru', 'uz'],
  );
});

test('metadata mutation is blocked when the verified username differs', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const method = String(input).split('/').pop() ?? '';
    calls.push(method);
    return new Response(JSON.stringify({
      ok: true,
      result: {
        id: 123456789,
        is_bot: true,
        username: 'different_safe_bot',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      runTelegramAgentsSetup({
        TELEGRAM_AGENTS_BOT_TOKEN: 'synthetic-transport',
        TELEGRAM_AGENTS_BOT_USERNAME: USERNAME,
      }, ['metadata', '--apply']),
      /username_mismatch/,
    );
    assert.deepEqual(calls, ['getMe']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
