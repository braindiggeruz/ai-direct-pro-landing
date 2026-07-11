import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { resolveUser } from '../context.js';

const Page = z.object({ limit: z.coerce.number().min(1).max(100).default(20), offset: z.coerce.number().min(0).default(0) });

export function historyRoutes(app: FastifyInstance, ctx: AppContext) {
  // List sessions for the authenticated user.
  app.get('/v1/gpt/history', async (req, reply) => {
    const user = await resolveUser(ctx, req);
    if (!user) return reply.code(401).send({ ok: false, code: 'auth_required' });
    const q = Page.parse(req.query ?? {});
    const sessions = await ctx.store.listUserSessions(user.id, q.limit, q.offset);
    return { ok: true, sessions, limit: q.limit, offset: q.offset };
  });

  // Messages of a session — ownership enforced.
  app.get('/v1/gpt/session/:id/messages', async (req, reply) => {
    const user = await resolveUser(ctx, req);
    if (!user) return reply.code(401).send({ ok: false, code: 'auth_required' });
    const id = (req.params as { id: string }).id;
    const owner = await ctx.store.getSessionOwner(id);
    if (!owner || owner.user_id !== user.id) return reply.code(403).send({ ok: false, code: 'forbidden' });
    const q = Page.parse(req.query ?? {});
    const messages = await ctx.store.pageMessages(id, q.limit, q.offset);
    return { ok: true, messages, limit: q.limit, offset: q.offset };
  });

  // Rename.
  app.patch('/v1/gpt/session/:id', async (req, reply) => {
    const user = await resolveUser(ctx, req);
    if (!user) return reply.code(401).send({ ok: false, code: 'auth_required' });
    const id = (req.params as { id: string }).id;
    const body = z.object({ title: z.string().min(1).max(120) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ ok: false, code: 'bad_request' });
    const ok = await ctx.store.renameSession(id, user.id, body.data.title);
    if (!ok) return reply.code(403).send({ ok: false, code: 'forbidden' });
    return { ok: true };
  });

  // Soft delete.
  app.delete('/v1/gpt/session/:id', async (req, reply) => {
    const user = await resolveUser(ctx, req);
    if (!user) return reply.code(401).send({ ok: false, code: 'auth_required' });
    const id = (req.params as { id: string }).id;
    const ok = await ctx.store.softDeleteSession(id, user.id);
    if (!ok) return reply.code(403).send({ ok: false, code: 'forbidden' });
    return { ok: true };
  });

  // Thumbs up/down on a message.
  app.post('/v1/gpt/feedback', async (req, reply) => {
    const user = await resolveUser(ctx, req);
    const body = z.object({ messageId: z.string(), rating: z.enum(['up', 'down']), comment: z.string().max(1000).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ ok: false, code: 'bad_request' });
    const ok = await ctx.store.saveFeedback({ message_id: body.data.messageId, user_id: user?.id ?? null, rating: body.data.rating, comment: body.data.comment ?? null });
    return reply.send({ ok });
  });
}
