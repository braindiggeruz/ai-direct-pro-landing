import type {
  FactSheet,
  Locale,
  OrgContext,
  RuntimeMessage,
  RuntimeStepResult,
  WorkflowServicePort,
} from '../../../platform/contracts';
import {
  CheckoutAuthorizationError,
  CheckoutNotFoundError,
  CheckoutStateError,
  CheckoutValidationError,
} from './errors';
import { projectCheckoutFacts } from './facts';
import {
  CHECKOUT_CANCEL_ACTION,
  CHECKOUT_CONFIRM_ACTION,
  CHECKOUT_RESUME_ACTION,
  CHECKOUT_SKIP_COMMENT_ACTION,
  composeCheckoutResponse,
} from './responses';
import type { SotuvchiCheckoutService } from './service';
import type { SotuvchiCheckoutSnapshot } from './types';
import { parseCheckoutQuantityText } from './validation';

export const CHECKOUT_FACT_TOOL = 'sotuvchi.checkout';

const RESUME_ACTIONS = new Set([
  CHECKOUT_RESUME_ACTION,
  'storefront-start',
  'start',
]);

export function checkoutFactSheet(
  snapshot: SotuvchiCheckoutSnapshot,
  locale: Locale,
  rejected = false,
): FactSheet {
  return {
    toolName: CHECKOUT_FACT_TOOL,
    values: projectCheckoutFacts(snapshot, locale, { rejected }),
  };
}

export function checkoutAnswer(
  snapshot: SotuvchiCheckoutSnapshot,
  locale: Locale,
  rejected = false,
): RuntimeStepResult {
  const facts = checkoutFactSheet(snapshot, locale, rejected);
  return {
    kind: 'answer',
    response: composeCheckoutResponse(facts, locale),
    facts: [facts],
  };
}

function textOf(message: RuntimeMessage): string | null {
  return message.kind === 'text' ? message.text : null;
}

function isAction(message: RuntimeMessage, actionId: string): boolean {
  return message.kind === 'action' && message.actionId === actionId;
}

/**
 * Persistent checkout turns. The buyer never supplies the org, store, order or
 * workflow reference: the instance arrives from the trusted channel context and
 * must match the buyer's own active draft order.
 */
export function createSotuvchiCheckoutWorkflowPort(
  service: SotuvchiCheckoutService,
): WorkflowServicePort {
  async function current(
    org: OrgContext,
  ): Promise<SotuvchiCheckoutSnapshot | null> {
    try {
      return await service.getActiveCheckout(org);
    } catch (error) {
      if (
        error instanceof CheckoutAuthorizationError
        || error instanceof CheckoutNotFoundError
      ) {
        return null;
      }
      throw error;
    }
  }

  return {
    async handleActive(org, active, message) {
      const snapshot = await current(org);
      if (
        !snapshot
        || snapshot.order.orgId !== org.orgId
        || snapshot.workflowInstanceId !== active.instanceId
      ) {
        return null;
      }
      const locale = org.locale;

      if (
        isAction(message, CHECKOUT_CANCEL_ACTION)
        || isAction(message, 'cancel')
      ) {
        const cancelled = await service.cancelCheckout(org);
        return checkoutAnswer(cancelled ?? snapshot, locale);
      }
      if (message.kind === 'action' && RESUME_ACTIONS.has(message.actionId)) {
        return checkoutAnswer(snapshot, locale);
      }

      if (snapshot.state === 'awaiting_confirmation') {
        if (!isAction(message, CHECKOUT_CONFIRM_ACTION)) {
          return checkoutAnswer(snapshot, locale, true);
        }
        try {
          return checkoutAnswer(await service.confirmCheckout(org), locale);
        } catch (error) {
          if (
            error instanceof CheckoutStateError
            || error instanceof CheckoutNotFoundError
          ) {
            return checkoutAnswer(snapshot, locale, true);
          }
          throw error;
        }
      }

      if (
        snapshot.state === 'awaiting_comment'
        && isAction(message, CHECKOUT_SKIP_COMMENT_ACTION)
      ) {
        return checkoutAnswer(await service.skipComment(org), locale);
      }

      const text = textOf(message);
      if (text === null) return checkoutAnswer(snapshot, locale, true);

      try {
        if (snapshot.state === 'awaiting_quantity' || snapshot.state === 'idle') {
          const quantity = parseCheckoutQuantityText(text);
          if (quantity === null) {
            return checkoutAnswer(snapshot, locale, true);
          }
          return checkoutAnswer(
            await service.submitQuantity(org, quantity),
            locale,
          );
        }
        if (snapshot.state === 'awaiting_name') {
          return checkoutAnswer(await service.submitName(org, text), locale);
        }
        if (snapshot.state === 'awaiting_phone') {
          return checkoutAnswer(await service.submitPhone(org, text), locale);
        }
        if (snapshot.state === 'awaiting_address') {
          return checkoutAnswer(await service.submitAddress(org, text), locale);
        }
        if (snapshot.state === 'awaiting_comment') {
          return checkoutAnswer(await service.submitComment(org, text), locale);
        }
      } catch (error) {
        if (
          error instanceof CheckoutValidationError
          || error instanceof CheckoutStateError
        ) {
          return checkoutAnswer(snapshot, locale, true);
        }
        throw error;
      }
      return checkoutAnswer(snapshot, locale);
    },
  };
}

/** First port that owns the active instance answers; others are skipped. */
export function composeSotuvchiWorkflowPorts(
  ports: readonly WorkflowServicePort[],
): WorkflowServicePort {
  return {
    async handleActive(org, active, message) {
      for (const port of ports) {
        const result = await port.handleActive(org, active, message);
        if (result) return result;
      }
      return null;
    },
  };
}
