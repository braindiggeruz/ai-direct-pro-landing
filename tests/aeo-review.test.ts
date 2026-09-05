import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { AeoStore } from "../functions/platform/aeo/store";
import { ensureAeoSchema } from "../functions/platform/aeo/schema";
import { analyzeContent } from "../functions/platform/aeo/analysis";
import { onRequest } from "../functions/api/admin/aeo/review";
import { onRequestPost } from "../functions/api/admin/aeo/index";
import { signToken } from "../functions/lib/jwt";
import type { Env } from "../functions/_types";
import type { AeoReview } from "../src/shared/aeo";
import { prepareAeoEditorPatch } from "../src/shared/aeo-editor";
import { questionLines } from "../src/admin/lib/aeo-session";

const source = {
  status: "published",
  locale: "ru",
  slug: "seo",
  url: "/ru/seo/",
  h1: "SEO аудит сайта",
  bodyBlocks: [
    {
      type: "p",
      text: "SEO аудит сайта включает проверку технических ошибок, индексации и ссылок.",
    },
  ],
  faq: [],
};
const files = { "content/pages/ru/seo.json": JSON.stringify(source) };
test("review schema upgrades existing runs database; CAS, replay, org isolation and retention", async () => {
  const adapter = new SqliteD1();
  const db = adapter as unknown as D1Database;
  const store = new AeoStore(db);
  adapter.sqlite.exec(
    readFileSync(
      new URL("../migrations/0062_aeo_workspace.sql", import.meta.url),
      "utf8",
    ),
  );
  adapter.sqlite.exec(
    readFileSync(
      new URL("../migrations/0063_aeo_reviews.sql", import.meta.url),
      "utf8",
    ),
  );
  await ensureAeoSchema(db);
  await ensureAeoSchema(db);
  await store.reserve("A", "run", "run-key", "hash", "analysis", 10);
  await store.finish(
    "A",
    "run",
    await analyzeContent(files, ["Что включает SEO аудит сайта?"], "ru"),
  );
  const review: AeoReview = {
    runId: "run",
    findingId: "finding",
    status: "accepted",
    note: "",
    answerDraft: "",
    revision: 0,
    updatedAt: new Date().toISOString(),
    sourceHash: "hash",
    target: null,
  };
  assert.equal(
    await store.saveReview("B", review, 0, "operation", "body"),
    null,
  );
  const results = await Promise.all([
    store.saveReview("A", review, 0, "one", "one"),
    store.saveReview("A", review, 0, "two", "two"),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    (await store.saveReview("A", review, 0, "one", "one"))?.revision,
    1,
  );
  assert.equal(
    await store.saveReview("A", review, 0, "one", "different"),
    null,
  );
  assert.equal(await store.saveReview("A", review, 0, "three", "three"), null);
  assert.deepEqual(await store.reviews("B", "run"), []);
  assert.equal(await store.run("B", "run"), null);
  assert.deepEqual(await store.reviewCounts("A"), { run: 1 });
  await store.saveReview(
    "A",
    { ...review, status: "unreviewed" },
    1,
    "undo",
    "undo",
  );
  assert.deepEqual(await store.reviewCounts("A"), {});
  adapter.sqlite
    .prepare("UPDATE aeo_runs SET created_at='2000-01-01' WHERE org_id='A'")
    .run();
  await store.expire("B");
  assert.equal((await store.reviews("A", "run")).length, 1);
  await store.expire("A");
  assert.deepEqual(await store.reviews("A", "run"), []);
  adapter.sqlite.close();
});
test("editor bridge previews append-only content, blocks duplicate, stale form and wrong page", () => {
  const base = { ...source, body: [] };
  const input = JSON.stringify(base);
  const patch = prepareAeoEditorPatch(
    base,
    base,
    "Что включает аудит?",
    source.bodyBlocks[0].text,
  );
  assert.equal((patch.faq as unknown[]).length, 1);
  assert.equal(JSON.stringify(base), input);
  assert.deepEqual(Object.keys(patch), ["faq"]);
  assert.throws(() =>
    prepareAeoEditorPatch({ ...base, url: "/else/" }, base, "Вопрос?", "Ответ"),
  );
  assert.throws(() =>
    prepareAeoEditorPatch({ ...base, faq: [{}] }, base, "Вопрос?", "Ответ"),
  );
  const duplicate = { ...base, faq: [{ q: "Вопрос?", a: "Есть" }] };
  assert.throws(() =>
    prepareAeoEditorPatch(duplicate, duplicate, "Вопрос?", "Ответ"),
  );
  const full = {
    ...base,
    faq: Array.from({ length: 8 }, (_, i) => ({
      q: `Другой ${i}?`,
      a: "Есть",
    })),
  };
  assert.equal(
    (
      prepareAeoEditorPatch(full, full, "Новый вопрос?", "Новый ответ")
        .bodyBlocks as unknown[]
    ).length,
    3,
  );
});
test("question validation reports individual errors and excludes duplicates before quota use", () => {
  const result = questionLines(" SEO аудит?\nseo аудит?\nxy\nДругой вопрос?");
  assert.equal(result.questions.length, 2);
  assert.equal(result.duplicates, 1);
  assert.match(result.errors[0], /Строка 3/);
});
test("review API requires auth, persists decisions, rejects stale source, cross-org and ungrounded acceptance", async () => {
  const adapter = new SqliteD1();
  const env = {
    JWT_SECRET: "fixture-review-secret",
    GPTBOT_DRAFTS_DB: adapter,
    GITHUB_TOKEN: "fixture",
    GITHUB_OWNER: "fixture",
    GITHUB_REPO: "fixture",
  } as unknown as Env;
  await ensureAeoSchema(adapter as unknown as D1Database);
  const store = new AeoStore(adapter as unknown as D1Database);
  const analysis = await analyzeContent(
    files,
    ["Что включает SEO аудит сайта?", "Сколько стоит SEO аудит?"],
    "ru",
  );
  await store.reserve("gptbot-internal", "run", "key", "hash", "analysis", 10);
  await store.finish("gptbot-internal", "run", analysis);
  await store.reserve("OTHER", "other", "other", "hash", "analysis", 10);
  await store.finish("OTHER", "other", analysis);
  const token = await signToken(env, {
    email: "fixture@example.test",
    role: "admin",
  });
  const support = await signToken(env, {
    email: "support@example.test",
    role: "support_readonly",
  });
  const handler = onRequest as (ctx: unknown) => Promise<Response>;
  let raw = files["content/pages/ru/seo.json"];
  let calls = 0;
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.github.com/graphql");
    assert.match(String(init?.body), /query/);
    calls++;
    return Response.json({
      data: {
        repository: {
          object: {
            entries: [
              {
                name: "pages",
                type: "tree",
                object: {
                  entries: [
                    {
                      name: "ru",
                      type: "tree",
                      object: {
                        entries: [
                          {
                            name: "seo.json",
                            type: "blob",
                            object: { text: raw },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
  };
  const invoke = (body?: unknown, auth = token, run = "run") =>
    handler({
      env,
      request: new Request(
        `https://gptbot.uz/api/admin/aeo/review?runId=${run}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${auth}`,
            "Idempotency-Key": "fixture-review-operation",
            Origin: "https://gptbot.uz",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
    });
  try {
    assert.equal((await invoke(undefined, "")).status, 401);
    assert.equal((await invoke(undefined, support)).status, 403);
    assert.equal(calls, 0);
    assert.equal((await invoke(undefined, token, "other")).status, 404);
    const input = {
      runId: "run",
      findingId: analysis.findings[0].id,
      status: "accepted",
      note: "",
      answerDraft: "",
      revision: 0,
    };
    assert.equal((await invoke(input)).status, 200);
    assert.equal((await invoke(input)).status, 200);
    const data = (await (await invoke()).json()) as {
      reviews: AeoReview[];
      freshness: Record<string, string>;
    };
    assert.equal(data.reviews.length, 1);
    assert.equal(data.freshness[input.findingId], "current");
    assert.equal(
      (await invoke({ ...input, findingId: analysis.findings[1].id })).status,
      400,
    );
    raw = raw + " ";
    assert.equal((await invoke({ ...input, revision: 1 })).status, 409);
    await store.reserve("gptbot-internal", "legacy", "legacy-key", "legacy-hash", "analysis", 10);
    await store.finish("gptbot-internal", "legacy", { ...analysis, analyzerVersion: undefined });
    assert.equal((await invoke(undefined, token, "legacy")).status, 200, "old history remains readable");
    const legacy = await invoke({ ...input, runId: "legacy" });
    assert.equal(legacy.status, 409, "old algorithm results require reanalysis before acceptance");
    assert.match(await legacy.text(), /Проверить заново/);
  } finally {
    globalThis.fetch = fetch;
    adapter.sqlite.close();
  }
});
test("model choice is a server allowlist and distinct models have distinct operations", async () => {
  const adapter = new SqliteD1();
  const env = {
    JWT_SECRET: "fixture-model-secret",
    GPTBOT_DRAFTS_DB: adapter,
    OPENROUTER_API_KEY: "fixture",
    AEO_MEASUREMENTS_ENABLED: "true",
    AEO_MEASUREMENT_MODELS: "demo/one:free,demo/two:free",
  } as unknown as Env;
  const token = await signToken(env, {
    email: "fixture@example.test",
    role: "admin",
  });
  const post = onRequestPost as (ctx: unknown) => Promise<Response>;
  let calls = 0;
  const fetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.provider.max_price, {
      prompt: 0,
      completion: 0,
      request: 0,
    });
    return Response.json({
      model: body.model,
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Fixture only response" },
        },
      ],
    });
  };
  const send = (model: string, key: string) =>
    post({
      env,
      request: new Request("https://gptbot.uz/api/admin/aeo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": key },
        body: JSON.stringify({
          kind: "measurement",
          questions: ["Кого рекомендуют?"],
          locale: "ru",
          model,
        }),
      }),
    });
  try {
    assert.equal(
      (await send("unapproved/model:free", "fixture-model-key-00")).status,
      400,
    );
    assert.equal(calls, 0);
    const first = await send("demo/one:free", "fixture-model-key-01");
    assert.equal(first.status, 200);
    const firstRun = await first.json() as { result: { locale: string } };
    assert.equal(firstRun.result.locale, "ru");
    assert.equal(
      (await send("demo/two:free", "fixture-model-key-02")).status,
      200,
    );
    assert.equal(calls, 2);
    const replay = await send("demo/one:free", "fixture-model-key-01");
    assert.deepEqual(await replay.json(), firstRun);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = fetch;
    adapter.sqlite.close();
  }
});
