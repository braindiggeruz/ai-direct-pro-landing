// POST /api/telegram/assistant — webhook for the "Smart Forward" AI assistant.
//
// SEPARATE from the lead-capture bot at /api/telegram/webhook: distinct token
// (TELEGRAM_ASSISTANT_BOT_TOKEN) and secret (TELEGRAM_ASSISTANT_WEBHOOK_SECRET)
// so both bots coexist. Validates the Telegram secret header, dedupes by
// update_id, returns 200 immediately and processes in the background so the
// webhook connection is never held open on the AI call.
import type { Env } from '../../_types';
import { resolveTelegramConfig, telegramConfigured } from '../../lib/telegram/config';
import { TelegramClient } from '../../lib/telegram/client';
import { ensureTelegramSchema } from '../../lib/telegram/schema';
import { claimUpdate } from '../../lib/telegram/store';
import { handleUpdate, type TgUpdate } from '../../lib/telegram/handler';

function ok(): Response {
  return new Response('ok', { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  // Feature dormant until both dedicated secrets are configured — never
  // error or expose partial configuration, just return 200.
  if (!telegramConfigured(env)) return ok();
  const cfg = resolveTelegramConfig(env);

  // Verify the shared secret. When a secret is configured it is REQUIRED;
  // a mismatch is rejected. (Telegram sends it on every webhook call.)
  if (cfg.webhookSecret) {
    const got = request.headers.get('x-telegram-bot-api-secret-token');
    if (got !== cfg.webhookSecret) return new Response('forbidden', { status: 401 });
  }

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) { console.error('tg.assistant: no D1 binding'); return ok(); }

  let update: TgUpdate;
  try { update = (await request.json()) as TgUpdate; } catch { return ok(); }
  if (typeof update?.update_id !== 'number') return ok();

  // Only message + callback_query are requested via allowed_updates; ignore rest.
  if (!update.message && !update.callback_query) return ok();

  const tg = new TelegramClient(cfg.token);

  const process = async () => {
    try {
      await ensureTelegramSchema(db);
      // Dedupe: a repeated update_id (Telegram retry) is a no-op.
      const fresh = await claimUpdate(db, update.update_id);
      if (!fresh) return;
      await handleUpdate({ env, db, cfg, tg }, update);
    } catch (e) {
      console.error('tg.assistant process error:', (e as Error).message);
    }
  };

  // Return 200 now; do the heavy AI work after the response is sent.
  waitUntil(process());
  return ok();
};

// Telegram webhooks are POST-only. Keep an explicit response so probes do not
// fall through to the SPA and accidentally return a misleading 200 page.
export const onRequestGet: PagesFunction<Env> = async () =>
  new Response('method not allowed', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
