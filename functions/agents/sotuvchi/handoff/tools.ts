import {
  eraseTool,
  type AgentDomainServicePort,
  type RuntimeSchema,
  type Tool,
} from '../../../platform/contracts';
import { HandoffAuthorizationError, HandoffValidationError } from './errors';
import {
  projectBuyerHandoffFacts,
  projectSellerDetailFacts,
  projectSellerQueueFacts,
  type HandoffFactValues,
} from './facts';
import { composeHandoffResponse } from './responses';
import type { SotuvchiHandoffService } from './service';
import {
  normalizeHandoffQuestion,
  requireHandoffId,
  requireHandoffReason,
} from './validation';
import type { HandoffReason } from './types';

export const HANDOFF_REQUEST_TOOL = 'handoff.request';
export const HANDOFF_LIST_TOOL = 'seller.handoffs.list';
export const HANDOFF_GET_TOOL = 'seller.handoff.get';
export const HANDOFF_REPLY_TOOL = 'seller.handoff.reply';
export const HANDOFF_CLOSE_TOOL = 'seller.handoff.close';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

const emptySchema: RuntimeSchema<Record<string, never>> = {
  parse(value) {
    if (!isPlainObject(value) || Object.keys(value).length !== 0) {
      throw new HandoffValidationError('invalid_input');
    }
    return {};
  },
};

const requestSchema: RuntimeSchema<{
  reason: HandoffReason;
  question: string;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['reason', 'question']))
    ) {
      throw new HandoffValidationError('invalid_input');
    }
    return {
      reason: requireHandoffReason(value.reason),
      question: normalizeHandoffQuestion(value.question),
    };
  },
};

const handoffRefSchema: RuntimeSchema<{ handoffId: string }> = {
  parse(value) {
    if (!isPlainObject(value) || !exactKeys(value, new Set(['handoffId']))) {
      throw new HandoffValidationError('invalid_id');
    }
    return { handoffId: requireHandoffId(value.handoffId) };
  },
};

function handoffTool<I>(
  name: string,
  description: string,
  inputSchema: RuntimeSchema<I>,
): Tool<I, HandoffFactValues> {
  return {
    name,
    description,
    inputSchema,
    async run(context, input) {
      const domain = context.services.agentDomain;
      if (!domain) throw new HandoffAuthorizationError();
      return domain.execute({
        agentId: 'sotuvchi',
        operation: name,
        org: context.org,
        input,
      });
    },
    facts(values) {
      return { toolName: name, values };
    },
    response: { compose: composeHandoffResponse },
  };
}

export const sotuvchiHandoffTools = [
  eraseTool(handoffTool(
    HANDOFF_REQUEST_TOOL,
    'Escalate one buyer question to the store owner.',
    requestSchema,
  )),
  eraseTool(handoffTool(
    HANDOFF_LIST_TOOL,
    'List buyer questions of the authenticated owner store without content.',
    emptySchema,
  )),
  eraseTool(handoffTool(
    HANDOFF_GET_TOOL,
    'Read one buyer question of the authenticated owner store.',
    handoffRefSchema,
  )),
  eraseTool(handoffTool(
    HANDOFF_REPLY_TOOL,
    'Bind the next owner message to one open buyer question.',
    handoffRefSchema,
  )),
  eraseTool(handoffTool(
    HANDOFF_CLOSE_TOOL,
    'Close one buyer question with or without an answer.',
    handoffRefSchema,
  )),
] as const;

const HANDOFF_OPERATIONS = new Set(
  sotuvchiHandoffTools.map((tool) => tool.name),
);

export function createSotuvchiHandoffDomainPort(
  service: SotuvchiHandoffService,
): AgentDomainServicePort {
  return {
    async execute(call) {
      if (call.agentId !== 'sotuvchi') {
        throw new HandoffAuthorizationError();
      }
      switch (call.operation) {
        case HANDOFF_REQUEST_TOOL: {
          const input = requestSchema.parse(call.input);
          const snapshot = await service.requestHandoff(
            call.org,
            input.reason,
            input.question,
          );
          return projectBuyerHandoffFacts(
            snapshot.handoff,
            call.org.locale,
            snapshot.outcome === 'created',
          );
        }
        case HANDOFF_LIST_TOOL: {
          emptySchema.parse(call.input);
          return projectSellerQueueFacts(
            await service.listHandoffs(call.org),
            call.org.locale,
          );
        }
        case HANDOFF_GET_TOOL: {
          const input = handoffRefSchema.parse(call.input);
          return projectSellerDetailFacts(
            await service.getHandoff(call.org, input.handoffId),
            call.org.locale,
          );
        }
        case HANDOFF_REPLY_TOOL: {
          const input = handoffRefSchema.parse(call.input);
          return projectSellerDetailFacts(
            await service.startReply(call.org, input.handoffId),
            call.org.locale,
            'seller_reply_prompt',
          );
        }
        case HANDOFF_CLOSE_TOOL: {
          const input = handoffRefSchema.parse(call.input);
          const snapshot = await service.closeHandoff(
            call.org,
            input.handoffId,
          );
          return projectSellerDetailFacts(
            snapshot.handoff,
            call.org.locale,
            'seller_closed',
          );
        }
        default:
          throw new HandoffAuthorizationError();
      }
    },
  };
}

/** Handoff operations first; every other operation keeps its port. */
export function withSotuvchiHandoffDomain(
  base: AgentDomainServicePort,
  handoff: AgentDomainServicePort,
): AgentDomainServicePort {
  return {
    execute(call) {
      return HANDOFF_OPERATIONS.has(call.operation)
        ? handoff.execute(call)
        : base.execute(call);
    },
  };
}
