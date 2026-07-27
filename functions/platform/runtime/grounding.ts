import type {
  Facts,
  FactValue,
  GroundingResult,
  RuntimeResponseDraft,
} from '../contracts';
import { AgentGroundingError } from './errors';
import { validateFactSheet } from './tools';

const CLAIM_KEY =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const NUMBER = /-?\d+(?:[.,]\d+)?/g;

function sameFact(left: FactValue, right: FactValue): boolean {
  return Object.is(left, right);
}

function numberTokens(value: FactValue): string[] {
  if (typeof value === 'number') return [String(value)];
  if (typeof value !== 'string') return [];
  return (value.match(NUMBER) ?? []).map((token) => token.replace(',', '.'));
}

export function groundResponse(
  response: RuntimeResponseDraft,
  facts: Facts,
): GroundingResult {
  try {
    const values = new Map<string, FactValue>();
    const supportedNumbers = new Set<string>();
    for (const sheet of facts) {
      const validated = validateFactSheet(sheet, sheet.toolName);
      for (const [key, value] of Object.entries(validated.values)) {
        const existing = values.get(key);
        if (existing !== undefined && !sameFact(existing, value)) {
          throw new AgentGroundingError('invalid_facts');
        }
        values.set(key, value);
        for (const token of numberTokens(value)) supportedNumbers.add(token);
      }
    }
    for (const claim of response.claims ?? []) {
      if (
        !claim
        || typeof claim !== 'object'
        || !CLAIM_KEY.test(claim.key)
        || !values.has(claim.key)
        || !sameFact(values.get(claim.key)!, claim.value)
      ) {
        throw new AgentGroundingError('unsupported_claim');
      }
    }
    for (const message of response.messages) {
      const text = [
        message.text,
        ...(message.choices ?? []).map((choice) => choice.label),
      ].join(' ');
      for (const token of text.match(NUMBER) ?? []) {
        if (!supportedNumbers.has(token.replace(',', '.'))) {
          throw new AgentGroundingError('unsupported_number');
        }
      }
    }
    return { status: 'passed' };
  } catch (error) {
    if (error instanceof AgentGroundingError) {
      return {
        status: 'failed',
        reasonCode: error.reason === 'missing_template_fact'
          ? 'unsupported_claim'
          : error.reason,
      };
    }
    return { status: 'failed', reasonCode: 'invalid_facts' };
  }
}
