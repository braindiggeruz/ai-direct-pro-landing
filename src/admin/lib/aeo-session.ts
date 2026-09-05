export function readAeoSession<T>(key: string, fallback: T): T {
  try {
    return (
      (JSON.parse(sessionStorage.getItem(`aeo:${key}`) || "null") as T) ||
      fallback
    );
  } catch {
    return fallback;
  }
}
export function saveAeoSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(`aeo:${key}`, JSON.stringify(value));
  } catch {
    /* Optional session recovery. */
  }
}
export function downloadAeo(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function questionLines(value: string) {
  const seen = new Set<string>();
  const questions: string[] = [];
  const errors: string[] = [];
  let duplicates = 0;
  value.split("\n").forEach((raw, i) => {
    const q = raw.trim().replace(/\s+/g, " ");
    if (!q) return;
    if (q.length < 3 || q.length > 300) {
      errors.push(`Строка ${i + 1}: нужно от 3 до 300 символов.`);
      return;
    }
    if (seen.has(q.toLowerCase())) {
      duplicates++;
      return;
    }
    seen.add(q.toLowerCase());
    questions.push(q);
  });
  if (questions.length > 40)
    errors.push("За один запуск можно проверить до 40 уникальных вопросов.");
  return { questions, errors, duplicates };
}
