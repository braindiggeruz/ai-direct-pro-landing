import type { WorkflowDefinition } from '../../../platform/contracts';
import type { SellerReplyState, SellerReplyWorkflowPayload } from './types';
import { validateSellerReplyPayload } from './validation';

/**
 * Durable "the seller's next message is a reply" state. It lives in the
 * platform workflow tables so it survives an isolate restart, and its payload
 * holds only the handoff reference: no question, no reply, no contact data.
 */
export const sotuvchiSellerReplyWorkflow: WorkflowDefinition<
  SellerReplyWorkflowPayload,
  SellerReplyState
> = {
  id: 'sotuvchi-seller-reply',
  version: 1,
  initial: 'awaiting_reply',
  terminalStates: ['completed', 'cancelled'],
  payload: {
    validate: validateSellerReplyPayload,
  },
  states: {
    awaiting_reply: {
      transitions: [
        {
          trigger: { on: 'action', actionId: 'submit-reply' },
          to: 'completed',
        },
        {
          trigger: { on: 'action', actionId: 'cancel' },
          to: 'cancelled',
        },
      ],
    },
    completed: { transitions: [] },
    cancelled: { transitions: [] },
  },
};
