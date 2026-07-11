// pino logger with redaction of any secret-ish fields. Never log token values.
import pino from 'pino';

export const logger = pino({
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
});
