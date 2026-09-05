/** Review bridge changes only an unsaved editor form, never publishes or changes identity. */
export function prepareAeoEditorPatch(
  current: Record<string, unknown>,
  base: Record<string, unknown>,
  question: string,
  answer: string,
): Record<string, unknown> {
  if (!answer.trim() || answer.length > 10000)
    throw new Error("Заполните текст ответа в брифе.");
  if (current.url !== base.url || current.locale !== base.locale)
    throw new Error("Этот бриф относится к другой странице.");
  for (const field of ["faq", "body", "bodyBlocks"])
    if (
      JSON.stringify(current[field] || []) !== JSON.stringify(base[field] || [])
    )
      throw new Error(
        "Текст в редакторе отличается от проверенного источника. Сначала сохраните или отмените свои изменения и повторите анализ.",
      );
  const faq = Array.isArray(current.faq) ? current.faq : [];
  const normalize = (value: unknown) =>
    String(value).toLowerCase().replace(/[?!.]/g, "").trim();
  if (
    faq.some(
      (f) => f && normalize((f as { q?: unknown }).q) === normalize(question),
    )
  )
    throw new Error(
      "Вопрос уже есть в FAQ. Отредактируйте существующий ответ вручную.",
    );
  if (faq.length < 8)
    return { faq: [...faq, { q: question, a: answer.trim() }] };
  const field = Array.isArray(current.bodyBlocks) ? "bodyBlocks" : "body";
  const body = Array.isArray(current[field])
    ? (current[field] as unknown[])
    : [];
  if (
    body.some(
      (b) =>
        b && normalize((b as { text?: unknown }).text) === normalize(question),
    )
  )
    throw new Error("Раздел с этим вопросом уже существует.");
  return {
    [field]: [
      ...body,
      { type: "h2", text: question },
      { type: "p", text: answer.trim() },
    ],
  };
}
