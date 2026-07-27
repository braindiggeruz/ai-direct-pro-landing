import type {
  KnowledgeItem,
  KnowledgeSearchResult,
} from './types';

export function rankKnowledgeItems(
  candidates: readonly KnowledgeItem[],
  normalizedQuery: string,
  tokens: readonly string[],
): KnowledgeSearchResult[] {
  const results: KnowledgeSearchResult[] = [];
  for (const item of candidates) {
    const matchedTokens = tokens.filter((token) => item.searchText.includes(token)).length;
    if (matchedTokens === 0) continue;

    let score: number;
    if (item.searchText === normalizedQuery) {
      score = 4_000;
    } else if (item.searchText.startsWith(normalizedQuery)) {
      score = 3_000;
    } else if (matchedTokens === tokens.length) {
      score = 2_000 + matchedTokens;
    } else {
      score = 1_000 + matchedTokens;
    }
    results.push({ item, score, matchedTokens });
  }
  return results.sort(
    (left, right) =>
      right.score - left.score
      || right.item.updatedAt.localeCompare(left.item.updatedAt)
      || left.item.id.localeCompare(right.item.id),
  );
}
