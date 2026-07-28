import type {
  FactSheet,
  Locale,
  RuntimeStepResult,
  WorkflowServicePort,
} from '../../../platform/contracts';
import {
  HandoffExpiredError,
  HandoffReplyConflictError,
  HandoffStateError,
  HandoffValidationError,
} from './errors';
import {
  projectSellerDetailFacts,
  type HandoffFactValues,
} from './facts';
import { composeHandoffResponse } from './responses';
import type { SotuvchiHandoffService } from './service';

export const HANDOFF_FACT_TOOL = 'sotuvchi.handoff';

function answer(values: HandoffFactValues, locale: Locale): RuntimeStepResult {
  const facts: FactSheet = { toolName: HANDOFF_FACT_TOOL, values };
  return {
    kind: 'answer',
    response: composeHandoffResponse(facts, locale),
    facts: [facts],
  };
}

/**
 * Seller reply capture. The seller's next plain message becomes the single
 * answer for the bound handoff; the binding lives in the platform workflow
 * tables, so it survives an isolate restart and can never be supplied by the
 * seller's own input.
 */
export function createSotuvchiHandoffWorkflowPort(
  service: SotuvchiHandoffService,
): WorkflowServicePort {
  return {
    async handleActive(org, active, message) {
      if (!org.actorId) return null;
      const reference = await service
        .getActiveReplyWorkflowRef(org.orgId, org.actorId)
        .catch(() => null);
      if (!reference || reference.instanceId !== active.instanceId) return null;

      // Buttons keep working while a reply is pending: only free text is
      // captured as the answer, so the seller is never trapped in the prompt.
      if (message.kind === 'action') return null;

      try {
        const snapshot = await service.submitReply(org, message.text);
        return answer(
          projectSellerDetailFacts(
            snapshot.handoff,
            org.locale,
            'seller_answered',
          ),
          org.locale,
        );
      } catch (error) {
        if (
          error instanceof HandoffValidationError
          || error instanceof HandoffStateError
          || error instanceof HandoffReplyConflictError
          || error instanceof HandoffExpiredError
        ) {
          return null;
        }
        throw error;
      }
    },
  };
}
