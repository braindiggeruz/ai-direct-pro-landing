import type {
  FactSheet,
  Locale,
  Outbound,
  RuntimeExactClaim,
  RuntimeResponseDraft,
  ToolDefinition,
} from '../contracts';
import { AgentGroundingError } from './errors';

const PLACEHOLDER = /\{\{([a-z][a-z0-9]*(?:[._-][a-z0-9]+)+)\}\}/g;
const SAFE_REF = /^[a-z0-9][a-z0-9._-]*$/;

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13)
      || code === 127;
  });
}

function requireText(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string'
    || value.length > maxLength
    || (!allowEmpty && value.trim().length === 0)
    || hasUnsafeControl(value)
  ) {
    throw new AgentGroundingError('invalid_facts');
  }
  return value;
}

function validateOutbound(raw: Outbound): Outbound {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentGroundingError('invalid_facts');
  }
  const card = raw.card;
  requireText(raw.text, 4_096, card !== undefined);
  if (!card && raw.text.trim().length === 0) {
    throw new AgentGroundingError('invalid_facts');
  }
  if (raw.mediaRef !== undefined) requireText(raw.mediaRef, 512);
  if (raw.choices !== undefined) {
    if (!Array.isArray(raw.choices) || raw.choices.length > 12) {
      throw new AgentGroundingError('invalid_facts');
    }
    for (const choice of raw.choices) {
      if (
        !choice
        || typeof choice !== 'object'
        || typeof choice.id !== 'string'
        || choice.id.length > 48
        || !SAFE_REF.test(choice.id)
      ) {
        throw new AgentGroundingError('invalid_facts');
      }
      requireText(choice.label, 64);
    }
  }
  if (card !== undefined) {
    if (
      !card
      || typeof card !== 'object'
      || typeof card.ref !== 'string'
      || card.ref.length > 48
      || !SAFE_REF.test(card.ref)
      || !Array.isArray(card.fields)
      || card.fields.length > 8
    ) {
      throw new AgentGroundingError('invalid_facts');
    }
    requireText(card.title, 160);
    if (card.description !== undefined) {
      requireText(card.description, 480);
    }
    for (const field of card.fields) {
      if (!field || typeof field !== 'object') {
        throw new AgentGroundingError('invalid_facts');
      }
      requireText(field.label, 64);
      requireText(field.value, 240);
    }
    if (card.actions !== undefined) {
      if (!Array.isArray(card.actions) || card.actions.length > 4) {
        throw new AgentGroundingError('invalid_facts');
      }
      for (const action of card.actions) {
        if (
          !action
          || typeof action !== 'object'
          || typeof action.id !== 'string'
          || action.id.length > 48
          || !SAFE_REF.test(action.id)
        ) {
          throw new AgentGroundingError('invalid_facts');
        }
        requireText(action.label, 64);
      }
    }
  }
  return raw;
}

function validateDraft(raw: RuntimeResponseDraft): RuntimeResponseDraft {
  if (
    !raw
    || typeof raw !== 'object'
    || Array.isArray(raw)
    || !Array.isArray(raw.messages)
    || raw.messages.length < 1
    || raw.messages.length > 5
    || (raw.claims !== undefined && !Array.isArray(raw.claims))
    || (raw.claims?.length ?? 0) > 64
  ) {
    throw new AgentGroundingError('invalid_facts');
  }
  raw.messages.forEach(validateOutbound);
  return raw;
}

export function composeToolResponse(
  tool: ToolDefinition,
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  if (typeof tool.response.compose === 'function') {
    try {
      return validateDraft(tool.response.compose(facts, locale));
    } catch (error) {
      if (error instanceof AgentGroundingError) throw error;
      throw new AgentGroundingError('invalid_facts');
    }
  }
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
