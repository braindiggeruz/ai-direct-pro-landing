-- Javob (@gptbotuz_bot) sells nothing inside Telegram (paid-chat plan WP-08,
-- decision D11, release R2): Telegram allows digital goods in a bot only for
-- Stars, so the bot shows no prices and no payment links. The Day Pass and Plus
-- rows of the 0010 catalogue are switched off. Data only, no schema change.
-- Nothing reads them any more: /plans shows a fixed text with the free limits,
-- and the limits come from TELEGRAM_FREE_DAILY_LIMIT / TELEGRAM_FREE_MONTHLY_LIMIT
-- with the 'free' row as the fallback, so that row is left as it is.
-- Production on 2026-09-30: payment_orders, payment_transactions, subscriptions
-- and entitlements hold 0 rows, so no paid access depends on these rows.
-- Runtime parity: the seed in functions/lib/telegram/schema.ts inserts both rows
-- inactive (tests/telegram-assistant.test.ts).
-- Idempotent: a second run matches no row. Order: apply before or after the code,
-- either works (the R2 code never reads the paid rows).
-- Rollback: UPDATE plans SET is_active = 1 WHERE code IN ('day_pass', 'plus');
UPDATE plans
SET is_active = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE code IN ('day_pass', 'plus') AND is_active <> 0;
