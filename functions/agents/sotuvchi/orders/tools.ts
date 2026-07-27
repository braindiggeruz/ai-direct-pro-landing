import {
  eraseTool,
  type AgentDomainServicePort,
  type RuntimeSchema,
  type Tool,
} from '../../../platform/contracts';
import { normalizeOnHand } from '../inventory';
import {
  SellerOrdersAuthorizationError,
  SellerOrdersValidationError,
} from './errors';
import {
  projectSellerInventoryFacts,
  projectSellerInventoryItemFacts,
  projectSellerOrderFacts,
  projectSellerOrdersFacts,
  projectSellerTransitionFacts,
  type OrdersFactValues,
} from './facts';
import { composeSellerOrdersResponse } from './responses';
import type { SotuvchiOrdersService } from './service';
import { requireSellerId } from './validation';

export const SELLER_ORDER_LIST_TOOL = 'seller.orders.list';
export const SELLER_ORDER_GET_TOOL = 'seller.order.get';
export const SELLER_ORDER_CONFIRM_TOOL = 'seller.order.confirm';
export const SELLER_ORDER_CANCEL_TOOL = 'seller.order.cancel';
export const SELLER_ORDER_DONE_TOOL = 'seller.order.done';
export const SELLER_INVENTORY_GET_TOOL = 'seller.inventory.get';
export const SELLER_INVENTORY_SET_TOOL = 'seller.inventory.set';

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
      throw new SellerOrdersValidationError('invalid_input');
    }
    return {};
  },
};

const orderRefSchema: RuntimeSchema<{ orderId: string }> = {
  parse(value) {
    if (!isPlainObject(value) || !exactKeys(value, new Set(['orderId']))) {
      throw new SellerOrdersValidationError('invalid_id');
    }
    return { orderId: requireSellerId(value.orderId) };
  },
};

/** `{}` lists every balance; `{ productId }` reads exactly one. */
const inventoryGetSchema: RuntimeSchema<{ productId?: string }> = {
  parse(value) {
    if (!isPlainObject(value)) {
      throw new SellerOrdersValidationError('invalid_input');
    }
    if (Object.keys(value).length === 0) return {};
    if (!exactKeys(value, new Set(['productId']))) {
      throw new SellerOrdersValidationError('invalid_input');
    }
    return { productId: requireSellerId(value.productId) };
  },
};

const inventorySetSchema: RuntimeSchema<{
  productId: string;
  onHand: number;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['productId', 'onHand']))
    ) {
      throw new SellerOrdersValidationError('invalid_input');
    }
    return {
      productId: requireSellerId(value.productId),
      onHand: normalizeOnHand(value.onHand),
    };
  },
};

function sellerTool<I>(
  name: string,
  description: string,
  inputSchema: RuntimeSchema<I>,
): Tool<I, OrdersFactValues> {
  return {
    name,
    description,
    inputSchema,
    async run(context, input) {
      const domain = context.services.agentDomain;
      if (!domain) throw new SellerOrdersAuthorizationError();
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
    response: { compose: composeSellerOrdersResponse },
  };
}

export const sotuvchiOrdersTools = [
  eraseTool(sellerTool(
    SELLER_ORDER_LIST_TOOL,
    'List placed orders of the authenticated owner store without contacts.',
    emptySchema,
  )),
  eraseTool(sellerTool(
    SELLER_ORDER_GET_TOOL,
    'Read one placed order of the authenticated owner store with contacts.',
    orderRefSchema,
  )),
  eraseTool(sellerTool(
    SELLER_ORDER_CONFIRM_TOOL,
    'Confirm one placed order and decrement stock exactly once.',
    orderRefSchema,
  )),
  eraseTool(sellerTool(
    SELLER_ORDER_CANCEL_TOOL,
    'Cancel one placed order without touching inventory.',
    orderRefSchema,
  )),
  eraseTool(sellerTool(
    SELLER_ORDER_DONE_TOOL,
    'Mark one confirmed order as done.',
    orderRefSchema,
  )),
  eraseTool(sellerTool(
    SELLER_INVENTORY_GET_TOOL,
    'Read inventory balances of the authenticated owner store.',
    inventoryGetSchema,
  )),
  eraseTool(sellerTool(
    SELLER_INVENTORY_SET_TOOL,
    'Set the absolute stock balance of one sellable product.',
    inventorySetSchema,
  )),
] as const;

const SELLER_OPERATIONS = new Set(
  sotuvchiOrdersTools.map((tool) => tool.name),
);

export function createSotuvchiOrdersDomainPort(
  service: SotuvchiOrdersService,
): AgentDomainServicePort {
  return {
    async execute(call) {
      if (call.agentId !== 'sotuvchi') {
        throw new SellerOrdersAuthorizationError();
      }
      switch (call.operation) {
        case SELLER_ORDER_LIST_TOOL: {
          emptySchema.parse(call.input);
          return projectSellerOrdersFacts(
            await service.listOrders(call.org),
            call.org.locale,
          );
        }
        case SELLER_ORDER_GET_TOOL: {
          const input = orderRefSchema.parse(call.input);
          return projectSellerOrderFacts(
            await service.getOrder(call.org, input.orderId),
            call.org.locale,
          );
        }
        case SELLER_ORDER_CONFIRM_TOOL: {
          const input = orderRefSchema.parse(call.input);
          return projectSellerTransitionFacts(
            await service.confirmOrder(call.org, input.orderId),
            call.org.locale,
          );
        }
        case SELLER_ORDER_CANCEL_TOOL: {
          const input = orderRefSchema.parse(call.input);
          return projectSellerTransitionFacts(
            await service.cancelOrder(call.org, input.orderId),
            call.org.locale,
          );
        }
        case SELLER_ORDER_DONE_TOOL: {
          const input = orderRefSchema.parse(call.input);
          return projectSellerTransitionFacts(
            await service.completeOrder(call.org, input.orderId),
            call.org.locale,
          );
        }
        case SELLER_INVENTORY_GET_TOOL: {
          const input = inventoryGetSchema.parse(call.input);
          if (input.productId === undefined) {
            return projectSellerInventoryFacts(
              await service.listInventory(call.org),
            );
          }
          const snapshot = await service.getInventory(
            call.org,
            input.productId,
          );
          return projectSellerInventoryItemFacts({
            snapshot,
            previousOnHand: snapshot.onHand,
            delta: 0,
            moveType: 'manual_adjustment',
            outcome: 'unchanged',
          });
        }
        case SELLER_INVENTORY_SET_TOOL: {
          const input = inventorySetSchema.parse(call.input);
          return projectSellerInventoryItemFacts(
            await service.setInventory(
              call.org,
              input.productId,
              input.onHand,
            ),
          );
        }
        default:
          throw new SellerOrdersAuthorizationError();
      }
    },
  };
}

/** Seller order operations first; every other operation keeps its port. */
export function withSotuvchiOrdersDomain(
  base: AgentDomainServicePort,
  orders: AgentDomainServicePort,
): AgentDomainServicePort {
  return {
    execute(call) {
      return SELLER_OPERATIONS.has(call.operation)
        ? orders.execute(call)
        : base.execute(call);
    },
  };
}
