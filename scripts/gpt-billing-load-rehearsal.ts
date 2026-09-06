/** Synthetic SQLite admission exercise. No network, real keys or production DB. */
import assert from "node:assert/strict";
import { billingFixture } from "../tests/helpers/gpt-billing-fixture";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
import { resolveConfig } from "../functions/lib/gpt-chat/config";

const fixture = await billingFixture();
const store = new TurnStore(fixture.binding, BILLING_ORG);
const cfg = resolveConfig(fixture.env);
const count = 1000;
const started = performance.now();
// Groups of 50 independent subjects stress SQL admission on the same ledger.
for (let offset = 0; offset < count; offset += 50) {
  await Promise.all(
    Array.from({ length: 50 }, async (_, j) => {
      const i = offset + j;
      const admitted = await store.reserve(
        `synthetic-user-${i}`,
        `synthetic-ip-${i}`,
        null,
        cfg,
      );
      assert.ok(admitted.id);
      await store.finish(admitted.id, i % 5 !== 0);
    }),
  );
}
const elapsedMs = Number((performance.now() - started).toFixed(1));
const done = Number(
  fixture.db.value(
    "SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='done'",
  ),
);
const released = Number(
  fixture.db.value(
    "SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='released'",
  ),
);
assert.equal(done, 800);
assert.equal(released, 200);
assert.equal(await store.remaining("synthetic-user-0", null, cfg), 15);
assert.equal(await store.remaining("synthetic-user-1", null, cfg), 14);
console.log(
  JSON.stringify(
    {
      environment:
        "local Node SQLite; NOT a Cloudflare D1 capacity measurement",
      requests: count,
      done,
      released,
      elapsedMs,
      externalCalls: 0,
    },
    null,
    2,
  ),
);
