import type {
  Locale,
  RuntimeTurnInput,
  RuntimeTurnResult,
} from '../../platform/contracts';
import type { TelegramAddressBinder } from './addresses';
import type {
  TelegramAgentContextResolver,
} from './deep-link';
import type { TelegramIdentityPort } from './identity';
import {
  ingestTelegramAgentUpdate,
  type TelegramAcceptedInbound,
} from './ingest';
import {
  deliverTelegramMessages,
  renderTelegramMappingFailure,
  renderTelegramRuntimeFailure,
  renderTelegramRuntimeResult,
  type TelegramDeliveryPort,
} from './render';
import type {
  TelegramAgentUpdateFailureCode,
  TelegramAgentUpdateStore,
} from './store';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const MAX_BODY_BYTES = 64 * 1024;

export type TelegramAgentsSafeLogCode =
  | 'dedup_unavailable'
  | 'identity_failed'
  | 'context_failed'
  | 'runtime_failed'
  | 'send_failed'
  | 'address_bind_failed'
  | 'dedup_finalize_failed';

export interface TelegramAgentsSafeLogger {
  error(code: TelegramAgentsSafeLogCode): void;
}

export interface TelegramAgentRuntimePort {
  run(input: unknown): Promise<RuntimeTurnResult>;
}

export interface TelegramAgentsWebhookDependencies {
  botUsername: string;
  webhookSecret: string;
  updates: TelegramAgentUpdateStore;
  identities: TelegramIdentityPort;
  contexts: TelegramAgentContextResolver;
  runtime: TelegramAgentRuntimePort;
  delivery: TelegramDeliveryPort;
  /** Optional durable "where to reach this identity" binding. */
  addresses?: TelegramAddressBinder;
  logger?: TelegramAgentsSafeLogger;
}

export type TelegramSecretCheck =
  | { status: 'valid' }
  | { status: 'invalid'; code: 'missing_secret' | 'wrong_secret' };

function response(body: string, status: number, extra?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      ...extra,
    },
  });
}

export function verifyTelegramSecretHeader(
  request: Request,
  expectedSecret: string,
): TelegramSecretCheck {
  const received = request.headers.get(SECRET_HEADER);
  if (received === null) {
    return { status: 'invalid', code: 'missing_secret' };
  }
  if (received !== expectedSecret) {
    return { status: 'invalid', code: 'wrong_secret' };
  }
  return { status: 'valid' };
}

async function parseBody(request: Request): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared) {
    const declaredBytes = Number(declared);
    if (
      !Number.isSafeInteger(declaredBytes)
      || declaredBytes < 0
      || declaredBytes > MAX_BODY_BYTES
    ) {
      throw new Error('invalid_body');
    }
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error('invalid_body');
  }
  return JSON.parse(body) as unknown;
}

function localeOf(input: TelegramAcceptedInbound): Locale {
  return input.inbound.locale ?? 'ru';
}

function runtimeInput(
  input: TelegramAcceptedInbound,
  identityId: string,
  context: {
    orgId: string;
    agentId: string;
    locale: Locale;
    entryActionId?: string;
    workflow?: {
      instanceId: string;
      expectedVersion: number;
    };
  },
): RuntimeTurnInput {
  const message = input.runtimeMessage.kind === 'action'
    && input.runtimeMessage.actionId === 'start'
    && context.entryActionId
    ? { kind: 'action' as const, actionId: context.entryActionId }
    : input.runtimeMessage;
  return {
    requestId: `tg-agents-${input.updateId}`,
    orgId: context.orgId,
    agentId: context.agentId,
    identityId,
    locale: context.locale,
    message,
    ...(context.workflow
      ? {
          activeWorkflow: {
            instanceId: context.workflow.instanceId,
            expectedVersion: context.workflow.expectedVersion,
            idempotencyKey: `${input.inbound.idempotencyKey}:workflow`,
            trigger: { on: 'intent', intent: 'continue' },
          },
        }
      : {}),
  };
}

async function finalizeFailure(
  dependencies: TelegramAgentsWebhookDependencies,
  idempotencyKey: string,
  code: TelegramAgentUpdateFailureCode,
): Promise<void> {
  try {
    await dependencies.updates.fail(idempotencyKey, code);
  } catch {
    dependencies.logger?.error('dedup_finalize_failed');
  }
}

async function sendFailure(
  dependencies: TelegramAgentsWebhookDependencies,
  input: TelegramAcceptedInbound,
  code: TelegramAgentUpdateFailureCode,
): Promise<void> {
  const delivered = await deliverTelegramMessages(
    dependencies.delivery,
    input.inbound.threadRef,
    renderTelegramRuntimeFailure(localeOf(input)),
  ).catch(() => false);
  dependencies.logger?.error(delivered ? code : 'send_failed');
  await finalizeFailure(
    dependencies,
    input.inbound.idempotencyKey,
    delivered ? code : 'send_failed',
  );
}

async function processAccepted(
  dependencies: TelegramAgentsWebhookDependencies,
  input: TelegramAcceptedInbound,
): Promise<void> {
  if (input.callbackQueryId) {
    await dependencies.delivery
      .answerCallback(input.callbackQueryId)
      .catch(() => false);
  }

  let identityId: string;
  try {
    const identity = await dependencies.identities.resolveTelegramIdentity(
      input.inbound.identity.externalId,
    );
    identityId = identity.identityId;
  } catch {
    await sendFailure(dependencies, input, 'identity_failed');
    return;
  }

  // Best effort: a failed address binding must never break the current turn,
  // it only postpones future pushed messages to this identity.
  if (dependencies.addresses) {
    try {
      await dependencies.addresses.bind(identityId, input.inbound.threadRef);
    } catch {
      dependencies.logger?.error('address_bind_failed');
    }
  }

  let context;
  try {
    context = await dependencies.contexts.resolve({
      botUsername: dependencies.botUsername,
      startPayload: input.startPayload,
      isStartCommand: input.runtimeMessage.kind === 'action'
        && input.runtimeMessage.actionId === 'start',
      ...(input.runtimeMessage.kind === 'action'
        ? { actionId: input.runtimeMessage.actionId }
        : {}),
      telegramIdentityId: identityId,
      locale: localeOf(input),
      idempotencyKey: input.inbound.idempotencyKey,
    });
  } catch {
    await sendFailure(dependencies, input, 'context_failed');
    return;
  }

  if (!context) {
    const delivered = await deliverTelegramMessages(
      dependencies.delivery,
      input.inbound.threadRef,
      renderTelegramMappingFailure(localeOf(input)),
    ).catch(() => false);
    if (delivered) {
      try {
        await dependencies.updates.complete(input.inbound.idempotencyKey);
      } catch {
        dependencies.logger?.error('dedup_finalize_failed');
      }
    } else {
      dependencies.logger?.error('send_failed');
      await finalizeFailure(
        dependencies,
        input.inbound.idempotencyKey,
        'send_failed',
      );
    }
    return;
  }

  let result: RuntimeTurnResult;
  try {
    result = await dependencies.runtime.run(
      runtimeInput(input, identityId, context),
    );
  } catch {
    await sendFailure(dependencies, input, 'runtime_failed');
    return;
  }

  const delivered = await deliverTelegramMessages(
    dependencies.delivery,
    input.inbound.threadRef,
    renderTelegramRuntimeResult(result, context.locale),
  ).catch(() => false);
  if (!delivered) {
    dependencies.logger?.error('send_failed');
    await finalizeFailure(
      dependencies,
      input.inbound.idempotencyKey,
      'send_failed',
    );
    return;
  }
  try {
    await dependencies.updates.complete(input.inbound.idempotencyKey);
  } catch {
    dependencies.logger?.error('dedup_finalize_failed');
  }
}

export async function handleTelegramAgentsWebhook(
  request: Request,
  dependencies: TelegramAgentsWebhookDependencies,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (request.method !== 'POST') {
    return response('method not allowed', 405, { Allow: 'POST' });
  }
  if (!dependencies.webhookSecret) {
    return response('unavailable', 503);
  }
  const secret = verifyTelegramSecretHeader(
    request,
    dependencies.webhookSecret,
  );
  if (secret.status === 'invalid') return response('forbidden', 401);

  let raw: unknown;
  try {
    raw = await parseBody(request);
  } catch {
    return response('bad request', 400);
  }
  const ingested = ingestTelegramAgentUpdate(raw, dependencies.botUsername);
  if (ingested.status === 'rejected') return response('bad request', 400);
  if (ingested.status === 'ignored') return response('ignored', 200);

  let reservation;
  try {
    reservation = await dependencies.updates.reserve(
      dependencies.botUsername,
      ingested.value.updateId,
    );
  } catch {
    dependencies.logger?.error('dedup_unavailable');
    return response('unavailable', 503);
  }
  if (reservation.status === 'duplicate') {
    return response('duplicate', 200);
  }
  waitUntil(processAccepted(dependencies, ingested.value));
  return response('accepted', 200);
}
