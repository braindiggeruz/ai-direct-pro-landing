import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Env } from '../functions/_types';
import {
  AiConfigurationError,
  AiPolicyResolver,
  AiProviderError,
  AiStructuredOutputError,
  AiTimeoutError,
  AiUnavailableError,
  createAiFacade,
  createLegacyLlmStructuredDriver,
  createLegacyOpenRouterDriver,
  type AiDriverRegistration,
  type AiRuntimeSchema,
  type AiTaskPolicyDefinition,
} from '../functions/platform/ai';

const request = {
  messages: [
    { role: 'system' as const, content: 'Safe system fixture.' },
    { role: 'user' as const, content: 'Safe user fixture.' },
  ],
};

function resolver(...definitions: AiTaskPolicyDefinition[]): AiPolicyResolver {
  return new AiPolicyResolver(definitions);
}

function facade(
  drivers: readonly AiDriverRegistration[],
  definitions: readonly AiTaskPolicyDefinition[],
) {
  return createAiFacade({ drivers, policy: new AiPolicyResolver(definitions) });
}

const answerSchema: AiRuntimeSchema<{ answer: string }> = {
  parse(value: unknown) {
    if (
      !value
      || typeof value !== 'object'
      || Array.isArray(value)
      || typeof (value as { answer?: unknown }).answer !== 'string'
    ) {
      throw new Error('schema mismatch fixture');
    }
    return { answer: (value as { answer: string }).answer };
  },
};

test('complete invokes the policy-selected driver', async () => {
  const calls: string[] = [];
  const ai = facade([
    {
      id: 'selected',
      async complete(input) {
        calls.push(input.task);
        return { text: 'ok', provider: 'fake', model: input.model };
      },
    },
  ], [{ task: 'chat', routes: [{ driver: 'selected', model: 'configured-model' }] }]);
  const result = await ai.complete(request, { task: 'chat' });
  assert.equal(result.text, 'ok');
  assert.equal(result.driver, 'selected');
  assert.equal(result.model, 'configured-model');
  assert.deepEqual(calls, ['chat']);
});

test('policy selection is deterministic with exact-tier then default fallback', () => {
  const policy = resolver(
    { task: 'chat', routes: [{ driver: 'default-driver' }] },
    { task: 'chat', tier: 'quality', routes: [{ driver: 'quality-driver' }] },
  );
  assert.equal(policy.resolve({ task: 'chat', tier: 'quality' }).routes[0].driver, 'quality-driver');
  assert.equal(policy.resolve({ task: 'chat', tier: 'paid' }).routes[0].driver, 'default-driver');
  assert.equal(policy.resolve({ task: 'chat' }).routes[0].driver, 'default-driver');
});

test('complete fallback follows configured route order', async () => {
  const order: string[] = [];
  const ai = facade([
    {
      id: 'first',
      async complete() {
        order.push('first');
        throw new Error('unsafe upstream detail');
      },
    },
    {
      id: 'second',
      async complete() {
        order.push('second');
        return { text: 'fallback' };
      },
    },
  ], [{ task: 'chat', routes: [{ driver: 'first' }, { driver: 'second' }] }]);
  const result = await ai.complete(request, { task: 'chat' });
  assert.equal(result.text, 'fallback');
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(result.attempts.length, 2);
});

test('structured output is parsed and runtime-validated', async () => {
  const ai = facade([
    { id: 'json', async structured() { return { text: '{"answer":"valid"}' }; } },
  ], [{ task: 'structured', routes: [{ driver: 'json' }] }]);
  const result = await ai.structured(request, answerSchema, { task: 'structured' });
  assert.deepEqual(result.value, { answer: 'valid' });
});

test('invalid JSON fails closed', async () => {
  const ai = facade([
    { id: 'json', async structured() { return { text: 'not-json' }; } },
  ], [{ task: 'structured', routes: [{ driver: 'json' }] }]);
  await assert.rejects(
    ai.structured(request, answerSchema, { task: 'structured' }),
    (error: unknown) => error instanceof AiStructuredOutputError
      && error.code === 'structured_invalid_json',
  );
});

test('schema mismatch fails closed', async () => {
  const ai = facade([
    { id: 'json', async structured() { return { text: '{"wrong":true}' }; } },
  ], [{ task: 'structured', routes: [{ driver: 'json' }] }]);
  await assert.rejects(
    ai.structured(request, answerSchema, { task: 'structured' }),
    (error: unknown) => error instanceof AiStructuredOutputError
      && error.code === 'structured_schema_mismatch',
  );
});

test('unknown provider errors are normalized', async () => {
  const ai = facade([
    { id: 'broken', async complete() { throw new Error('raw provider body'); } },
  ], [{ task: 'chat', routes: [{ driver: 'broken' }] }]);
  await assert.rejects(
    ai.complete(request, { task: 'chat' }),
    (error: unknown) => error instanceof AiProviderError && error.code === 'provider',
  );
});

test('facade deadline produces a controlled timeout', async () => {
  const ai = facade([
    {
      id: 'slow',
      async complete() {
        return new Promise(() => undefined);
      },
    },
  ], [{ task: 'chat', timeoutMs: 5, routes: [{ driver: 'slow' }] }]);
  await assert.rejects(
    ai.complete(request, { task: 'chat' }),
    (error: unknown) => error instanceof AiTimeoutError,
  );
});

test('driver errors never echo prompt, user content or upstream secrets', async () => {
  const sensitiveFixture = 'private-user-fixture-should-not-escape';
  const ai = facade([
    {
      id: 'safe-error',
      async complete() {
        throw new Error(`upstream leaked ${sensitiveFixture}`);
      },
    },
  ], [{ task: 'analysis', routes: [{ driver: 'safe-error' }] }]);
  await assert.rejects(
    ai.complete({
      messages: [{ role: 'user', content: sensitiveFixture }],
    }, { task: 'analysis' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, new RegExp(sensitiveFixture));
      assert.doesNotMatch(error.message, /upstream leaked/);
      return true;
    },
  );
});

test('missing policy configuration is controlled', async () => {
  const ai = createAiFacade({ drivers: [], policy: resolver() });
  await assert.rejects(
    ai.complete(request, { task: 'chat' }),
    (error: unknown) => error instanceof AiConfigurationError,
  );
});

test('unknown runtime task is rejected', () => {
  const policy = resolver({ task: 'chat', routes: [{ driver: 'fake' }] });
  const unsafeTask = 'private-user-fixture-should-not-escape';
  assert.throws(() => policy.resolve({ task: unsafeTask } as never), (error: unknown) => {
    assert.ok(error instanceof AiConfigurationError);
    assert.doesNotMatch(error.message, new RegExp(unsafeTask));
    assert.equal(error.task, undefined);
    return true;
  });
});

test('missing structured capability is explicit', async () => {
  const ai = facade([
    { id: 'text-only', async complete() { return { text: 'text' }; } },
  ], [{ task: 'structured', routes: [{ driver: 'text-only' }] }]);
  await assert.rejects(
    ai.structured(request, answerSchema, { task: 'structured' }),
    (error: unknown) => error instanceof AiUnavailableError,
  );
});

test('facade never exceeds configured maxAttempts', async () => {
  const order: string[] = [];
  const failing = (id: string): AiDriverRegistration => ({
    id,
    async complete() {
      order.push(id);
      throw new Error('failure fixture');
    },
  });
  const ai = facade([
    failing('one'),
    failing('two'),
    failing('three'),
  ], [{
    task: 'chat',
    maxAttempts: 2,
    routes: [{ driver: 'one' }, { driver: 'two' }, { driver: 'three' }],
  }]);
  await assert.rejects(ai.complete(request, { task: 'chat' }), AiProviderError);
  assert.deepEqual(order, ['one', 'two']);
});

test('legacy OpenRouter adapter preserves configured chain and request limits', async () => {
  const observed: {
    chain?: string[];
    maxTokens?: number;
    timeoutMs?: number;
    messageCount?: number;
  } = {};
  const env = {
    OPENROUTER_MODEL_FREE: 'fixture/model-a',
    OPENROUTER_MODEL_FREE_FALLBACKS: 'fixture/model-b',
  } as Env;
  const driver = createLegacyOpenRouterDriver(env, {
    dependencies: {
      async chatComplete(_env, _config, chain, messages, maxTokens, timeoutMs) {
        observed.chain = chain;
        observed.maxTokens = maxTokens;
        observed.timeoutMs = timeoutMs;
        observed.messageCount = messages.length;
        return {
          ok: true,
          content: 'legacy-ok',
          modelUsed: chain[0],
          inputTokens: 7,
          outputTokens: 3,
        };
      },
    },
  });
  assert.ok(driver.complete);
  const result = await driver.complete!({
    ...request,
    task: 'chat',
    maxTokens: 321,
    timeoutMs: 654,
  });
  assert.equal(result.text, 'legacy-ok');
  assert.deepEqual(observed.chain, ['fixture/model-a', 'fixture/model-b']);
  assert.equal(observed.maxTokens, 321);
  assert.equal(observed.timeoutMs, 654);
  assert.equal(observed.messageCount, 2);
});

test('legacy structured adapter requests JSON mode and keeps legacy routing', async () => {
  let observed: { feature?: string; jsonObject?: boolean; temperature?: number } = {};
  const driver = createLegacyLlmStructuredDriver({} as Env, {
    featureByTask: { structured: 'judge' },
    dependencies: {
      async routeLlmCall(_env, input) {
        observed = {
          feature: input.feature,
          jsonObject: input.jsonObject,
          temperature: input.temperature,
        };
        return {
          ok: true,
          content: '{"answer":"legacy"}',
          meta: {
            provider: 'groq',
            model: 'fixture-model',
            feature: input.feature,
            duration_ms: 1,
            retry_count: 0,
            fallback_used: false,
            attempts: [],
          },
        };
      },
    },
  });
  assert.ok(driver.structured);
  const result = await driver.structured!({
    ...request,
    task: 'structured',
    temperature: 0.2,
  });
  assert.equal(result.text, '{"answer":"legacy"}');
  assert.deepEqual(observed, { feature: 'judge', jsonObject: true, temperature: 0.2 });
});
