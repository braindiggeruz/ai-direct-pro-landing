import type {
  DeterministicRule,
  RuntimeMessage,
  RuntimeStepResult,
} from '../../../platform/contracts';
import { parseOnHandText } from '../inventory';
import {
  SELLER_CANCEL_ACTION_PREFIX,
  SELLER_CONFIRM_ACTION_PREFIX,
  SELLER_DONE_ACTION_PREFIX,
  SELLER_INVENTORY_ACTION,
  SELLER_ORDER_ACTION_PREFIX,
  SELLER_ORDERS_ACTION,
} from './responses';
import {
  SELLER_INVENTORY_GET_TOOL,
  SELLER_INVENTORY_SET_TOOL,
  SELLER_ORDER_CANCEL_TOOL,
  SELLER_ORDER_CONFIRM_TOOL,
  SELLER_ORDER_DONE_TOOL,
  SELLER_ORDER_GET_TOOL,
  SELLER_ORDER_LIST_TOOL,
} from './tools';

const ORDER_REF = /^([a-z0-9][a-z0-9._-]{0,47})$/;
const INVENTORY_COMMAND =
  /^(?:остаток|qoldiq)\s*:\s*([A-Za-z0-9][A-Za-z0-9._:-]{0,47})\s*\|\s*(\d{1,7})\s*$/iu;

const ORDER_ACTIONS: readonly { prefix: string; tool: string }[] = [
  { prefix: SELLER_CONFIRM_ACTION_PREFIX, tool: SELLER_ORDER_CONFIRM_TOOL },
  { prefix: SELLER_CANCEL_ACTION_PREFIX, tool: SELLER_ORDER_CANCEL_TOOL },
  { prefix: SELLER_DONE_ACTION_PREFIX, tool: SELLER_ORDER_DONE_TOOL },
  { prefix: SELLER_ORDER_ACTION_PREFIX, tool: SELLER_ORDER_GET_TOOL },
];

function textOf(message: RuntimeMessage): string | null {
  return message.kind === 'text' ? message.text.trim() : null;
}

function reject(): RuntimeStepResult {
  return { kind: 'reject', reasonCode: 'rejected' };
}

/**
 * Seller order actions. The order reference is a server-generated opaque id
 * revalidated inside the owner store on every call; it carries no authority.
 */
export const sotuvchiSellerOrderActionRule: DeterministicRule = {
  id: 'seller-order-action',
  priority: 120,
  match(input) {
    return input.message.kind === 'action'
      && (
        input.message.actionId === SELLER_ORDERS_ACTION
        || input.message.actionId === SELLER_INVENTORY_ACTION
        || ORDER_ACTIONS.some(
          (action) => input.message.kind === 'action'
            && input.message.actionId.startsWith(action.prefix),
        )
      );
  },
  async execute(_context, input) {
    if (input.message.kind !== 'action') return reject();
    const actionId = input.message.actionId;
    if (actionId === SELLER_ORDERS_ACTION) {
      return { kind: 'tool', toolName: SELLER_ORDER_LIST_TOOL, input: {} };
    }
    if (actionId === SELLER_INVENTORY_ACTION) {
      return { kind: 'tool', toolName: SELLER_INVENTORY_GET_TOOL, input: {} };
    }
    for (const action of ORDER_ACTIONS) {
      if (!actionId.startsWith(action.prefix)) continue;
      const ref = ORDER_REF.exec(actionId.slice(action.prefix.length));
      if (!ref) return reject();
      return {
        kind: 'tool',
        toolName: action.tool,
        input: { orderId: ref[1] },
      };
    }
    return reject();
  },
};

export const sotuvchiSellerOrderListCommandRule: DeterministicRule = {
  id: 'seller-order-list-command',
  priority: 121,
  match(input) {
    const text = textOf(input.message)?.toLowerCase();
    return text === 'заказы' || text === 'buyurtmalar';
  },
  async execute() {
    return { kind: 'tool', toolName: SELLER_ORDER_LIST_TOOL, input: {} };
  },
};

export const sotuvchiSellerInventoryListCommandRule: DeterministicRule = {
  id: 'seller-inventory-list-command',
  priority: 122,
  match(input) {
    const text = textOf(input.message)?.toLowerCase();
    return text === 'остатки' || text === 'qoldiqlar';
  },
  async execute() {
    return { kind: 'tool', toolName: SELLER_INVENTORY_GET_TOOL, input: {} };
  },
};

export const sotuvchiSellerInventorySetCommandRule: DeterministicRule = {
  id: 'seller-inventory-set-command',
  priority: 123,
  match(input) {
    const text = textOf(input.message);
    return text !== null && /^(?:остаток|qoldiq)\s*:/iu.test(text);
  },
  async execute(context, input) {
    const text = textOf(input.message) ?? '';
    const parsed = INVENTORY_COMMAND.exec(text);
    const onHand = parsed ? parseOnHandText(parsed[2]) : null;
    if (!parsed || onHand === null) {
      return {
        kind: 'answer',
        response: {
          messages: [{
            text: context.org.locale === 'ru'
              ? 'Отправьте: Остаток: идентификатор | количество'
              : 'Yuboring: Qoldiq: identifikator | miqdor',
          }],
          claims: [],
        },
        facts: [],
      };
    }
    return {
      kind: 'tool',
      toolName: SELLER_INVENTORY_SET_TOOL,
      input: { productId: parsed[1], onHand },
    };
  },
};

export const sotuvchiOrdersRules = [
  sotuvchiSellerOrderActionRule,
  sotuvchiSellerOrderListCommandRule,
  sotuvchiSellerInventoryListCommandRule,
  sotuvchiSellerInventorySetCommandRule,
] as const;
