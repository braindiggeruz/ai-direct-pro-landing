// Shared SEO meta-field validation warnings.
//
// The same length-check + Cyrillic-in-UZ logic was duplicated across
// 6 files (optimize-runner, translate-runner, retarget-client,
// apply-optimization, apply-links, apply-retarget).

export interface SeoValidationIssue {
  level: string;
  rule: string;
  field?: string;
  message: string;
}

export function buildSeoWarnings(
  article: { meta_title: string; meta_description: string; locale?: string },
  opts?: { locale?: string; asStrings?: false; articleJson?: string },
): SeoValidationIssue[];
export function buildSeoWarnings(
  article: { meta_title: string; meta_description: string; locale?: string },
  opts: { locale?: string; asStrings: true; articleJson?: string },
): string[];
export function buildSeoWarnings(
  article: { meta_title: string; meta_description: string; locale?: string },
  opts: { locale?: string; asStrings?: boolean; articleJson?: string } = {},
): SeoValidationIssue[] | string[] {
  const locale = opts.locale || article.locale;
  const asStrings = opts.asStrings ?? false;

  const issues: SeoValidationIssue[] = [];
  const strings: string[] = [];

  if (article.meta_title.length < 30 || article.meta_title.length > 70) {
    if (asStrings) {
      strings.push(`meta_title length ${article.meta_title.length} (recommended 45-65)`);
    } else {
      issues.push({
        level: 'warn',
        rule: 'meta_title_length',
        field: 'meta_title',
        message: `length ${article.meta_title.length}`,
      });
    }
  }

  if (article.meta_description.length < 110 || article.meta_description.length > 170) {
    if (asStrings) {
      strings.push(`meta_description length ${article.meta_description.length} (recommended 120-160)`);
    } else {
      issues.push({
        level: 'warn',
        rule: 'meta_description_length',
        field: 'meta_description',
        message: `length ${article.meta_description.length}`,
      });
    }
  }

  if (locale === 'uz') {
    const json = opts.articleJson ?? JSON.stringify(article);
    if (/[А-Яа-яЁё]/.test(json)) {
      if (asStrings) {
        strings.push('UZ article contains Cyrillic characters — please review.');
      } else {
        issues.push({
          level: 'warn',
          rule: 'uz_cyrillic',
          message: 'Cyrillic characters detected in UZ article.',
        });
      }
    }
  }

  return asStrings ? strings : issues;
}
