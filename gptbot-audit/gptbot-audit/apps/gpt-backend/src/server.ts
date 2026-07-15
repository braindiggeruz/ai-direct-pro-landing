// Fastify bootstrap for the GPTBot AI Chat production backend (Railway).
import Fastify from 'fastify';
import { logger, loggerOptions } from './logger.js';
import { buildContext } from './context.js';
import { configStatus } from './env.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/session.js';
import { chatRoutes } from './routes/chat.js';
import { historyRoutes } from './routes/history.js';
import { leadRoutes } from './routes/lead.js';
import { subscribeRoutes } from './routes/subscribe.js';
import { adminRoutes } from './routes/admin.js';

async function main() {
  const ctx = buildContext();
  const app = Fastify({ logger: loggerOptions, bodyLimit: 256 * 1024, trustProxy: true });

  // CORS — reflect only allow-listed origins. No wildcard with credentials.
  app.addHook('onRequest', async (req, reply) => {
    const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) as string | undefined;
    if (origin && ctx.cfg.allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Secret, X-Admin-Key');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // Error handler: never leak stack traces / secrets to the client.
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err: err.message }, 'request_error');
    reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500)
      .send({ ok: false, code: 'internal_error', message: 'Внутренняя ошибка. Попробуйте позже.' });
  });

  healthRoutes(app, ctx);
  sessionRoutes(app, ctx);
  chatRoutes(app, ctx);
  historyRoutes(app, ctx);
  leadRoutes(app, ctx);
  subscribeRoutes(app, ctx);
  adminRoutes(app, ctx);

  const status = configStatus(ctx.cfg);
  logger.info({ env: ctx.cfg.nodeEnv, ...status }, 'starting gptbot-ai-chat-backend');

  await app.listen({ host: '0.0.0.0', port: ctx.cfg.port });
}

main().catch((e) => {
  logger.error({ err: (e as Error).message }, 'fatal_boot_error');
  process.exit(1);
});
