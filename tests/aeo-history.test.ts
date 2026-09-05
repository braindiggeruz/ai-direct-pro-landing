import assert from "node:assert/strict";
import test from "node:test";
import { aeoRunLocale, filterAeoHistory, resolveAeoRun } from "../src/shared/aeo-history";
import type { AeoObservation, AeoRun } from "../src/shared/aeo";

const observation: AeoObservation = {
  question: "Где заказать торт?", locale: "ru", provider: "fixture", model: "demo/one:free",
  mode: "ungrounded", observedAt: "2026-09-05T08:00:00Z", ok: true, aiPresent: false,
  citations: [], visibility: null, text: "Скрытый текст ответа со словом индексация", error: null, verdict: "insufficient",
};
const run: AeoRun = { id: "run-ru", kind: "measurement", status: "completed", created_at: observation.observedAt, result: observation };

test("history filters saved model locale without inventing a locale for legacy observations", () => {
  const uz = { ...run, id: "run-uz", result: { ...observation, locale: "uz" as const, question: "Tort qayerdan olinadi?" } };
  const legacy = { ...run, id: "legacy", result: { ...observation, locale: undefined } };
  const failed: AeoRun = { ...run, id: "failed", status: "failed", result: null, failure: { code: "fixture", message: "fixture", questions: ["Tort?"], locale: "uz" } };
  const runs = [run, uz, legacy, failed];
  assert.deepEqual(filterAeoHistory(runs, "", "ru").map(r => r.id), ["run-ru"]);
  assert.deepEqual(filterAeoHistory(runs, "", "uz").map(r => r.id), ["run-uz", "failed"]);
  assert.deepEqual(filterAeoHistory(runs, "", "unknown").map(r => r.id), ["legacy"]);
  assert.equal(aeoRunLocale(legacy), "unknown");
});

test("history searches questions, not hidden answer text or serialized metadata", () => {
  assert.equal(filterAeoHistory([run], "  ТОРТ  ", "all").length, 1);
  assert.equal(filterAeoHistory([run], "индексация", "all").length, 0);
  assert.equal(filterAeoHistory([run], "ungrounded", "all").length, 0);
  assert.equal(filterAeoHistory([{ ...run, result: null }], "", "all").length, 1);
});

test("accepted requests use their settled observation for display and exported evidence", () => {
  const pending: AeoRun = { ...run, status: "running", result: null };
  assert.equal(resolveAeoRun(pending, [run]), run);
  assert.equal(resolveAeoRun(pending, [{ ...run, id: "other" }]), pending);
  assert.equal(resolveAeoRun(run, [pending]), run);
  assert.equal(resolveAeoRun(null, [run]), null);
});
