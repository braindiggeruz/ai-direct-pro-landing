import { normalizeTelegramBotUsername } from './deep-link';
import { ensureTelegramAgentUpdateSchema } from './schema';

export type TelegramAgentUpdateFailureCode =
  | 'identity_failed'
  | 'context_failed'
  | 'runtime_failed'
  | 'send_failed';

export interface TelegramAgentUpdateReservation {
  status: 'reserved' | 'duplicate';
  idempotencyKey: string;
}

export interface TelegramAgentUpdateStore {
  reserve(
    botUsername: string,
    updateId: number,
  ): Promise<TelegramAgentUpdateReservation>;
  complete(idempotencyKey: string): Promise<void>;
  fail(
    idempotencyKey: string,
    code: TelegramAgentUpdateFailureCode,
  ): Promise<void>;
}

function requireUpdateId(updateId: number): number {
  if (!Number.isSafeInteger(updateId) || updateId < 0) {
    throw new Error('telegram agent update rejected');
  }
  return updateId;
}

function requireIdempotencyKey(value: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 96
    || !/^agents:[a-z][a-z0-9_]{4,31}:\d+$/.test(value)
  ) {
    throw new Error('telegram agent update rejected');
  }
  return value;
}

export function telegramAgentUpdateKey(
  botUsername: string,
  updateId: number,
): string {
  return `agents:${normalizeTelegramBotUsername(botUsername)}:${requireUpdateId(updateId)}`;
}

export function createTelegramAgentUpdateStore(
  db: D1Database,
): TelegramAgentUpdateStore {
  return {
    async reserve(botUsername, updateId) {
      const normalizedBotUsername = normalizeTelegramBotUsername(botUsername);
      const validUpdateId = requireUpdateId(updateId);
      const idempotencyKey = telegramAgentUpdateKey(
        normalizedBotUsername,
        validUpdateId,
      );
      await ensureTelegramAgentUpdateSchema(db);
      const result = await db
        .prepare(`INSERT OR IGNORE INTO telegram_agent_updates
          (idempotency_key, bot_username, update_id, status, created_at)
          VALUES (?, ?, ?, 'reserved', ?)`)
        .bind(
          idempotencyKey,
          normalizedBotUsername,
          validUpdateId,
          new Date().toISOString(),
        )
        .run();
      return {
        status: (result.meta?.changes ?? 0) > 0
          ? 'reserved'
          : 'duplicate',
        idempotencyKey,
      };
    },

    async complete(idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      await ensureTelegramAgentUpdateSchema(db);
      await db
        .prepare(`UPDATE telegram_agent_updates
          SET status = 'completed', error_code = NULL, completed_at = ?
          WHERE idempotency_key = ? AND status = 'reserved'`)
        .bind(new Date().toISOString(), key)
        .run();
    },

    async fail(idempotencyKey, code) {
      const key = requireIdempotencyKey(idempotencyKey);
      await ensureTelegramAgentUpdateSchema(db);
      await db
        .prepare(`UPDATE telegram_agent_updates
          SET status = 'failed', error_code = ?, completed_at = ?
          WHERE idempotency_key = ? AND status = 'reserved'`)
        .bind(code, new Date().toISOString(), key)
        .run();
    },
  };
}
