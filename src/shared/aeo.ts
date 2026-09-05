export interface AeoEvidence {
  path: string;
  text: string;
}
export interface AeoFinding {
  id: string;
  question: string;
  status: "covered" | "review" | "no_target" | "frozen";
  score: number;
  url: string | null;
  title: string | null;
  file: string | null;
  slug: string | null;
  sourceHash: string | null;
  evidence: AeoEvidence[];
  answer: string | null;
  reason: string;
}
export interface AeoAnalysis {
  schemaVersion: 1;
  createdAt: string;
  locale: "ru" | "uz";
  sourceKind: "manual";
  contentHash: string;
  pages: number;
  findings: AeoFinding[];
}
export interface AeoRun {
  id: string;
  kind: "analysis" | "measurement";
  status: "running" | "completed" | "failed";
  created_at: string;
  result: AeoAnalysis | AeoObservation | null;
}
export interface AeoObservation {
  requestedModel?: string;
  question: string;
  provider: string;
  model: string;
  mode: "ungrounded";
  observedAt: string;
  ok: boolean;
  aiPresent: boolean;
  citations: { url: string; title: string }[];
  visibility: number | null;
  text: string;
  error: string | null;
  verdict: "insufficient";
}
export interface AeoWorkspace {
  domain: "gptbot.uz";
  access: "internal";
  measurement: {
    available: boolean;
    model: string | null;
    models?: string[];
    dailyLimit: number;
    used: number;
    mode: "ungrounded";
  };
  runs: AeoRun[];
  reviewCounts?: Record<string, number>;
}

export type AeoReviewStatus = "unreviewed" | "accepted" | "draft" | "skipped";
export interface AeoReview {
  priority?: 1 | 2 | 3;
  runId: string;
  findingId: string;
  status: AeoReviewStatus;
  note: string;
  answerDraft: string;
  revision: number;
  updatedAt: string;
  sourceHash: string | null;
  target: AeoFinding | null;
}
export interface AeoReviewInput {
  priority?: 1 | 2 | 3;
  runId: string;
  findingId: string;
  status: AeoReviewStatus;
  note: string;
  answerDraft: string;
  revision: number;
  targetFile?: string;
}
export interface AeoReviewWorkspace {
  analysis: AeoAnalysis;
  reviews: AeoReview[];
  freshness: Record<string, "current" | "stale" | "no_source">;
  pages: { file: string; title: string; url: string }[];
  editorBases: Record<string, Record<string, unknown>>;
}
export const findingClass = (finding: AeoFinding) =>
  finding.status === "review"
    ? finding.answer
      ? "answer"
      : "missing"
    : finding.status;
export const findingLabels = {
  answer: "Найден фрагмент ответа",
  missing: "Не хватает ответа",
  no_target: "Страница не найдена",
  covered: "Вопрос найден в FAQ",
  frozen: "Правки ограничены",
};
export const reviewLabels: Record<AeoReviewStatus, string> = {
  unreviewed: "Не разобрано",
  accepted: "Ответ подходит",
  draft: "Бриф сохранён",
  skipped: "Пропущено",
};
