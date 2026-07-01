// GET /api/seo/booster
// Returns the full SEO Booster Engine read-only report for the admin UI.
// Single subrequest to GitHub (readContentBulk), then pure in-memory analysis.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { jsonResponse } from '../../lib/api-errors';
import { readContentBulk } from '../../lib/github';
import { parseContentBulk } from '../../lib/content-parse';
import { buildBoosterReport } from '../../../src/shared/booster';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const all = await readContentBulk(env);
  const { pages, blog, global: globalObj } = parseContentBulk(all);
  const report = buildBoosterReport(pages, blog, globalObj);
  return jsonResponse(report);
};
