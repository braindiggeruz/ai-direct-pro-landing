import type { Env } from '../../_types';
import { requireAdminSession } from '../../lib/jwt';
import { withPrivateResponseHeaders } from '../../lib/private-response';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdminSession(request, env);
  if (auth instanceof Response) return withPrivateResponseHeaders(auth);
  return withPrivateResponseHeaders(new Response(JSON.stringify({ email: auth.email, role: auth.role }), {
    headers: { 'Content-Type': 'application/json' },
  }));
};
