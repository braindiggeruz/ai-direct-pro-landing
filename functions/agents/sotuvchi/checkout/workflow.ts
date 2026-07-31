import type { WorkflowDefinition } from '../../../platform/contracts';
import type { CheckoutState, CheckoutWorkflowPayload } from './types';
import { validateCheckoutPayload } from './validation';

const cancel = {
  trigger: { on: 'action' as const, actionId: 'cancel' },
  to: 'cancelled' as const,
};

/**
 * Persistent single-product checkout FSM. The payload holds only the order
 * reference: quantity and buyer contact data live in sotuvchi_orders, so the
 * shared platform workflow tables never store PII.
 */
export const sotuvchiCheckoutWorkflow: WorkflowDefinition<
  CheckoutWorkflowPayload,
  CheckoutState
> = {
  id: 'sotuvchi-checkout',
  version: 1,
  initial: 'idle',
  terminalStates: ['completed', 'cancelled'],
  payload: {
    validate: validateCheckoutPayload,
  },
  states: {
    idle: {
      transitions: [{
        trigger: { on: 'action', actionId: 'begin' },
        to: 'awaiting_quantity',
      }, cancel],
    },
    awaiting_quantity: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-quantity' },
        to: 'awaiting_name',
      }, cancel],
    },
    awaiting_name: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-name' },
        to: 'awaiting_phone',
      }, cancel],
    },
    awaiting_phone: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-phone' },
        to: 'awaiting_address',
      }, cancel],
    },
    awaiting_address: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-address' },
        to: 'awaiting_comment',
      }, cancel],
    },
    awaiting_comment: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-comment' },
        to: 'awaiting_confirmation',
      }, {
        trigger: { on: 'action', actionId: 'skip-comment' },
        to: 'awaiting_confirmation',
      }, cancel],
    },
    awaiting_confirmation: {
      transitions: [{
        trigger: { on: 'action', actionId: 'confirm' },
        to: 'completed',
      }, cancel],
    },
    completed: { transitions: [] },
    cancelled: { transitions: [] },
  },
};
