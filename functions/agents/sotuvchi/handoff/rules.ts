import type {
  DeterministicRule,
  RuntimeMessage,
  RuntimeStepResult,
} from '../../../platform/contracts';
import {
  HANDOFF_CLOSE_ACTION_PREFIX,
  HANDOFF_OPEN_ACTION_PREFIX,
  HANDOFF_QUEUE_ACTION,
  HANDOFF_REPLY_ACTION_PREFIX,
} from './responses';
import {
  HANDOFF_CLOSE_TOOL,
  HANDOFF_GET_TOOL,
  HANDOFF_LIST_TOOL,
  HANDOFF_REPLY_TOOL,
  HANDOFF_REQUEST_TOOL,
} from './tools';

const HANDOFF_REF = /^([a-z0-9][a-z0-9._-]{0,47})$/;

const SELLER_ACTIONS: readonly { prefix: string; tool: string }[] = [
  { prefix: HANDOFF_REPLY_ACTION_PREFIX, tool: HANDOFF_REPLY_TOOL },
  { prefix: HANDOFF_CLOSE_ACTION_PREFIX, tool: HANDOFF_CLOSE_TOOL },
  { prefix: HANDOFF_OPEN_ACTION_PREFIX, tool: HANDOFF_GET_TOOL },
];

/**
 * Explicit human request only. P2.3 keeps answering an unknown question with
 * safe help, because auto-escalating every unknown would both spam the seller
 * and store buyer text the buyer never meant to send to a person.
 */
const HUMAN_REQUEST =
  /^(?:позов[иь]те?\s+продавц|позвать\s+продавц|нужен\s+продавец|свяжите\s+с\s+продавц|вопрос\s+продавцу|оператор|человек|sotuvchi(?:ni|ga)?\s+chaqir|sotuvchiga\s+savol|operator|odam\s+bilan)/iu;

function textOf(message: RuntimeMessage): string | null {
  return message.kind === 'text' ? message.text.trim() : null;
}

function reject(): RuntimeStepResult {
  return { kind: 'reject', reasonCode: 'rejected' };
}

export const sotuvchiHandoffSellerActionRule: DeterministicRule = {
  id: 'seller-handoff-action',
  priority: 130,
  match(input) {
    return input.message.kind === 'action'
      && (
        input.message.actionId === HANDOFF_QUEUE_ACTION
        || SELLER_ACTIONS.some(
          (action) => input.message.kind === 'action'
            && input.message.actionId.startsWith(action.prefix),
        )
      );
  },
  async execute(_context, input) {
    if (input.message.kind !== 'action') return reject();
    const actionId = input.message.actionId;
    if (actionId === HANDOFF_QUEUE_ACTION) {
      return { kind: 'tool', toolName: HANDOFF_LIST_TOOL, input: {} };
    }
    for (const action of SELLER_ACTIONS) {
      if (!actionId.startsWith(action.prefix)) continue;
      const ref = HANDOFF_REF.exec(actionId.slice(action.prefix.length));
      if (!ref) return reject();
      return {
        kind: 'tool',
        toolName: action.tool,
        input: { handoffId: ref[1] },
      };
    }
    return reject();
  },
};

export const sotuvchiHandoffQueueCommandRule: DeterministicRule = {
  id: 'seller-handoff-queue-command',
  priority: 131,
  match(input) {
    const text = textOf(input.message)?.toLowerCase();
    return text === 'вопросы' || text === 'savollar';
  },
  async execute() {
    return { kind: 'tool', toolName: HANDOFF_LIST_TOOL, input: {} };
  },
};

/**
 * The buyer's own words become the question, so the seller sees exactly what
 * was asked and nothing is reconstructed from a stored transcript.
 */
export const sotuvchiHandoffRequestRule: DeterministicRule = {
  id: 'buyer-handoff-request',
  priority: 132,
  match(input) {
    const text = textOf(input.message);
    return text !== null && HUMAN_REQUEST.test(text);
  },
  async execute(_context, input) {
    const text = textOf(input.message);
    if (text === null) return reject();
    return {
      kind: 'tool',
      toolName: HANDOFF_REQUEST_TOOL,
      input: {
        reason: 'buyer_requested_human',
        question: text.slice(0, 1_000),
      },
    };
  },
};

export const sotuvchiHandoffRules = [
  sotuvchiHandoffSellerActionRule,
  sotuvchiHandoffQueueCommandRule,
  sotuvchiHandoffRequestRule,
] as const;
