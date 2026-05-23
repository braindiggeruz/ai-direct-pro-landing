import type { Env } from '../_types';
import { requireAuth } from '../lib/jwt';
import { getFile, listDir } from '../lib/github';
// Run the same audit rules used everywhere else.
// We import compiled-from-src module path; Cloudflare bundles automatically.
import { buildCockpit } from '../../src/shared/audit';
import type { Page, GlobalSEO } from '../../src/shared/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const pageFiles = await listDir(env, 'content/pages').catch(() => []);
  const pages: Page[] = [];
  for (const p of pageFiles.filter((f) => f.endsWith('.json'))) {
    const f = await getFile(env, p);
    if (f) pages.push(JSON.parse(f.content));
  }
  const globalFile = await getFile(env, 'content/global/site.json').catch(() => null);
  const global: GlobalSEO | undefined = globalFile ? JSON.parse(globalFile.content) : undefined;
  const cockpit = buildCockpit(pages, global);
  return new Response(JSON.stringify(cockpit), { headers: { 'Content-Type': 'application/json' } });
};
