import type { AeoObservation } from "../../../src/shared/aeo";
import { createAiFacade } from "../ai/facade";
import { AiPolicyResolver } from "../ai/policy";
import { AiError } from "../ai/errors";

export function allowedModel(model: string | undefined): string | null {
  return model && /^[a-z0-9-]+\/[a-z0-9._-]+:free$/i.test(model) ? model : null;
}
/** Raw provider output is evidence, never publishable business copy. Fixed host, no tools or paid fallback. */
export async function observe(
  question: string,
  model: string,
  key: string,
  transport: typeof fetch = fetch,
): Promise<AeoObservation> {
  const result: AeoObservation = {
    question,
    provider: "openrouter",
    model,
    requestedModel: model,
    mode: "ungrounded",
    observedAt: new Date().toISOString(),
    ok: false,
    aiPresent: false,
    citations: [],
    visibility: null,
    text: "",
    error: null,
    verdict: "insufficient",
  };
  if (!allowedModel(model))
    throw new Error(
      "Measurement model must be an explicitly configured free model",
    );
  try {
    const facade = createAiFacade({
      policy: new AiPolicyResolver([
        {
          task: "analysis",
          tier: "free",
          routes: [{ driver: "aeo-observation", model }],
          maxAttempts: 1,
          timeoutMs: 25_000,
          temperature: 0,
          maxTokens: 1200,
        },
      ]),
      drivers: [
        {
          id: "aeo-observation",
          complete: async (request) => {
            const response = await transport(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                method: "POST",
                signal: request.signal,
                // Workers implements only manual/follow. Never forward credentials to a redirect.
                redirect: "manual",
                headers: {
                  Authorization: `Bearer ${key.trim()}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://gptbot.uz",
                },
                body: JSON.stringify({
                  model: request.model,
                  plugins: [],
                  provider: {
                    allow_fallbacks: false,
                    max_price: { prompt: 0, completion: 0, request: 0 },
                  },
                  max_tokens: request.maxTokens,
                  temperature: request.temperature,
                  messages: request.messages,
                }),
              },
            );
            if (!response.ok) {
              result.error = `Провайдер вернул HTTP ${response.status}.`;
              throw new Error("provider_http_error");
            }
            const reader = response.body?.getReader();
            if (!reader) throw new Error("missing_body");
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > 200_000) {
                await reader.cancel();
                throw new Error("oversized_body");
              }
              chunks.push(value);
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.length;
            }
            // Preserve provider annotations in the evidence envelope across the neutral text contract.
            return {
              text: new TextDecoder().decode(bytes),
              provider: "openrouter",
              model: request.model,
            };
          },
        },
      ],
    });
    const response = await facade.complete(
      { messages: [{ role: "user", content: question }] },
      { task: "analysis", tier: "free" },
    );
    const body = JSON.parse(response.text) as {
      model?: string;
      choices?: {
        finish_reason?: string;
        message?: {
          content?: unknown;
          annotations?: {
            type?: string;
            url_citation?: { url?: string; title?: string };
          }[];
        };
      }[];
    };
    const choice = body.choices?.[0];
    if (
      !choice?.message ||
      typeof choice.message.content !== "string" ||
      !choice.message.content.trim() ||
      choice.message.content.length > 12000 ||
      choice.finish_reason !== "stop"
    ) {
      result.error = "Неполный или некорректный ответ провайдера.";
      return result;
    }
    result.text = choice.message.content.slice(0, 12000);
    result.model =
      typeof body.model === "string" &&
      body.model.length <= 200 &&
      body.model.trim()
        ? body.model
        : model;
    for (const annotation of choice.message.annotations || []) {
      if (annotation.type !== "url_citation") continue;
      try {
        const url = new URL(annotation.url_citation?.url || "");
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          continue;
        if (!result.citations.some((c) => c.url === url.href))
          result.citations.push({
            url: url.href,
            title:
              annotation.url_citation?.title?.slice(0, 200) || url.hostname,
          });
      } catch {
        /* malformed citation is excluded, never fetched */
      }
    }
    result.ok = true;
    result.aiPresent = result.text.trim().length > 0;
    result.visibility = result.citations.some((c) => {
      const host = new URL(c.url).hostname.replace(/\.$/, "");
      return host === "gptbot.uz" || host.endsWith(".gptbot.uz");
    })
      ? 1
      : 0;
    return result;
  } catch (error) {
    result.error ||= error instanceof AiError && error.code === "timeout"
      ? "Модель не ответила за 25 секунд. Можно повторить запрос вручную."
      : "Не удалось получить ответ модели. Повторите запрос или выберите другую модель.";
    return result;
  }
}
