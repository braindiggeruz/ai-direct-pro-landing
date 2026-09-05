/** Browser -> real AEO route handlers -> SQLite; only external GitHub/AI transports are fixtures. */
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { SqliteD1 } from "../tests/helpers/sqlite-d1";
import { signToken } from "../functions/lib/jwt";
import { onRequestGet, onRequestPost } from "../functions/api/admin/aeo/index";
import { onRequest as review } from "../functions/api/admin/aeo/review";
import type { Env } from "../functions/_types";

const origin = "http://127.0.0.1:5196";
const output = "docs/aeo/evidence/ux-v2";
await mkdir(output, { recursive: true });
const source = {
  status: "published",
  locale: "ru",
  slug: "seo",
  url: "/ru/seo/",
  h1: "SEO аудит сайта",
  title: "SEO аудит сайта",
  primaryKeyword: "SEO аудит",
  bodyBlocks: [
    {
      type: "p",
      text: "SEO аудит сайта включает проверку технических ошибок, индексации и ссылок.",
    },
  ],
  faq: [],
  internalLinks: [],
  schemaTypes: [],
  secondaryKeywords: [],
};
const browser = await chromium.launch({
  executablePath:
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const originalFetch = globalThis.fetch;
let providerCalls = 0;
let writeCalls = 0;
let failModel = "";
let loseResponse = false;
globalThis.fetch = async (url, init) => {
  if (url === "https://api.github.com/graphql")
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
                            object: { text: JSON.stringify(source) },
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
  if (url === "https://openrouter.ai/api/v1/chat/completions") {
    providerCalls++;
    const body = JSON.parse(String(init?.body));
    if (body.model === failModel) {
      failModel = "";
      return Response.json(
        { error: { message: "Fixture provider unavailable" } },
        { status: 503 },
      );
    }
    const text =
      body.model === "demo/atlas:free"
        ? "Это демонстрационный ответ для проверки интерфейса.\n\n**Компании в ответе**\nGPTBot.uz — упоминание проекта в тестовом примере.\nСтудия А — вымышленное название.\n\n**Что проверить перед выбором**\n- Подходящие проекты в портфолио.\n- Состав работ и поддержку после запуска.\n\nhttps://gptbot.uz/"
        : "Это демонстрационный ответ второй модели.\n\n**Кого рассмотреть**\nСтудия Б — вымышленная компания для UI-теста.\n\n**Как сравнивать предложения**\nОцените прозрачность сметы, сроки и условия поддержки.\n\nhttps://example.org/";
    return Response.json({
      model: body.model,
      choices: [{ finish_reason: "stop", message: { content: text } }],
    });
  }
  throw new Error(`Unexpected external request: ${String(url)}`);
};
const evidence: unknown[] = [];
try {
  for (const width of [1440, 1366, 1024, 768, 390, 320]) {
    const adapter = new SqliteD1();
    const env = {
      JWT_SECRET: "fixture-only-ux-secret",
      GPTBOT_DRAFTS_DB: adapter,
      GITHUB_TOKEN: "fixture",
      GITHUB_OWNER: "fixture",
      GITHUB_REPO: "fixture",
      OPENROUTER_API_KEY: "fixture",
      AEO_MEASUREMENTS_ENABLED: "true",
      AEO_MEASUREMENT_MODELS: "demo/atlas:free,demo/orion:free",
    } as unknown as Env;
    const token = await signToken(env, {
      email: "fixture@example.test",
      role: "admin",
    });
    const context = await browser.newContext({
      viewport: { width, height: width === 1366 ? 768 : 1000 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (value) => localStorage.setItem("gptbot_admin_token", value),
      token,
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/auth/me")
        return route.fulfill({
          json: { email: "fixture@example.test", role: "admin" },
        });
      if (
        url.pathname === "/api/admin/aeo" ||
        url.pathname === "/api/admin/aeo/review"
      ) {
        const handler = (
          url.pathname.endsWith("/review")
            ? review
            : request.method() === "POST"
              ? onRequestPost
              : onRequestGet
        ) as (ctx: unknown) => Promise<Response>;
        const response = await handler({
          env,
          request: new Request(request.url(), {
            method: request.method(),
            headers: request.headers(),
            ...(request.method() === "POST"
              ? { body: request.postData() }
              : {}),
          }),
        });
        if (
          loseResponse &&
          request.method() === "POST" &&
          request.postData()?.includes("measurement")
        ) {
          loseResponse = false;
          return route.abort();
        }
        return route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      }
      if (url.pathname === "/api/content") {
        if (request.method() !== "GET") {
          writeCalls++;
          throw new Error("Browser acceptance must never publish content");
        }
        return route.fulfill({
          json: { pages: [source], blog: [], global: {} },
        });
      }
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          json: { installed: false, totals: { leadsNew: 0 } },
        });
      return route.continue();
    });
    await page.goto(`${origin}/admin-tools/aeo`);
    await page
      .getByRole("heading", { name: "Вопросы и ответы", exact: true })
      .waitFor();
    await page
      .getByLabel("Вопросы, по одному на строку")
      .fill(
        "Что включает SEO аудит сайта?\nСколько стоит SEO аудит сайта?\nКто настраивает Telegram Ads?",
      );
    await page
      .getByRole("button", { name: "Проверить контент", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Карта ответов", exact: true })
      .waitFor();
    await page.getByText("Разобрано 0 из 3", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Вопросы, по одному на строку").count(),
      0,
      "compose collapses",
    );
    if (width >= 1024) {
      const box = await page
        .getByRole("button", { name: "Ответ подходит", exact: true })
        .boundingBox();
      assert.ok(
        box && box.y + box.height < (width === 1366 ? 768 : 1000),
        "primary decision fits viewport",
      );
    }
    await page
      .getByRole("button", { name: /Найден фрагмент ответа Что включает/ })
      .click();
    await page
      .getByRole("button", { name: "Ответ подходит", exact: true })
      .click();
    await page.getByText("Разобрано 1 из 3", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Разобрано 1 из 3", { exact: true }).waitFor();
    if (width <= 768)
      await page
        .getByRole("button", { name: /Найден фрагмент ответа Что включает/ })
        .click();
    await page
      .getByRole("button", { name: "Отменить решение", exact: true })
      .click();
    await page.getByText("Разобрано 0 из 3", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Подготовить правку", exact: true })
      .click();
    await page
      .getByLabel("Что нужно уточнить или улучшить")
      .fill("Проверить полноту ответа. Fixture only.");
    await page
      .getByRole("button", { name: "Сохранить бриф", exact: true })
      .click();
    await page.getByRole("link", { name: "Продолжить в редакторе" }).click();
    await page.getByRole("region", { name: "Контекст AEO" }).waitFor();
    await page
      .getByRole("button", { name: "Добавить в форму редактора" })
      .click();
    await page
      .getByText("Добавлено только в форму.", { exact: false })
      .waitFor();
    await page.getByRole("link", { name: "← Вернуться к разбору" }).click();
    await page.getByText("Разобрано 1 из 3", { exact: true }).waitFor();
    if (width <= 768)
      await page
        .getByRole("button", { name: /Найден фрагмент ответа Что включает/ })
        .click();
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const axe = () =>
      page.evaluate(async () => {
        const engine = (
          window as unknown as {
            axe: {
              run: (
                context: unknown,
                options: unknown,
              ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
            };
          }
        ).axe;
        return engine.run(".aeo-workspace", {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        });
      });
    const reviewAxe = await axe();
    assert.deepEqual(
      reviewAxe.violations.map((v) => v.id),
      [],
      `review axe at ${width}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/review-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Ответы нейросетей", exact: true })
      .click();
    await page
      .getByLabel("Ваш запрос")
      .fill("Кого выбрать для разработки сайта в Ташкенте?");
    const before = providerCalls;
    await page
      .getByRole("button", { name: "Получить ответы", exact: true })
      .click();
    await page.getByText("GPTBot упомянут в тексте", { exact: true }).waitFor();
    await page
      .getByText("GPTBot не найден в тексте этого ответа", { exact: true })
      .waitFor();
    assert.equal(providerCalls - before, 2);
    assert.equal(
      await page.getByRole("link", { name: /gptbot.uz/ }).count(),
      1,
    );
    const answerAxe = await axe();
    assert.deepEqual(
      answerAxe.violations.map((v) => v.id),
      [],
      `answers axe at ${width}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/answers-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Контент gptbot.uz", exact: true })
      .click();
    await page.getByText("Разобрано 1 из 3", { exact: true }).waitFor();
    if (width === 1440) {
      // Returning to the answers tab restores the last typed query and its stored responses.
      await page
        .getByRole("button", { name: "Ответы нейросетей", exact: true })
        .click();
      await page
        .getByText("GPTBot упомянут в тексте", { exact: true })
        .waitFor();
      await page.getByLabel("Ваш запрос").fill("Тест частичного сбоя моделей");
      failModel = "demo/orion:free";
      await page
        .getByRole("button", { name: "Получить ответы", exact: true })
        .click();
      await page
        .getByText("GPTBot упомянут в тексте", { exact: true })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Новый запрос к этой модели",
          exact: true,
        })
        .click();
      await page
        .getByText("GPTBot не найден в тексте этого ответа", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Изменить запрос и модели", exact: true })
        .click();
      await page
        .getByLabel("Ваш запрос")
        .fill("Тест потерянного ответа без повторного вызова");
      await page
        .getByRole("checkbox", { name: "demo/orion:free", exact: true })
        .uncheck();
      const callsBeforeLoss = providerCalls;
      loseResponse = true;
      await page
        .getByRole("button", { name: "Получить ответы", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Проверить результат повторно",
          exact: true,
        })
        .click();
      await page
        .getByText("GPTBot упомянут в тексте", { exact: true })
        .waitFor();
      assert.equal(
        providerCalls - callsBeforeLoss,
        1,
        "uncertain response retries same operation",
      );
      await page
        .getByRole("button", { name: "Контент gptbot.uz", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Изменить бриф", exact: true })
        .click();
      await page
        .getByLabel("Что нужно уточнить или улучшить")
        .fill("Несохранённый бриф сохраняется при переключении вопроса");
      await page
        .getByRole("button", { name: /Не хватает ответа Сколько стоит/ })
        .click();
      await page
        .getByRole("button", { name: /Найден фрагмент ответа Что включает/ })
        .click();
      assert.equal(
        await page.getByLabel("Что нужно уточнить или улучшить").inputValue(),
        "Несохранённый бриф сохраняется при переключении вопроса",
      );
      await page.reload();
      await page.getByLabel("Что нужно уточнить или улучшить").waitFor();
      assert.equal(
        await page.getByLabel("Что нужно уточнить или улучшить").inputValue(),
        "Несохранённый бриф сохраняется при переключении вопроса",
      );
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(() => document.activeElement?.tagName !== "BODY"),
      );
      // Browser zoom halves the CSS viewport; CSS zoom does not trigger media queries.
      await page.setViewportSize({ width: 720, height: 500 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
        "half-width CSS viewport reflows (200% zoom equivalent)",
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.deepEqual(errors, []);
    assert.equal(writeCalls, 0);
    evidence.push({
      width,
      reviewAxe: 0,
      answersAxe: 0,
      consoleErrors: 0,
      overflow: false,
      reviewPersisted: true,
      undo: true,
      editorRoundTrip: true,
      modelResponses: 2,
      publishedContentWrites: 0,
      ...(width === 1440
        ? {
            partialModelFailure: true,
            uncertainRetryProviderCalls: 1,
            unsavedBriefRestored: true,
            keyboardFocus: true,
            halfWidthZoomEquivalent: true,
          }
        : {}),
    });
    await context.close();
    adapter.sqlite.close();
  }
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      {
        source:
          "real local route handlers + SQLite; external providers are fixtures",
        production: false,
        evidence,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(evidence));
} finally {
  globalThis.fetch = originalFetch;
  await browser.close();
}
