// A local studio site for the endpoint tests of T2.1: real SQLite
// (sqlite-d1.ts) with the chat's and the studio's schema, a fake Workers AI
// binding (Flux, Llama Guard, the picture check), and a mocked fetch for
// Siteverify, Z.ai and OpenRouter. No network, no remote database, no key.
import type { TestContext } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SqliteD1 } from "./sqlite-d1";
import { ensureSchema } from "../../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../../functions/lib/gpt-chat/billing-schema";
import { ensureStudioSchema } from "../../functions/lib/studio/schema";
import { mintIdentity, STUDIO_BID_COOKIE } from "../../functions/lib/studio/identity";
import { ZAI_ENDPOINT } from "../../functions/lib/gpt-chat/zai-chat";
import { OPENROUTER_ENDPOINT } from "../../functions/lib/gpt-chat/openrouter-chat";
import { FLUX_MODEL, PROMPT_GUARD_MODEL } from "../../functions/lib/studio/pricing";

// Test-only material (letters only, so no scanner reads it as a key).
export const IDENTITY_KEY = "studio-presentation-test-signing-material-only-for-tests";
export const WIDGET_KEY = "studio-turnstile-test-widget-material-for-decks";
export const ZAI_PLACEHOLDER = "zai-placeholder-for-tests";
export const OPENROUTER_PLACEHOLDER = "openrouter-placeholder-for-tests";
export const SITE = "https://gptbot.uz";
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const GEMMA = "@cf/google/gemma-4-26b-a4b-it";

export const FIXTURE = JSON.parse(readFileSync(path.join(import.meta.dirname, "../fixtures/studio/measure30.json"), "utf8"));
/** The measured free deck «Oddiy kasrlar» (6 slides, Uzbek), as the model wrote it. */
export const KASRLAR = FIXTURE.free.find((deck: { id: string }) => deck.id === "free-uz-kasrlar").deck as {
  title: string;
  subtitle: string;
  slides: Array<{ title: string; bullets: string[]; image_prompt: string }>;
};

export const TASK = { topic: "Oddiy kasrlar", locale: "uz", audience: "maktab", slides: 6, palette: 1 } as const;

/** The switches of a free-deck release (R-ST1), without the ramp, with room for many starts. */
export const OPEN = {
  STUDIO_API: "on",
  STUDIO_FREE_DECK: "true",
  STUDIO_EVENTS: "true",
  STUDIO_RAMP_DECKS_DAILY: "",
  STUDIO_FREE_DAILY_USD: "3",
  STUDIO_JOB_GLOBAL_PER_MIN: "60",
};

/** A small but well-formed JPEG (SOI, JFIF APP0, EOI). */
export const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
export const JPEG_BASE64 = Buffer.from(JPEG).toString("base64");
export const SAFE_VERDICT = JSON.stringify({ person: false, face: false, text: false, flag: false, weapon: false, nudity: false, blood: false });

export type AiReply = unknown | Error | "hang";

/** env.AI: answers per model from a queue, or a default; records every call. */
export class FakeAi {
  readonly calls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
  readonly queues = new Map<string, AiReply[]>();
  readonly defaults = new Map<string, AiReply>([
    [FLUX_MODEL, { image: JPEG_BASE64 }],
    [PROMPT_GUARD_MODEL, { response: "\n\nsafe" }],
    [GEMMA, { response: SAFE_VERDICT }],
  ]);

  queue(model: string, ...replies: AiReply[]): void {
    this.queues.set(model, [...(this.queues.get(model) ?? []), ...replies]);
  }

  count(model: string): number {
    return this.calls.filter((call) => call.model === model).length;
  }

  async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ model, inputs });
    const queued = this.queues.get(model);
    const reply = queued?.length ? queued.shift() : this.defaults.get(model);
    if (reply === undefined) throw new Error(`no fake answer for ${model}`);
    if (reply === "hang") return new Promise(() => undefined);
    if (reply instanceof Error) throw reply;
    return reply;
  }
}

/** A Z.ai stream carrying `content`, as llm.ts reads it. */
export function zaiStream(content: string, options: { finish?: string; usage?: object } = {}): Response {
  const usage = options.usage ?? { prompt_tokens: 900, completion_tokens: 700, completion_tokens_details: { reasoning_tokens: 3 } };
  const pieces = content.match(/[\s\S]{1,40}/g) ?? [""];
  const events = [
    ...pieces.map((piece) => ({ choices: [{ delta: { content: piece } }] })),
    { choices: [{ delta: {}, finish_reason: options.finish ?? "stop" }], usage },
  ];
  const wire = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(wire, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export const zaiError = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code, message: "provider message that must never be read" } }), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The measured deck as the model's answer, with `patch` applied to its slides. */
export function deckAnswer(patch: (slides: typeof KASRLAR.slides) => typeof KASRLAR.slides = (slides) => slides): Response {
  return zaiStream(JSON.stringify({ ...KASRLAR, slides: patch(structuredClone(KASRLAR.slides)) }));
}

type Reply = Response | Error | (() => Response | Promise<Response>);

export interface Site {
  readonly db: SqliteD1;
  readonly env: Record<string, unknown>;
  readonly ai: FakeAi;
  /** Z.ai answers, in order. */
  readonly zai: Reply[];
  readonly openRouter: Reply[];
  /** Bodies sent to Z.ai / OpenRouter, parsed. */
  readonly sent: Array<{ url: string; body: Record<string, unknown> }>;
  readonly siteverify: Array<{ response: string }>;
  /** What Siteverify answers. */
  turnstile: Record<string, unknown>;
  /** Promises handed to waitUntil. */
  readonly waits: Promise<unknown>[];
  /** Log lines (console.log). */
  readonly logs: string[];
}

export const PASS = { success: true, action: "studio_free_deck", hostname: "gptbot.uz" };

export async function studioSite(context: TestContext, options: { config?: Record<string, string>; env?: Record<string, unknown> } = {}): Promise<Site> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  const ai = new FakeAi();
  const site: Site = {
    db,
    ai,
    env: {
      STUDIO_RUNTIME_CONFIG_JSON: JSON.stringify({ ...OPEN, ...options.config }),
      GPT_IDENTITY_SECRET: IDENTITY_KEY,
      STUDIO_TURNSTILE_SECRET_KEY: WIDGET_KEY,
      ZAI_API_KEY: ZAI_PLACEHOLDER,
      GPTBOT_DRAFTS_DB: db.asD1(),
      AI: ai,
      ...options.env,
    },
    zai: [],
    openRouter: [],
    sent: [],
    siteverify: [],
    turnstile: { ...PASS },
    waits: [],
    logs: [],
  };
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === SITEVERIFY) {
      const form = init?.body as FormData;
      site.siteverify.push({ response: String(form.get("response")) });
      return Response.json(site.turnstile);
    }
    const queue = url === ZAI_ENDPOINT ? site.zai : url === OPENROUTER_ENDPOINT ? site.openRouter : null;
    if (!queue) throw new Error(`unexpected fetch ${url}`);
    site.sent.push({ url, body: JSON.parse(String(init?.body)) });
    const reply = queue.shift();
    if (!reply) throw new Error(`no answer queued for ${url}`);
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply() : reply;
  });
  context.mock.method(console, "log", (line: unknown) => {
    site.logs.push(String(line));
  });
  return site;
}

/** A fresh browser identity's cookie header. */
export async function browser(now = Date.now()): Promise<{ cookie: string; subject: string }> {
  const minted = await mintIdentity({ GPT_IDENTITY_SECRET: IDENTITY_KEY }, now);
  if (!minted) throw new Error("no identity");
  return { cookie: `${STUDIO_BID_COOKIE}=${minted.value}`, subject: minted.identity.subject };
}

export interface PostOptions {
  readonly cookie?: string;
  readonly origin?: string | null;
  readonly host?: string;
  readonly ip?: string;
  readonly method?: string;
}

export function post(pathname: string, body: unknown, options: PostOptions = {}): Request {
  const host = options.host ?? SITE;
  const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": options.ip ?? "203.0.113.7" };
  const origin = options.origin === undefined ? host : options.origin;
  if (origin !== null) headers.Origin = origin;
  if (options.cookie) headers.Cookie = options.cookie;
  const method = options.method ?? "POST";
  return new Request(`${host}${pathname}`, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
}

type Handler = (context: unknown) => Response | Promise<Response>;

/** Calls a Pages handler the way the runtime does; waitUntil promises land in site.waits. */
export async function call(site: Site, handler: unknown, request: Request, params: Record<string, string> = {}): Promise<Response> {
  return (handler as Handler)({
    request,
    env: site.env,
    params,
    data: {},
    waitUntil: (promise: Promise<unknown>) => site.waits.push(promise),
    next: () => {
      throw new Error("next() called");
    },
    passThroughOnException: () => undefined,
    functionPath: new URL(request.url).pathname,
  });
}

let requests = 0;
export const requestId = () => `req_${(++requests).toString().padStart(10, "0")}`;

export const createBody = (over: Record<string, unknown> = {}) => ({ requestId: requestId(), ...TASK, shape: "free", turnstileToken: "token-ok", ...over });
