/**
 * Deterministic RU / Uzbek Latin normalization. It deliberately performs no
 * transliteration, stemming or lemmatization.
 */
export function normalizeKnowledgeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc\u0060\u00b4']/g, '')
    .replace(/[\u2010-\u2015\u2212-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeKnowledgeText(normalized: string): string[] {
  if (!normalized) return [];
  return [...new Set(normalized.split(' ').filter(Boolean))];
}
