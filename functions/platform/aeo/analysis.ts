import type {
  AeoAnalysis,
  AeoEvidence,
  AeoFinding,
} from "../../../src/shared/aeo";

const STOP = new Set(
  "и в на для по из с к а но это как что сколько где какие какой такое стоит the a of uchun va bu qanday nima qancha turadi".split(
    " ",
  ),
);
export async function sha256(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function tokens(text: string): Set<string> {
  const endings = [
    "иями",
    "ами",
    "ями",
    "ого",
    "ему",
    "ыми",
    "ими",
    "lar",
    "ning",
    "ов",
    "ам",
    "ах",
    "ni",
    "а",
    "я",
    "о",
    "е",
    "у",
    "ю",
    "ы",
    "и",
  ];
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
      .filter((t) => !STOP.has(t))
      .map((t) => {
        const ending = endings.find(
          (s) => t.endsWith(s) && t.length - s.length >= 3,
        );
        return ending ? t.slice(0, -ending.length) : t;
      }),
  );
}
function overlap(question: string, text: string): number {
  const q = tokens(question),
    p = tokens(text);
  return q.size ? [...q].filter((t) => p.has(t)).length / q.size : 0;
}
const TARGET_CONTEXT = tokens(
  "купить заказать найти выбрать ташкент узбекистан toshkent tashkent uzbekistan o‘zbekiston sotib olish buy order find choose",
);
function questionIntent(
  text: string,
): "timing" | "price" | "definition" | "other" {
  if (/срок|долго|времени|muddat|vaqt/i.test(text)) return "timing";
  if (/стоит|цена|стоимость|narx|qancha|turadi/i.test(text)) return "price";
  if (/что такое|что значит|nima/i.test(text)) return "definition";
  return "other";
}
function targetScore(question: string, data: Record<string, unknown>): number {
  const heading = String(data.h1 || data.title || "");
  const title = `${heading} ${data.title || ""} ${data.primaryKeyword || ""}`;
  const q = tokens(question),
    p = tokens(title);
  if (!q.size || !p.size) return 0;
  // Purchase verbs and shared geography are context, not the subject. A cake
  // query must not attach to an agency article just because both say "buy"/"Tashkent".
  const subjects = [...q].filter((word) => !TARGET_CONTEXT.has(word));
  if (subjects.length && !subjects.some((word) => p.has(word))) return 0;
  const intersection = [...q].filter((t) => p.has(t)).length;
  const jaccard = intersection / new Set([...q, ...p]).size;
  const phrase = [...tokens(heading)].join(" ").includes([...q].join(" "));
  const intent = questionIntent(question);
  const titleIntent = questionIntent(title);
  const intentMatch = intent !== "other" && titleIntent === intent;
  const conflictingIntent =
    intent !== "other" && titleIntent !== "other" && intent !== titleIntent;
  const keywordMatch =
    [...tokens(String(data.primaryKeyword || ""))].join(" ") ===
    [...q].join(" ");
  return Math.max(
    0,
    Math.min(
      1,
      (0.6 * intersection) / q.size +
        0.2 * jaccard +
        (phrase ? 0.1 : 0) +
        (intentMatch ? 0.1 : 0) +
        (keywordMatch ? 0.05 : 0) -
        (conflictingIntent ? 0.15 : 0),
    ),
  );
}
function intentMatches(question: string, text: string): boolean {
  if (/срок|долго|времени|muddat|vaqt/i.test(question))
    return /\d+\s*(дн|нед|месяц|час|kun|hafta|oy)/i.test(text);
  if (/стоит|цена|стоимость|narx|qancha/i.test(question))
    return /\d[\d\s.,–—-]*(?:млн|тыс\.?|million|ming)?\s*(сум|so.m|usd|доллар|\$)/i.test(
      text,
    );
  if (questionIntent(question) === "definition")
    return /(?:^|[.!?]\s)[^.!?]{0,60}(?: — | – | это | bu )/i.test(text);
  return true;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function normalizeQuestions(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 40)
    throw new Error("Укажите от 1 до 40 вопросов.");
  const questions = value.map((q) => {
    if (
      typeof q !== "string" ||
      q.trim().length < 3 ||
      q.length > 300 ||
      [...q].some((c) => c.charCodeAt(0) < 32)
    )
      throw new Error("Вопрос должен содержать от 3 до 300 символов.");
    return q.trim().replace(/\s+/g, " ");
  });
  return [...new Map(questions.map((q) => [q.toLowerCase(), q])).values()];
}

export async function analyzeContent(
  files: Record<string, string>,
  questions: string[],
  locale: "ru" | "uz",
  targetFile?: string,
): Promise<AeoAnalysis> {
  const pages: {
    file: string;
    hash: string;
    data: Record<string, unknown>;
    evidence: AeoEvidence[];
  }[] = [];
  const frozen: RegExp[] = [];
  const policy = files["content/seo/demand-policy.json"];
  if (policy) {
    const clusters = record(JSON.parse(policy)).frozenClusters;
    if (!Array.isArray(clusters))
      throw new Error("Не удалось прочитать политику контента.");
    for (const c of clusters)
      for (const p of (record(c).keywordPatterns as string[]) || [])
        frozen.push(new RegExp(p, "i"));
  }
  for (const [file, raw] of Object.entries(files).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!/^content\/(pages|blog)\//.test(file) || !file.endsWith(".json"))
      continue;
    const data = record(JSON.parse(raw));
    if (data.status !== "published" || data.locale !== locale) continue;
    if (
      typeof data.url !== "string" ||
      !/^\/(?:[a-z0-9-]+\/)*$/i.test(data.url)
    )
      throw new Error("Некорректный URL опубликованной страницы.");
    const evidence: AeoEvidence[] = [];
    if (typeof data.intro === "string" && data.intro.length >= 30)
      evidence.push({ path: "intro", text: data.intro });
    const bodyKey = Array.isArray(data.bodyBlocks) ? "bodyBlocks" : "body";
    const body = data[bodyKey];
    if (Array.isArray(body))
      body.forEach((b, i) => {
        const block = record(b);
        if (
          ["p", "quote"].includes(String(block.type)) &&
          typeof block.text === "string" &&
          block.text.length >= 30
        )
          evidence.push({ path: `${bodyKey}[${i}].text`, text: block.text });
      });
    if (Array.isArray(data.faq))
      data.faq.forEach((f, i) => {
        const faq = record(f);
        if (typeof faq.a === "string")
          evidence.push({ path: `faq[${i}].a`, text: faq.a });
      });
    pages.push({
      file,
      hash: await sha256(raw.replace(/\r\n/g, "\n")),
      data,
      evidence,
    });
  }
  if (!pages.length)
    throw new Error("Опубликованный контент не получен. Анализ остановлен.");
  const findings: AeoFinding[] = [];
  for (const question of questions) {
    const ranked = pages
      .map((p) => ({ ...p, score: targetScore(question, p.data) }))
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    const target = targetFile
      ? ranked.find((p) => p.file === targetFile) || null
      : ranked[0].score >= 0.35
        ? ranked[0]
        : null;
    if (targetFile && !target)
      throw new Error(
        "Выбранная опубликованная страница недоступна для этого языка.",
      );
    const evidence =
      target?.evidence
        .filter(
          (e) =>
            overlap(question, e.text) >= 0.5 && intentMatches(question, e.text),
        )
        .sort((a, b) => overlap(question, b.text) - overlap(question, a.text))
        .slice(0, 2) || [];
    const duplicate =
      target &&
      Array.isArray(target.data.faq) &&
      target.data.faq.some(
        (f) =>
          String(record(f).q).toLowerCase().replace(/[?!.]/g, "").trim() ===
          question.toLowerCase().replace(/[?!.]/g, "").trim(),
      );
    const frozenTarget =
      target && frozen.some((p) => p.test(`${question} ${target.data.h1}`));
    const status: AeoFinding["status"] = !target
      ? "no_target"
      : frozenTarget
        ? "frozen"
        : duplicate
          ? "covered"
          : "review";
    const answer = evidence.length
      ? evidence.map((e) => e.text).join(" ")
      : null;
    findings.push({
      id: (await sha256(`${question}|${target?.hash}`)).slice(0, 24),
      question,
      status,
      score: target?.score || 0,
      url: target ? String(target.data.url) : null,
      title: target ? String(target.data.h1 || target.data.title) : null,
      file: target?.file || null,
      slug: target
        ? String(
            target.data.slug ||
              target.file
                .split("/")
                .at(-1)
                ?.replace(/\.json$/, ""),
          )
        : null,
      sourceHash: target?.hash || null,
      evidence,
      answer,
      reason:
        status === "no_target"
          ? "На gptbot.uz не найдена страница по теме запроса. Можно посмотреть ответы нейросетей или подготовить бриф, если эта тема нужна вашему сайту."
          : status === "frozen"
            ? "Кластер ограничен политикой контента. Требуется отдельное решение владельца."
            : status === "covered"
              ? "Такой вопрос уже есть в FAQ. Проверьте актуальность ответа."
              : answer
                ? "Найден ответ в исходном контенте. Проверьте, полностью ли он отвечает на вопрос."
                : "Страница подходит по теме, но подтверждённого ответа пока нет.",
    });
  }
  return {
    schemaVersion: 1,
    analyzerVersion: 2,
    createdAt: new Date().toISOString(),
    locale,
    sourceKind: "manual",
    contentHash: await sha256(
      JSON.stringify(pages.map((p) => [p.file, p.hash])),
    ),
    pages: pages.length,
    findings,
  };
}
