// /api/studio/* in functions/_middleware.ts (spec §3.4): CORS for the site's
// own origin only, no-store, Cross-Origin-Resource-Policy: same-origin, like
// /api/gpt/*. Before this branch the path fell into the catch-all, which
// reflects any Origin. Every other path answers exactly as before.
// Run: node --import tsx --test tests/studio-middleware-cors.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as middleware } from "../functions/_middleware";

type Next = () => Promise<Response>;

/** A route that answers JSON and (wrongly) allows every origin and lets caches keep it. */
const sloppyRoute: Next = async () =>
  Response.json({ ok: true }, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "X-Any", "Cache-Control": "public, max-age=600" },
  });

function call(request: Request, next: Next = sloppyRoute): Promise<Response> {
  return middleware({ request, env: {}, next } as never) as Promise<Response>;
}

const STUDIO_PATHS = ["/api/studio/config", "/api/studio/me", "/api/studio/identity", "/api/studio/presentations/sj_x/images", "/api/studio"];

test("a preflight from a foreign origin is refused without Access-Control-Allow-Origin", async () => {
  for (const path of STUDIO_PATHS) {
    for (const origin of ["https://evil.example", "https://gptbot.uz.evil.example", "http://gptbot.uz", "null"]) {
      const response = await call(new Request(`https://gptbot.uz${path}`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
      }));
      assert.equal(response.status, 403, `${path} ${origin}`);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.equal(response.headers.get("access-control-allow-credentials"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const bare = await call(new Request(`https://gptbot.uz${path}`, { method: "OPTIONS" }));
    assert.equal(bare.status, 403, path);
    assert.equal(bare.headers.get("access-control-allow-origin"), null);
  }
});

test("a preflight from the site itself names only the site", async () => {
  const response = await call(new Request("https://gptbot.uz/api/studio/identity", {
    method: "OPTIONS",
    headers: { Origin: "https://gptbot.uz", "Access-Control-Request-Method": "POST" },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://gptbot.uz");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Origin");
});

test("answers: no-store and CORP same-origin always; the route's own CORS headers never reach a foreign origin", async () => {
  for (const path of STUDIO_PATHS) {
    const foreign = await call(new Request(`https://gptbot.uz${path}`, { headers: { Origin: "https://evil.example" } }));
    assert.equal(foreign.status, 200);
    assert.equal(foreign.headers.get("access-control-allow-origin"), null, path);
    assert.equal(foreign.headers.get("access-control-allow-headers"), null, path);
    assert.equal(foreign.headers.get("access-control-allow-credentials"), null, path);
    assert.equal(foreign.headers.get("cache-control"), "no-store", path);
    assert.equal(foreign.headers.get("cross-origin-resource-policy"), "same-origin", path);
    assert.equal(foreign.headers.get("x-content-type-options"), "nosniff");

    const none = await call(new Request(`https://gptbot.uz${path}`));
    assert.equal(none.headers.get("access-control-allow-origin"), null, path);
    assert.equal(none.headers.get("cache-control"), "no-store", path);
    assert.equal(none.headers.get("cross-origin-resource-policy"), "same-origin", path);

    const own = await call(new Request(`https://gptbot.uz${path}`, { headers: { Origin: "https://gptbot.uz" } }));
    assert.equal(own.headers.get("access-control-allow-origin"), "https://gptbot.uz", path);
    assert.equal(own.headers.get("access-control-allow-credentials"), "true", path);
    assert.equal(own.headers.get("cache-control"), "no-store", path);
  }
});

test("a picture (image/jpeg) and an error keep their status and body, under the same headers", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const picture = await call(
    new Request("https://gptbot.uz/api/studio/presentations/sj_x/images", { method: "POST", headers: { Origin: "https://gptbot.uz" } }),
    async () => new Response(jpeg, { headers: { "Content-Type": "image/jpeg", "X-Robots-Tag": "noindex" } }),
  );
  assert.equal(picture.headers.get("content-type"), "image/jpeg");
  assert.equal(picture.headers.get("x-robots-tag"), "noindex");
  assert.equal(picture.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.deepEqual(new Uint8Array(await picture.arrayBuffer()), jpeg);
  const missing = await call(new Request("https://gptbot.uz/api/studio/me"), async () => Response.json({ ok: false, code: "not_found" }, { status: 404 }));
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
});

test("other paths answer exactly as before: the catch-all still reflects, /api/gpt is unchanged", async () => {
  // A path that merely starts with "studio" is not the studio API.
  for (const path of ["/api/studios", "/api/studio-report", "/uz/taqdimot-ai/", "/api/internal/studio-report"]) {
    const response = await call(new Request(`https://gptbot.uz${path}`, { headers: { Origin: "https://evil.example" } }));
    assert.equal(response.headers.get("access-control-allow-origin"), "https://evil.example", path);
    assert.equal(response.headers.get("cross-origin-resource-policy"), null, path);
    assert.equal(response.headers.get("cache-control"), "public, max-age=600", path);
    const preflight = await call(new Request(`https://gptbot.uz${path}`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } }));
    assert.equal(preflight.status, 204, path);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*", path);
  }
  const gpt = await call(new Request("https://gptbot.uz/api/gpt/history", { headers: { Origin: "https://evil.example" } }));
  assert.equal(gpt.headers.get("access-control-allow-origin"), null);
  assert.equal(gpt.headers.get("cross-origin-resource-policy"), "same-origin");
  const gptPreflight = await call(new Request("https://gptbot.uz/api/gpt/lead", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }));
  assert.equal(gptPreflight.status, 403);
});
