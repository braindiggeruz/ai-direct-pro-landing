import {
  eraseTool,
  type AgentDomainServicePort,
  type RuntimeSchema,
  type Tool,
} from '../../../platform/contracts';
import { CheckoutAuthorizationError, CheckoutValidationError } from './errors';
import { projectCheckoutFacts, type CheckoutFactValues } from './facts';
import { composeCheckoutResponse } from './responses';
import type { SotuvchiCheckoutService } from './service';
import { requireCheckoutId } from './validation';

export const CHECKOUT_START_OPERATION = 'checkout.start';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const startSchema: RuntimeSchema<{ productRef: string }> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || Object.keys(value).length !== 1
      || !Object.hasOwn(value, 'productRef')
    ) {
      throw new CheckoutValidationError('invalid_input');
    }
    return { productRef: requireCheckoutId(value.productRef) };
  },
};

const startTool: Tool<{ productRef: string }, CheckoutFactValues> = {
  name: CHECKOUT_START_OPERATION,
  description:
    'Start a persistent checkout for one revalidated published product.',
  inputSchema: startSchema,
  async run(context, input) {
    const domain = context.services.agentDomain;
    if (!domain) throw new CheckoutAuthorizationError();
    return domain.execute({
      agentId: 'sotuvchi',
      operation: CHECKOUT_START_OPERATION,
      org: context.org,
      input,
    });
  },
  facts(values) {
    return { toolName: CHECKOUT_START_OPERATION, values };
  },
  response: { compose: composeCheckoutResponse },
};

export const sotuvchiCheckoutTools = [eraseTool(startTool)] as const;

const CHECKOUT_OPERATIONS = new Set<string>([CHECKOUT_START_OPERATION]);

export function createSotuvchiCheckoutDomainPort(
  service: SotuvchiCheckoutService,
): AgentDomainServicePort {
  return {
    async execute(call) {
      if (call.agentId !== 'sotuvchi') {
        throw new CheckoutAuthorizationError();
      }
      if (call.operation !== CHECKOUT_START_OPERATION) {
        throw new CheckoutAuthorizationError();
      }
      const input = startSchema.parse(call.input);
      return projectCheckoutFacts(
        await service.startCheckout(call.org, input.productRef),
        call.org.locale,
      );
    },
  };
}

/** Checkout operations first; every other operation keeps its existing port. */
export function withSotuvchiCheckoutDomain(
  base: AgentDomainServicePort,
  checkout: AgentDomainServicePort,
): AgentDomainServicePort {
  return {
    execute(call) {
      return CHECKOUT_OPERATIONS.has(call.operation)
        ? checkout.execute(call)
        : base.execute(call);
    },
  };
}
