import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { configStatus } from '../env.js';

export function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/health', async () => {
    const s = configStatus(ctx.cfg);
    return {
      ok: true,
      service: 'gptbot-ai-chat-backend',
      timestamp: new Date().toISOString(),
      env: ctx.cfg.nodeEnv,
      supabaseConfigured: s.supabaseConfigured,
      openrouterConfigured: s.openrouterConfigured,
      // presence-only diagnostics; NEVER secret values
      diagnostics: s,
    };
  });
}
