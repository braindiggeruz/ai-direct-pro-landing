export const INVENTORY_MOVE_TYPES = [
  'initial',
  'manual_adjustment',
  'order_confirmed',
] as const;

export type InventoryMoveType = (typeof INVENTORY_MOVE_TYPES)[number];

/**
 * Quantitative source-of-truth for one product in one store. Catalog
 * `availability` stays declarative and is never turned into a number.
 */
export interface SotuvchiInventory {
  orgId: string;
  storeId: string;
  productId: string;
  onHand: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Append-only audit row. The balance itself lives in sotuvchi_inventory. */
export interface SotuvchiInventoryMove {
  id: string;
  orgId: string;
  storeId: string;
  productId: string;
  orderId: string | null;
  type: InventoryMoveType;
  delta: number;
  balanceAfter: number;
  idempotencyKey: string;
  createdAt: string;
}

/** Seller-facing row: opaque product ref plus its current balance. */
export interface InventorySnapshot {
  productId: string;
  productName: string;
  onHand: number;
  version: number;
}

export type InventoryOutcome = 'applied' | 'unchanged';

export interface SetInventoryResult {
  snapshot: InventorySnapshot;
  previousOnHand: number;
  delta: number;
  moveType: Extract<InventoryMoveType, 'initial' | 'manual_adjustment'>;
  outcome: InventoryOutcome;
}
