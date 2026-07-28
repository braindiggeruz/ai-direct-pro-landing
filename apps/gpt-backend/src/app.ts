// Fastify application factory for the GPTBot AI Chat production backend.
//
// Split out of server.ts so the fully-wired app (hooks, error handler, every
// route) can be built and exercised in-process — via app.inject() — without
// binding a port. server.ts remains the only module that listens.
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { loggerOptions } from './logger.js';
import type { AppContext } from './context.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/session.js';
import { chatRoutes } from './routes/chat.js';
import { historyRoutes } from './routes/history.js';
import { leadRoutes } from './routes/lead.js';
import { subscribeRoutes } from './routes/subscribe.js';
import { adminRoutes } from './routes/admin.js';

export const BODY_LIMIT_BYTES = 256 * 1024;

/**
 * JSON.parse reviver that fails closed on prototype-poisoning keys.
 *
 * Fastify's built-in JSON parser runs bodies through secure-json-parse, whose
 * protoAction/constructorAction both default to 'error'. The custom parser
 * below replaces that built-in, so the same protection is reproduced here
 * rather than silently dropped.
 */
function rejectPollutingKeys(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor') {
    throw new SyntaxError('forbidden prototype property in body');
  }
  return value;
}

export interface BuildAppOptions {
  /** Logger configuration override. Production passes nothing and gets loggerOptions. */
  logger?: FastifyServerOptions['logger'];
}

export function buildApp(ctx: AppContext, opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? loggerOptions,
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: true,
  });

  // Fastify 5 rejects a request that declares Content-Type: application/json
  // but carries an empty body (FST_ERR_CTP_EMPTY_JSON_BODY). The Cloudflare
  // gateway sets that header on every forwarded call, including bodyless
  // methods, so the v4 behaviour is kept explicitly: an empty body parses to
  // undefined and the route's own auth/validation decides the outcome.
  // Malformed JSON still fails closed with a controlled 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim().length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text, rejectPollutingKeys));
    } catch {
      const err = new Error('invalid json body') as Error & { statusCode?: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

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
  // Fastify 5 types the handler error as `unknown` unless the generic is
  // pinned, so FastifyError is annotated explicitly here.
  app.setErrorHandler((err: FastifyError, req, reply) => {
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

  return app;
}
