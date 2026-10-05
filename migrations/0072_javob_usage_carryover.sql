-- GPTBot Javob: what /delete_me keeps of the bot's free limits (review of
-- 05.10). Additive only. /delete_me (functions/lib/telegram/store.ts
-- deleteUserData) deletes every usage_ledger row of the person, whose
-- telegram_user_id is the raw Telegram id. So that it does not hand out a
-- fresh allowance, it first counts the current Tashkent month's
-- main_generation and analysis rows per Tashkent day into this table, under
-- the account HMAC (functions/lib/gpt-chat/telegram-identity.ts,
-- GPT_IDENTITY_SECRET). No Telegram id, no text, no item or result link.
-- functions/lib/telegram/billing.ts adds these counts to the free limits;
-- cleanupExpired deletes the rows of earlier months.
-- Runtime parity: the same table in functions/lib/telegram/schema.ts
-- (ensureTelegramSchema), tested in tests/telegram-assistant.test.ts.
-- Order: either way. Both this file and the runtime bootstrap use IF NOT
-- EXISTS, so this migration can be recorded before or after the bootstrap ran.
-- Rollback: roll the application back; the table stays. The previous code
-- neither reads, writes nor prunes it; its rows hold no Telegram id and can
-- be deleted by hand once their month is over. No DROP.
CREATE TABLE IF NOT EXISTS usage_carryover (
  user_key TEXT NOT NULL,
  usage_type TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (user_key, usage_type, day)
);
CREATE INDEX IF NOT EXISTS idx_carryover_day ON usage_carryover (day);
