import type { AeoRun } from "./aeo";

export function aeoRunLocale(run: AeoRun): "ru" | "uz" | "unknown" {
  return run.failure?.locale || run.result?.locale || "unknown";
}

export function filterAeoHistory(runs: AeoRun[], query: string, locale: string): AeoRun[] {
  const needle = query.trim().toLowerCase();
  return runs.filter((run) => {
    if (locale !== "all" && aeoRunLocale(run) !== locale) return false;
    const questions = run.failure?.questions || (run.result && "findings" in run.result
      ? run.result.findings.map((finding) => finding.question)
      : run.result && "question" in run.result ? [run.result.question] : []);
    return !needle || questions.some((question) => question.toLowerCase().includes(needle));
  });
}

// Render and export the same settled result after polling resolves an accepted request.
export function resolveAeoRun(run: AeoRun | null, current: AeoRun[]): AeoRun | null {
  return run?.status === "running" ? current.find((candidate) => candidate.id === run.id) || run : run;
}
