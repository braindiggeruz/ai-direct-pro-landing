import { normalizeTelegramBotUsername } from './deep-link';
import { ensureTelegramAgentUpdateSchema } from './schema';

import { swallow } from '../../lib/observability';

export type TelegramAgentUpdateFailureCode =
  | 'identity_failed'
  | 'context_failed'
  | 'runtime_failed'
  | 'send_failed'
  | 'rate_limited'
  | 'rate_limit_failed';

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
      const now = new Date().toISOString();
      const result = await db
        .prepare(`INSERT OR IGNORE INTO telegram_agent_updates
          (idempotency_key, bot_username, update_id, status, created_at)
          VALUES (?, ?, ?, 'reserved', ?)`)
        .bind(
          idempotencyKey,
          normalizedBotUsername,
          validUpdateId,
          now,
        )
        .run();
      if ((result.meta?.changes ?? 0) > 0) {
        await db.prepare(
          `INSERT OR IGNORE INTO telegram_agent_update_metrics (
             idempotency_key, bot_username, duplicate_count, updated_at
           ) VALUES (?, ?, 0, ?)`,
        ).bind(idempotencyKey, normalizedBotUsername, now).run()
          .catch(swallow('channels-telegram-store'));
      } else {
        await db.prepare(
          `INSERT INTO telegram_agent_update_metrics (
             idempotency_key, bot_username, duplicate_count, updated_at
           ) VALUES (?, ?, 1, ?)
           ON CONFLICT(idempotency_key) DO UPDATE SET
             duplicate_count = MIN(
               1000000,
               telegram_agent_update_metrics.duplicate_count + 1
             ),
             updated_at = excluded.updated_at`,
        ).bind(idempotencyKey, normalizedBotUsername, now).run()
          .catch(swallow('channels-telegram-store'));
      }
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
      const now = new Date().toISOString();
      await db
        .prepare(`UPDATE telegram_agent_updates
          SET status = 'completed', error_code = NULL, completed_at = ?
          WHERE idempotency_key = ? AND status = 'reserved'`)
        .bind(now, key)
        .run();
      await db.prepare(
        `UPDATE telegram_agent_update_metrics
         SET processing_ms = (
           SELECT MIN(
             86400000,
             MAX(0, CAST(
               (julianday(?) - julianday(created_at)) * 86400000 AS INTEGER
             ))
           )
           FROM telegram_agent_updates
           WHERE idempotency_key = ?
         ),
         updated_at = ?
         WHERE idempotency_key = ?`,
      ).bind(now, key, now, key).run().catch(swallow('channels-telegram-store'));
    },

    async fail(idempotencyKey, code) {
      const key = requireIdempotencyKey(idempotencyKey);
      await ensureTelegramAgentUpdateSchema(db);
      const now = new Date().toISOString();
      await db
        .prepare(`UPDATE telegram_agent_updates
          SET status = 'failed', error_code = ?, completed_at = ?
          WHERE idempotency_key = ? AND status = 'reserved'`)
        .bind(code, now, key)
        .run();
      await db.prepare(
        `UPDATE telegram_agent_update_metrics
         SET processing_ms = (
           SELECT MIN(
             86400000,
             MAX(0, CAST(
               (julianday(?) - julianday(created_at)) * 86400000 AS INTEGER
             ))
           )
           FROM telegram_agent_updates
           WHERE idempotency_key = ?
         ),
         updated_at = ?
         WHERE idempotency_key = ?`,
      ).bind(now, key, now, key).run().catch(swallow('channels-telegram-store'));
    },
  };
}
