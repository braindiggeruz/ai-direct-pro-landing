// i18n entry. Default + only locale is `ru`. Returns the dictionary
// + helpers. Hook-shaped so a future language switcher slots in
// without touching component code.

import { ru, pluralRu, tpl } from './ru';

export type Dict = typeof ru;

let activeLocale: 'ru' = 'ru' as const;

export function setLocale(): void { /* placeholder for future locales */ activeLocale = 'ru'; }
export function getLocale(): 'ru' { return activeLocale; }

export function useT(): { t: Dict; tpl: typeof tpl; pluralRu: typeof pluralRu; locale: 'ru' } {
  return { t: ru, tpl, pluralRu, locale: activeLocale };
}

// Convenience non-hook export for non-component callers.
export { ru as t, tpl, pluralRu };

// Error-code → user-friendly title + body localised in Russian.
export function localiseError(code: string | undefined, fallback?: string): { title: string; description: string } {
  switch (code) {
    case 'GITHUB_AUTH_FAILED':
      return { title: ru.cockpit.error.section_audit, description: ru.cockpit.error.gh_auth_failed };
    case 'GITHUB_RATE_LIMITED':
      return { title: ru.cockpit.error.section_audit, description: ru.cockpit.error.gh_rate_limited };
    case 'GITHUB_UNAVAILABLE':
      return { title: ru.cockpit.error.section_audit, description: ru.cockpit.error.gh_unavailable };
    case 'D1_UNAVAILABLE':
      return { title: ru.cockpit.error.section_drafts, description: ru.cockpit.error.d1_unavailable };
    case 'D1_QUERY_FAILED':
      return { title: ru.cockpit.error.section_drafts, description: ru.cockpit.error.d1_query_failed };
    case 'INTEGRATION_TIMEOUT':
      return { title: ru.cockpit.error.fatal_title, description: ru.cockpit.error.integration_timeout };
    case 'INTEGRATION_UNAVAILABLE':
      return { title: ru.cockpit.error.fatal_title, description: ru.cockpit.error.integration_unavailable };
    case 'COCKPIT_PARTIAL_FAILURE':
      return { title: ru.cockpit.error.fatal_title, description: ru.cockpit.error.cockpit_partial };
    default:
      return {
        title: ru.cockpit.error.fatal_title,
        description: fallback || ru.cockpit.error.internal,
      };
  }
}
