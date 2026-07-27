import type {
  FactSheet,
  Locale,
  RuntimeExactClaim,
  RuntimeResponseDraft,
  ToolDefinition,
} from '../contracts';
import { AgentGroundingError } from './errors';

const PLACEHOLDER = /\{\{([a-z][a-z0-9]*(?:[._-][a-z0-9]+)+)\}\}/g;

export function composeToolResponse(
  tool: ToolDefinition,
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const template = tool.response.text[locale];
  if (typeof template !== 'string' || template.length === 0) {
    throw new AgentGroundingError('missing_template_fact');
  }
  const claims: RuntimeExactClaim[] = [];
  const text = template.replace(PLACEHOLDER, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(facts.values, key)) {
      throw new AgentGroundingError('missing_template_fact');
    }
    const value = facts.values[key];
    claims.push({ key, value });
    return String(value);
  });
  PLACEHOLDER.lastIndex = 0;
  if (text.includes('{{') || text.includes('}}') || text.length > 4_096) {
    throw new AgentGroundingError('missing_template_fact');
  }
  return {
    messages: [{ text }],
    claims,
  };
}
