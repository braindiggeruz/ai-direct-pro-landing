// GET /api/admin/seo/yandex/status — admin JWT.
//
// Reports whether the Yandex Cloud Search API is configured and usable
// without ever returning the secret. The admin UI uses this to decide
// when to show the "Собрать темы из Яндекса" button.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { isYandexConfigured } from '../../../../lib/yandex/client';
import { lastCallAt, cacheRowCount } from '../../../../lib/yandex/cache';
import type { YandexStatusResponse } from '../../../../lib/yandex/types';
import { jsonResponse } from '../../../../lib/api-errors';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const configured = isYandexConfigured(env);
  const last = await lastCallAt(env).catch(() => null);
  const rows = await cacheRowCount(env).catch(() => 0);
  const out: YandexStatusResponse = {
    configured,
    web_search_available: configured,
    cache_present: rows > 0,
    last_call_at: last,
  };
  return jsonResponse(out);
};
