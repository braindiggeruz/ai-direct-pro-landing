import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  return new Response(JSON.stringify({ email: auth.email, role: auth.role }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
