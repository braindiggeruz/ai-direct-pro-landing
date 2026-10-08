/** Authored content dates only: never substitute the build time. */
export function dateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString().split('T')[0];
}

export function latestDate(values: Array<string | undefined>): string | undefined {
  return values.map(dateOnly).filter((value): value is string => !!value).sort().at(-1);
}

/** A review does not conceal a subsequent edit; it remains a separate source field. */
export function pageModifiedDate(page: { lastReviewedAt?: string; updatedAt?: string }): string | undefined {
  return latestDate([page.lastReviewedAt, page.updatedAt]);
}
