-- Atomic Click ownership for the shared approved cash desk.
-- Additive only. Rollback: disable new Studio sales; retain triggers for existing orders.
CREATE TRIGGER IF NOT EXISTS studio_click_chat_owner BEFORE UPDATE OF external_id ON gpt_payment_orders WHEN NEW.provider='click' AND NEW.external_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'click_transaction_owned') WHERE EXISTS(SELECT 1 FROM studio_orders_v2 WHERE org_id=NEW.org_id AND provider='click' AND mode=NEW.mode AND external_id=NEW.external_id); END;

CREATE TRIGGER IF NOT EXISTS studio_click_studio_owner BEFORE UPDATE OF external_id ON studio_orders_v2 WHEN NEW.provider='click' AND NEW.external_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'click_transaction_owned') WHERE EXISTS(SELECT 1 FROM gpt_payment_orders WHERE org_id=NEW.org_id AND provider='click' AND mode=NEW.mode AND external_id=NEW.external_id); END;
