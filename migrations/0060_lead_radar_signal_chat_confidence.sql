-- Signal Radar chats: how much the room told us, not just what it told us.
--
-- 0059 stored a chat's topic and a relevance score, and the two together were
-- the whole verdict. They were not enough, and the failure was visible in the
-- operator's table rather than in a log.
--
-- On 2026-09-03 the harvest swept 1 614 live Uzbek rooms and kept 37. Twenty
-- of those thirty-seven owed their place to a single word — "заказ",
-- "buyurtma", "проект" — and were, without exception, retail businesses:
-- a bakery, a door workshop, a costume-jewellery seller, an intercity taxi
-- dispatch with 10 445 members. They scored 40-45 and sat above rooms that
-- actually sold web development, because the scorer counted words and every
-- made-to-order business in the country uses the word for "order".
--
-- The fix was to split every vocabulary into words only the trade writes and
-- words everyone writes. A room earns its topic with one strong word or two
-- weak ones; a room that offers only one weak word keeps a topic but is
-- labelled as a guess.
--
-- That label has to be stored, for the same reason `can_write_basis` is: the
-- operator is going to spend their account's reputation on this column, and a
-- verdict without a provenance is not a verdict you can act on. It is also
-- what lets the table be reordered honestly — confirmed rooms first, guesses
-- after, so a room that never described itself can never sit above one that
-- did.

ALTER TABLE lead_radar_signal_chats
  ADD COLUMN confidence TEXT
    CHECK(confidence IS NULL OR confidence IN ('confirmed','tentative'));

-- The table is read sorted by relevance, and now by confidence before it.
-- Without this index the confirmed band is found by scanning and sorting the
-- whole harvest on every page load.
CREATE INDEX idx_lr_signal_chats_confidence
  ON lead_radar_signal_chats(org_id, confidence, relevance DESC);
