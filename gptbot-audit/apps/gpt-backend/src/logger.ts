// pino logger options with redaction of secret-ish fields. Passed to Fastify
// as OPTIONS (not an instance) so Fastify keeps its default FastifyBaseLogger
// typing across route registrars. A standalone `logger` is exported for use
// before the Fastify app exists (fatal boot errors).
import pino, { type LoggerOptions } from 'pino';

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-internal-secret"]',
      '*.apiKey',
      '*.secretKey',
      '*.internalSecret',
      '*.SUPABASE_SECRET_KEY',
      '*.OPENROUTER_API_KEY',
    ],
    censor: '[redacted]',
  },
  base: { service: 'gptbot-ai-chat-backend' },
};

export const logger = pino(loggerOptions);
