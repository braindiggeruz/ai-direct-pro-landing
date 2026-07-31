import { normalizeTelegramBotUsername } from './deep-link';
import { ensureTelegramAgentUpdateSchema } from './schema';

const WINDOW_MS = 60_000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface TelegramRateLimitInput {
  botUsername: string;
  externalId: string;
  threadRef: string;
  callback: boolean;
}

export interface TelegramTenantRateLimitInput {
  orgId: string;
  callback: boolean;
}

export type TelegramRateLimitDecision =
  | { status: 'allowed' }
  | {
      status: 'limited';
      retryAfterSeconds: number;
      notify: boolean;
    };

export interface TelegramRateLimiter {
  consume(input: TelegramRateLimitInput): Promise<TelegramRateLimitDecision>;
  consumeTenant(
    input: TelegramTenantRateLimitInput,
  ): Promise<TelegramRateLimitDecision>;
}

export interface TelegramRateLimiterOptions {
  /** Server-only pepper; production passes the isolated webhook secret. */
  hashKey: string;
  perUser?: number;
  perChat?: number;
  perBot?: number;
  perTenant?: number;
  callbacksPerScope?: number;
  now?: () => Date;
}

interface ResolvedOptions {
  perUser: number;
  perChat: number;
  perBot: number;
  perTenant: number;
  callbacksPerScope: number;
  now: () => Date;
}

function boundedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error('telegram rate limit rejected');
  }
  return value;
}

function resolveOptions(options: TelegramRateLimiterOptions): ResolvedOptions {
  return {
    perUser: boundedLimit(options.perUser, 20),
    perChat: boundedLimit(options.perChat, 30),
    perBot: boundedLimit(options.perBot, 180),
    perTenant: boundedLimit(options.perTenant, 120),
    callbacksPerScope: boundedLimit(options.callbacksPerScope, 12),
    now: options.now ?? (() => new Date()),
  };
}

function requireScopePart(value: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || !/^[A-Za-z0-9._:@-]+$/.test(value)
  ) {
    throw new Error('telegram rate limit rejected');
  }
  return value;
}

function importHashKey(value: string): Promise<CryptoKey> {
  if (
    typeof value !== 'string'
    || value.length < 32
    || value.length > 256
  ) {
    throw new Error('telegram rate limit rejected');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(value),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function scopeHash(
  key: Promise<CryptoKey>,
  kind: string,
  value: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `gptbot-market-rate:v1:${kind}:${requireScopePart(value)}`,
  );
  const digest = await crypto.subtle.sign('HMAC', await key, bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function windowStart(now: Date): string {
  return new Date(
    Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS,
  ).toISOString();
}

async function consumeScope(
  db: D1Database,
  input: {
    scopeKey: string;
    windowStartedAt: string;
    updatedAt: string;
    requestLimit: number;
    callbackLimit: number;
    callback: boolean;
  },
): Promise<boolean> {
  const callbackDelta = input.callback ? 1 : 0;
  const result = await db.prepare(
    `INSERT INTO telegram_agent_rate_limits (
       scope_key, window_started_at, request_count, callback_count, updated_at
     ) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(scope_key, window_started_at) DO UPDATE SET
       request_count = telegram_agent_rate_limits.request_count + 1,
       callback_count =
         telegram_agent_rate_limits.callback_count + excluded.callback_count,
       updated_at = excluded.updated_at
     WHERE telegram_agent_rate_limits.request_count < ?
       AND (
         excluded.callback_count = 0
         OR telegram_agent_rate_limits.callback_count < ?
       )`,
  ).bind(
    input.scopeKey,
    input.windowStartedAt,
    callbackDelta,
    input.updatedAt,
    input.requestLimit,
    input.callbackLimit,
  ).run();
  return (result.meta?.changes ?? 0) > 0;
}

async function cleanupOldWindows(db: D1Database, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
  await db.prepare(
    'DELETE FROM telegram_agent_rate_limit_notices WHERE created_at < ?',
  ).bind(cutoff).run();
  await db.prepare(
    'DELETE FROM telegram_agent_rate_limits WHERE updated_at < ?',
  ).bind(cutoff).run();
}

async function reserveLimitNotice(
  db: D1Database,
  scopeKey: string,
  windowStartedAt: string,
  now: string,
): Promise<boolean> {
  const result = await db.prepare(
    `INSERT OR IGNORE INTO telegram_agent_rate_limit_notices (
       scope_key, window_started_at, created_at
     ) VALUES (?, ?, ?)`,
  ).bind(scopeKey, windowStartedAt, now).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Fixed-window limiter for the first-party Telegram transport.
 *
 * Only SHA-256 scope keys and counters are persisted. A denied attempt still
 * owns its update idempotency key, so Telegram replay cannot bypass the limit
 * or cause the underlying business action to execute later.
 */
export function createTelegramRateLimiter(
  db: D1Database,
  options: TelegramRateLimiterOptions,
): TelegramRateLimiter {
  const limits = resolveOptions(options);
  const hashKey = importHashKey(options.hashKey);

  async function consumeMany(
    scopes: readonly {
      key: Promise<string>;
      limit: number;
      callbackLimit: number;
    }[],
    callback: boolean,
  ): Promise<TelegramRateLimitDecision> {
    await ensureTelegramAgentUpdateSchema(db);
    const now = limits.now();
    if (!Number.isFinite(now.getTime())) {
      throw new Error('telegram rate limit rejected');
    }
    const startedAt = windowStart(now);
    const updatedAt = now.toISOString();
    const keys = await Promise.all(scopes.map((scope) => scope.key));
    for (let index = 0; index < scopes.length; index += 1) {
      const allowed = await consumeScope(db, {
        scopeKey: keys[index],
        windowStartedAt: startedAt,
        updatedAt,
        requestLimit: scopes[index].limit,
        callbackLimit: scopes[index].callbackLimit,
        callback,
      });
      if (!allowed) {
        return {
          status: 'limited',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (Date.parse(startedAt) + WINDOW_MS - now.getTime()) / 1000,
            ),
          ),
          notify: await reserveLimitNotice(
            db,
            keys[index],
            startedAt,
            updatedAt,
          ),
        };
      }
    }
    await cleanupOldWindows(db, now).catch(() => undefined);
    return { status: 'allowed' };
  }

  return {
    async consume(input) {
      const bot = normalizeTelegramBotUsername(input.botUsername);
      return consumeMany([
        {
          key: scopeHash(
            hashKey,
            'user',
            `${bot}:${requireScopePart(input.externalId)}`,
          ),
          limit: limits.perUser,
          callbackLimit: limits.callbacksPerScope,
        },
        {
          key: scopeHash(
            hashKey,
            'chat',
            `${bot}:${requireScopePart(input.threadRef)}`,
          ),
          limit: limits.perChat,
          callbackLimit: limits.callbacksPerScope,
        },
        {
          key: scopeHash(hashKey, 'bot', bot),
          limit: limits.perBot,
          callbackLimit: limits.perBot,
        },
      ], input.callback);
    },

    async consumeTenant(input) {
      return consumeMany([{
        key: scopeHash(
          hashKey,
          'tenant',
          requireScopePart(input.orgId),
        ),
        limit: limits.perTenant,
        callbackLimit: limits.perTenant,
      }], input.callback);
    },
  };
}
