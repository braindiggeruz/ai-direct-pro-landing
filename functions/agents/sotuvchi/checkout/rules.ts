import type { DeterministicRule } from '../../../platform/contracts';
import { CHECKOUT_START_ACTION_PREFIX } from './responses';
import { CHECKOUT_START_OPERATION } from './tools';

const START_ACTION = /^buyer-checkout\.([a-z0-9][a-z0-9._-]{0,47})$/;

/**
 * Checkout starts only from a trusted product card action. Free-form buyer
 * text never opens a checkout, so P2.3 catalog answers keep their behaviour.
 */
export const sotuvchiCheckoutStartRule: DeterministicRule = {
  id: 'buyer-checkout-start',
  priority: 105,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId.startsWith(CHECKOUT_START_ACTION_PREFIX)
      && START_ACTION.test(input.message.actionId);
  },
  async execute(_context, input) {
    if (input.message.kind !== 'action') {
      return { kind: 'reject', reasonCode: 'rejected' };
    }
    const match = START_ACTION.exec(input.message.actionId);
    if (!match) return { kind: 'reject', reasonCode: 'rejected' };
    return {
      kind: 'tool',
      toolName: CHECKOUT_START_OPERATION,
      input: { productRef: match[1] },
    };
  },
};

export const sotuvchiCheckoutRules = [sotuvchiCheckoutStartRule] as const;
