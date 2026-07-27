import type { WorkflowDefinition } from '../../../platform/contracts';
import type {
  SotuvchiOnboardingDraft,
  SotuvchiOnboardingState,
} from '../types';
import {
  normalizeDeliveryMode,
  normalizeStoreLocale,
  normalizeStoreName,
  triggerPayments,
  triggerString,
  validateOnboardingDraft,
} from './validation';

const cancel = {
  trigger: { on: 'action' as const, actionId: 'cancel' },
  to: 'cancelled' as const,
};

export const sotuvchiOnboardingWorkflow: WorkflowDefinition<
  SotuvchiOnboardingDraft,
  SotuvchiOnboardingState
> = {
  id: 'sotuvchi-store-onboarding',
  version: 1,
  initial: 'start',
  terminalStates: ['completed', 'cancelled'],
  payload: {
    validate: validateOnboardingDraft,
  },
  states: {
    start: {
      transitions: [{
        trigger: { on: 'action', actionId: 'begin' },
        to: 'awaiting_name',
      }, cancel],
    },
    awaiting_name: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-name' },
        to: 'awaiting_locale',
        reducePayload(_context, payload, trigger) {
          return {
            ...payload,
            storeName: triggerString(trigger.data, normalizeStoreName),
          };
        },
      }, cancel],
    },
    awaiting_locale: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-locale' },
        to: 'awaiting_delivery',
        reducePayload(_context, payload, trigger) {
          return {
            ...payload,
            locale: triggerString(trigger.data, normalizeStoreLocale),
          };
        },
      }, cancel],
    },
    awaiting_delivery: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-delivery' },
        to: 'awaiting_payment',
        reducePayload(_context, payload, trigger) {
          return {
            ...payload,
            deliveryMode: triggerString(
              trigger.data,
              normalizeDeliveryMode,
            ),
          };
        },
      }, cancel],
    },
    awaiting_payment: {
      transitions: [{
        trigger: { on: 'action', actionId: 'submit-payment' },
        to: 'review',
        reducePayload(_context, payload, trigger) {
          return {
            ...payload,
            paymentMethods: triggerPayments(trigger.data),
          };
        },
      }, cancel],
    },
    review: {
      transitions: [{
        trigger: { on: 'action', actionId: 'confirm' },
        to: 'completed',
      }, cancel],
    },
    completed: { transitions: [] },
    cancelled: { transitions: [] },
  },
};
