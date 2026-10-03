// The dark rehearsal, layer 2 prepared (paid-chat plan WP-22):
// scripts/paid-chat/dark-rehearsal.ts, run offline only. Its test credentials
// (two secret files outside Git, never overwritten, never printed, accepted by
// the site's own parsers), its "--simulate local" mode against the site's own
// handlers on 127.0.0.1 (every step, the drill, the after-off checks, the
// receipt), the Bearer-only operator, and the guards: production only, the
// operator's files required, a wrong admin token or a site still in test fail.
// Nothing here reaches the network: the stub refuses every host but itself.
// Run: node --import tsx --test tests/paid-chat-dark-rehearsal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  adminOperator,
  bearerOperator,
  CLICK_SECRET,
  httpTransport,
  main,
  readTestCredentials,
  runRehearsal,
  startLocalStub,
  UZUM_SECRET,
  verifyOff,
  withAfterOff,
  writeTestCredentials,
  type Receipt,
} from "../scripts/paid-chat/dark-rehearsal";

const ROOT = path.resolve(import.meta.dirname, "..");

function scratch(): { dir: string; done: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gptbot-wp22-test-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** No long hex (order ids, cookies, keys), no order or payment number, none of `values`. */
function assertNothingPrivate(text: string, values: string[]): void {
  assert.doesNotMatch(text, /[0-9a-f]{32}/i, "no id, cookie or key");
  assert.doesNotMatch(text, /\b(?:pay|uzm|acct)_/, "no order or account id");
  assert.doesNotMatch(text, /\b[1-9]\d{8}\b/, "no payment code or credential id");
  for (const value of values) assert.ok(!text.includes(value), "a credential value leaked");
}

test("credentials: two secret files outside Git that the site accepts, never overwritten, never inside the repository, never printed", async () => {
  const { dir, done } = scratch();
  try {
    const out = path.join(dir, "keys");
    const lines: string[] = [];
    assert.equal(await main(["credentials", "--out", out], (line) => lines.push(line)), 0);
    const click = JSON.parse(readFileSync(path.join(out, `${CLICK_SECRET}.json`), "utf8")) as Record<string, unknown>;
    const uzum = JSON.parse(readFileSync(path.join(out, `${UZUM_SECRET}.json`), "utf8")) as { merchant: Record<string, unknown> };
    // Only test blocks: nothing that could pass for a live account.
    assert.deepEqual([Object.keys(click), Object.keys(uzum), Object.keys(uzum.merchant)], [["test"], ["merchant"], ["test"]]);
    const credentials = readTestCredentials(out);
    assert.ok(credentials.click && credentials.uzum);
    assert.match(credentials.click.serviceId, /^9\d{8}$/);
    assert.match(credentials.click.merchantId!, /^9\d{8}$/);
    assert.match(credentials.click.merchantUserId!, /^9\d{8}$/);
    assert.match(credentials.click.secretKey, /^[0-9a-f]{64}$/);
    assert.ok(credentials.uzum.serviceId >= 900_000_000);
    assert.match(credentials.uzum.login, /^rh[0-9a-f]{12}$/);
    assert.match(credentials.uzum.password, /^[0-9a-f]{48}$/);
    if (process.platform !== "win32")
      assert.equal(statSync(path.join(out, `${CLICK_SECRET}.json`)).mode & 0o077, 0, "readable by the owner only");
    // The paths and the command are printed; no value is.
    assert.ok(lines.some((line) => line.includes(`${CLICK_SECRET}.json`)));
    assertNothingPrivate(lines.join("\n").replaceAll(out, "<out>"), [credentials.click.secretKey, credentials.uzum.login, credentials.uzum.password]);

    // Never overwritten: the secrets put from these files stay matched to them.
    const before = readFileSync(path.join(out, `${CLICK_SECRET}.json`), "utf8");
    const again: string[] = [];
    assert.equal(await main(["credentials", "--out", out], (line) => again.push(line)), 1);
    assert.match(again.join("\n"), /refusing to overwrite/);
    assert.equal(readFileSync(path.join(out, `${CLICK_SECRET}.json`), "utf8"), before);
    // A half-taken folder writes nothing either.
    const half = path.join(dir, "half");
    writeTestCredentials(half);
    rmSync(path.join(half, `${UZUM_SECRET}.json`));
    assert.throws(() => writeTestCredentials(half), /refusing to overwrite/);
    assert.equal(existsSync(path.join(half, `${UZUM_SECRET}.json`)), false);

    // Never inside the repository.
    const inRepo = path.join(ROOT, "tmp-wp22-credentials");
    assert.throws(() => writeTestCredentials(inRepo), /inside the repository/);
    assert.equal(existsSync(inRepo), false);
    // A broken file is named, not used.
    writeFileSync(path.join(half, `${UZUM_SECRET}.json`), JSON.stringify({ merchant: { test: { serviceId: 1, login: "a:b", password: "x" } } }));
    assert.throws(() => readTestCredentials(half), /UZUM_CREDENTIALS_JSON\.json has no valid "merchant\.test" block/);
  } finally {
    done();
  }
});

test("run --simulate local: every step passes over HTTP against the site's own handlers; the receipt has the phases, the modes, the counts and no value", async (t) => {
  // The site's own log line for the drill alert.
  t.mock.method(console, "warn", () => undefined);
  const { dir, done } = scratch();
  try {
    const file = path.join(dir, "R7-dark-rehearsal.json");
    const lines: string[] = [];
    const code = await main(["run", "--simulate", "local", "--receipt", file], (line) => lines.push(line));
    assert.equal(code, 0, lines.join("\n"));
    const receipt = JSON.parse(readFileSync(file, "utf8")) as Receipt;
    assert.equal(receipt.status, "pass");
    assert.deepEqual(Object.keys(receipt.phases), ["click", "uzum_merchant", "drill", "after_off", "owner_messages"]);
    for (const [name, phase] of Object.entries(receipt.phases)) {
      assert.equal(phase.failed, 0, name);
      assert.equal(phase.passed, phase.steps.length, name);
    }
    assert.ok(receipt.phases.click.steps.length >= 18);
    // The 22 steps of Uzum Bank's side, besides the session and the views.
    assert.equal(receipt.phases.uzum_merchant.steps.filter((s) => s.step.startsWith("uzum: ") && !s.step.includes("credentials")).length, 22);
    assert.deepEqual(receipt.provider_modes, { click: "test", uzum: "test", payme: null });
    assert.deepEqual(receipt.rows_by_mode, {
      test: { click: { refunded: 1 }, uzum: { refunded: 2, cancelled: 1 } },
      live: {},
    });
    assert.equal(receipt.operator, "admin");
    assert.equal(receipt.production_commit, null, "the stub has no release manifest");
    assert.deepEqual(receipt.phases.drill.steps.map((s) => s.got), ["200 alerts=sent drill sent"]);
    assert.equal(receipt.lead_aggregates.length, 3);
    for (const aggregate of receipt.lead_aggregates) assert.match(aggregate.sql, /^SELECT [^;]*COUNT\(\*\)[^;]*$/);
    assert.match(lines.at(-1)!, /^(\d+)\/\1 steps passed: pass$/);
    assertNothingPrivate(JSON.stringify(receipt).replace(/"lead_aggregates":\[[^\]]*\]/, ""), []);
    assertNothingPrivate(lines.join("\n").replace(/http:\/\/127\.0\.0\.1:\d+/g, "<stub>"), []);
  } finally {
    done();
  }
});

test("the Bearer operator alone runs the same rehearsal through the internal routes; no value reaches the receipt or the stub's owner chat", async () => {
  const stub = await startLocalStub();
  try {
    const transport = httpTransport();
    const credentials = readTestCredentials(stub.credentialsDir);
    const bearer = readFileSync(stub.bearerFile, "utf8");
    const token = readFileSync(stub.adminTokenFile, "utf8");
    const operator = bearerOperator(stub.site, transport, bearer);
    const receipt = await runRehearsal({ site: stub.site, transport, operator, credentials, providers: ["click", "uzum"], bearer, drill: false });
    assert.equal(receipt.status, "pass", JSON.stringify(receipt.phases, null, 1));
    assert.deepEqual(Object.keys(receipt.phases), ["click", "uzum_merchant"]);
    assert.deepEqual([receipt.operator, receipt.rows_by_mode], ["bearer", null]);
    assert.ok(receipt.phases.click.steps.every((s) => !s.step.startsWith("admin:")), "no admin step without the admin token");

    // Still in test: the after-off check fails, so it tells the two apart.
    assert.ok((await verifyOff({ site: stub.site, transport, operator })).some((s) => !s.ok));
    stub.switchOff();
    const off = withAfterOff(receipt, await verifyOff({ site: stub.site, transport, operator }), stub.site, operator.kind);
    assert.equal(off.status, "pass");
    assert.ok(off.phases.after_off.steps.some((s) => s.step === "bearer: no rehearsal session while nothing is in test -> 404" && s.ok));

    const values = [bearer, token, credentials.click!.secretKey, credentials.uzum!.login, credentials.uzum!.password];
    assertNothingPrivate(JSON.stringify(off).replace(/"lead_aggregates":\[[^\]]*\]/, "").replaceAll(stub.site, "<stub>"), values);
    // A test order never reaches the owner's chat.
    assert.equal(stub.ownerMessages.filter((line) => line.includes("AI paket")).length, 0);
  } finally {
    await stub.close();
  }
});

test("guards: production only, the operator's files required; a wrong admin token fails the run and touches nothing", async () => {
  const { dir, done } = scratch();
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input instanceof Request ? input.url : input));
    throw new Error("no network in this test");
  }) as typeof fetch;
  try {
    writeTestCredentials(path.join(dir, "keys"));
    const run = async (...args: string[]) => {
      const lines: string[] = [];
      return { code: await main(args, (line) => lines.push(line)), text: lines.join("\n") };
    };
    for (const site of ["https://evil.example", "http://gptbot.uz", "https://gptbot.uz.evil.example"]) {
      const answer = await run("run", "--site", site, "--credentials", path.join(dir, "keys"), "--bearer-file", path.join(dir, "keys", `${CLICK_SECRET}.json`));
      assert.equal(answer.code, 1);
      assert.match(answer.text, /--site must be https:\/\/gptbot\.uz/);
    }
    assert.match((await run("run", "--site", "https://gptbot.uz", "--credentials", path.join(dir, "keys"))).text, /pass --admin-token-file .* or --bearer-file/);
    assert.match((await run("run", "--site", "https://gptbot.uz")).text, /--credentials <folder/);
    writeFileSync(path.join(dir, "short.txt"), "short");
    assert.match((await run("verify-off", "--site", "https://gptbot.uz", "--bearer-file", path.join(dir, "short.txt"))).text, /--bearer-file does not hold a usable value/);
    assert.match((await run("verify-off", "--site", "https://gptbot.uz", "--admin-token-file", path.join(dir, "short.txt"))).text, /--admin-token-file does not hold a usable value/);
    assert.match((await run("deploy")).text, /usage:/);
    assert.deepEqual(requested, [], "nothing was requested");
  } finally {
    globalThis.fetch = original;
    done();
  }

  // Against the stub with a token it did not sign: the session step fails, nothing is bought.
  const stub = await startLocalStub();
  try {
    const transport = httpTransport();
    const forged = readFileSync(stub.adminTokenFile, "utf8").replace(/\.[^.]+$/, ".AAAA");
    const receipt = await runRehearsal({
      site: stub.site,
      transport,
      operator: adminOperator(stub.site, transport, forged),
      credentials: readTestCredentials(stub.credentialsDir),
      providers: ["click"],
      bearer: null,
      drill: false,
    });
    assert.equal(receipt.status, "fail");
    const failed = receipt.phases.click.steps.filter((s) => !s.ok);
    assert.deepEqual(failed.map((s) => [s.step, s.got]), [["admin: rehearsal session with a synthetic account, offered click", "401 providers=-"]]);
    assert.equal(receipt.rows_by_mode, null);
  } finally {
    await stub.close();
  }
});
