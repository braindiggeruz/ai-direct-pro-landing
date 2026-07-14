// src/shared/robots-policy.ts
//
// Single source of truth for robots.txt body. Imported by BOTH:
//   - scripts/generate-robots.ts  (writes dist/robots.txt at build time)
//   - functions/robots.txt.ts     (serves /robots.txt at the edge, bypassing
//                                  Cloudflare's Free-plan managed AI-block)
//
// Policy (2026-06-25): MAXIMUM AI VISIBILITY. The owner explicitly opened all
// AI grounding/training crawlers so GPTBot.uz can be ingested, cited and
// surfaced across every AI assistant and answer engine. /admin-tools/ and
// /api/ stay disallowed for every bot.
import { SITE_URL } from './site-config';

// AI answer/search engines (real-time, user-triggered retrieval).
export const AI_SEARCH_USER_AGENTS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-Web',
  'Claude-SearchBot',
  'Claude-User',
  'MistralAI-User',
  'Cohere-AI',
  'YouBot',
  'PhindBot',
  'DuckAssistBot',
  'Applebot',
] as const;

// AI grounding/training crawlers — OPENED by owner 2026-06-25 for max reach.
export const AI_TRAINING_USER_AGENTS = [
  'GPTBot',            // OpenAI (ChatGPT)
  'ClaudeBot',         // Anthropic (Claude)
  'Google-Extended',   // Google (Gemini / AI Overviews)
  'Applebot-Extended', // Apple Intelligence
  'meta-externalagent',// Meta AI (Llama)
  'Bytespider',        // ByteDance / Doubao
  'CCBot',             // Common Crawl (feeds many open LLMs)
  'Amazonbot',         // Amazon / Alexa+
  'Diffbot',           // Knowledge graph / LLM grounding
  'Timpibot',          // Timpi decentralized index
  'Omgilibot',         // Webhose / LLM dataset
] as const;

export const ALL_AI_USER_AGENTS = [
  ...AI_SEARCH_USER_AGENTS,
  ...AI_TRAINING_USER_AGENTS,
];

function agentBlock(agents: readonly string[]): string {
  return agents
    .map((ua) => `User-agent: ${ua}\nAllow: /\nDisallow: /admin-tools/\nDisallow: /api/`)
    .join('\n\n');
}

export function buildRobotsTxt(siteUrl: string = SITE_URL): string {
  return `# robots.txt — GPTBot.uz
# Generated from src/shared/robots-policy.ts. Do not edit directly.
#
# Policy (2026-06-25): MAXIMUM AI VISIBILITY — owner explicitly OPENED all AI
#   grounding/training + answer crawlers (GPTBot, ClaudeBot, Google-Extended,
#   Applebot-Extended, meta-externalagent, Bytespider, CCBot, Amazonbot, etc.)
#   so GPTBot.uz is ingested, cited and surfaced across every AI assistant and
#   answer engine. Traditional search engines are allowed via the wildcard.
#   Only /admin-tools/ and /api/ are off-limits for all bots.
#
# Served via functions/robots.txt.ts to bypass the Cloudflare Free-plan
# managed robots.txt AI-block (which cannot be disabled via API on Free).

# ── AI answer / search engines ──
${agentBlock(AI_SEARCH_USER_AGENTS)}

# ── AI grounding / training engines (opened for max AI reach) ──
${agentBlock(AI_TRAINING_USER_AGENTS)}

# ── Traditional search + remaining crawlers ──
User-agent: *
Allow: /
Disallow: /admin-tools/
Disallow: /api/

# Sitemap (canonical, indexable URLs only).
Sitemap: ${siteUrl}/sitemap.xml

# AI / LLM grounding manifest (https://llmstxt.org).
# X-LLM-Grounding: ${siteUrl}/llms.txt
`;
}
