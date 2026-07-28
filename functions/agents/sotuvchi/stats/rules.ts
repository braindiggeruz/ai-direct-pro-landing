import type {
  DeterministicRule,
  RuntimeMessage,
} from '../../../platform/contracts';
import { SELLER_STATS_ACTION } from './responses';
import { SELLER_STATS_TOOL } from './tools';

/**
 * `/stats` is a seller command, not an authority. The rule only routes to the
 * tool; ownership is re-derived from the trusted org context inside the
 * service, so a buyer typing the same text gets a content-free refusal.
 */
const STATS_COMMAND = /^\/?(?:stats|статистика|statistika)$/iu;

function textOf(message: RuntimeMessage): string | null {
  return message.kind === 'text' ? message.text.trim() : null;
}

export const sotuvchiStatsActionRule: DeterministicRule = {
  id: 'seller-stats-action',
  priority: 140,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === SELLER_STATS_ACTION;
  },
  async execute() {
    return { kind: 'tool', toolName: SELLER_STATS_TOOL, input: {} };
  },
};

export const sotuvchiStatsCommandRule: DeterministicRule = {
  id: 'seller-stats-command',
  priority: 141,
  match(input) {
    const text = textOf(input.message);
    return text !== null && STATS_COMMAND.test(text);
  },
  async execute() {
    return { kind: 'tool', toolName: SELLER_STATS_TOOL, input: {} };
  },
};

export const sotuvchiStatsRules = [
  sotuvchiStatsActionRule,
  sotuvchiStatsCommandRule,
] as const;
