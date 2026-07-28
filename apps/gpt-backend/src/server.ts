// Fastify bootstrap for the GPTBot AI Chat production backend (Railway).
// App wiring lives in app.ts; this module only builds the context and listens.
import { logger } from './logger.js';
import { buildApp } from './app.js';
import { buildContext } from './context.js';
import { configStatus } from './env.js';

async function main() {
  const ctx = buildContext();
  const app = buildApp(ctx);

  const status = configStatus(ctx.cfg);
  logger.info({ env: ctx.cfg.nodeEnv, ...status }, 'starting gptbot-ai-chat-backend');

  await app.listen({ host: '0.0.0.0', port: ctx.cfg.port });
}

main().catch((e) => {
  logger.error({ err: (e as Error).message }, 'fatal_boot_error');
  process.exit(1);
});
