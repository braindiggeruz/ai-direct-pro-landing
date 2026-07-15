import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { resolveUser } from '../context.js';
import { assertOrigin } from '../auth.js';
import { detectIntent } from '../prompt.js';

const Body = z.object({
  sessionId: z.string().max(80).optional(),
  name: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  telegram: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  contactType: z.string().max(40).optional(),
  contactValue: z.string().max(200).optional(),
  needType: z.string().max(60).optional(),
  lastUserMessage: z.string().max(4000).optional(),
  locale: z.enum(['ru', 'uz']).default('ru'),
  pageUrl: z.string().max(500).optional(),
  utm: z.record(z.string(), z.unknown()).optional(),
  consent: z.literal(true),
});

export function leadRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/v1/gpt/lead', async (req, reply) => {
    if (!assertOrigin(req, ctx.cfg)) return reply.code(403).send({ ok: false, code: 'origin' });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'invalid_lead', message: 'consent + контакт обязательны' });
    const d = parsed.data;

    // Require at least one contact.
    const contactValue = d.contactValue || d.phone || d.telegram || d.email;
    if (!contactValue) return reply.code(400).send({ ok: false, code: 'no_contact' });
    const contactType = d.contactType || (d.phone ? 'phone' : d.telegram ? 'telegram' : d.email ? 'email' : 'unknown');

    const user = await resolveUser(ctx, req);
    const intent = d.needType ? d.needType : detectIntent(d.lastUserMessage);

    const id = await ctx.store.saveLead({
      session_id: d.sessionId ?? null,
      user_id: user?.id ?? null,
      name: d.name ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      telegram: d.telegram ?? null,
      contact_type: contactType,
      contact_value: contactValue,
      need_type: d.needType ?? null,
      detected_intent: intent,
      last_user_message: d.lastUserMessage ?? null,
      locale: d.locale,
      page_url: d.pageUrl ?? null,
      utm_json: d.utm ?? {},
      status: 'new',
    });
    await ctx.store.event('GPTChatLeadSubmitted', d.sessionId ?? null, user?.id ?? null, { intent });
    return reply.send({ ok: !!id || !ctx.store.enabled, id, intent });
  });
}
