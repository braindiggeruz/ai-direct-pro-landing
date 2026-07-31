import type { Env } from '../../_types';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const WEBMASTERS_ENDPOINT = 'https://www.googleapis.com/webmasters/v3';
const DEFAULT_PROPERTY = 'sc-domain:gptbot.uz';
export const DEFAULT_SITEMAP_URL = 'https://gptbot.uz/sitemap.xml';

export interface GscSitemapResult {
  status: 'success' | 'not_configured' | 'failed';
  sitemapUrl: string;
  message: string;
}

export function isGscConfigured(env: Env): boolean {
  return Boolean(env.GSC_CLIENT_ID && env.GSC_CLIENT_SECRET && env.GSC_REFRESH_TOKEN);
}

export async function submitSitemapToGsc(
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<GscSitemapResult> {
  const sitemapUrl = env.GSC_SITEMAP_URL || DEFAULT_SITEMAP_URL;
  if (!isGscConfigured(env)) {
    return {
      status: 'not_configured',
      sitemapUrl,
      message: 'Google Search Console OAuth не настроен; очередь URL подготовлена для ручной проверки.',
    };
  }

  try {
    const tokenBody = new URLSearchParams({
      client_id: env.GSC_CLIENT_ID!,
      client_secret: env.GSC_CLIENT_SECRET!,
      refresh_token: env.GSC_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    });
    const tokenResponse = await fetcher(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    if (!tokenResponse.ok) {
      return {
        status: 'failed',
        sitemapUrl,
        message: `Google OAuth вернул HTTP ${tokenResponse.status}. Проверьте GSC credentials.`,
      };
    }
    const tokenJson = await tokenResponse.json() as { access_token?: unknown };
    if (typeof tokenJson.access_token !== 'string' || !tokenJson.access_token) {
      return {
        status: 'failed',
        sitemapUrl,
        message: 'Google OAuth не вернул access token.',
      };
    }

    const property = env.GSC_SITE_PROPERTY || DEFAULT_PROPERTY;
    const endpoint = `${WEBMASTERS_ENDPOINT}/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
    const submitResponse = await fetcher(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!submitResponse.ok) {
      return {
        status: 'failed',
        sitemapUrl,
        message: `Google Search Console Sitemap API вернул HTTP ${submitResponse.status}.`,
      };
    }
    return {
      status: 'success',
      sitemapUrl,
      message: 'Sitemap повторно отправлен в Google Search Console.',
    };
  } catch {
    return {
      status: 'failed',
      sitemapUrl,
      message: 'Не удалось связаться с Google Search Console.',
    };
  }
}
