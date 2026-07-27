import { requireCatalogId } from '../catalog';
import { InventoryValidationError } from './errors';
import { INVENTORY_MOVE_TYPES, type InventoryMoveType } from './types';

export const INVENTORY_LIMITS = Object.freeze({
  minOnHand: 0,
  maxOnHand: 1_000_000,
  listLimit: 10,
});

const MOVE_TYPES = new Set<string>(INVENTORY_MOVE_TYPES);

export function requireInventoryId(value: unknown): string {
  try {
    return requireCatalogId(value);
  } catch {
    throw new InventoryValidationError('invalid_id');
  }
}

export function normalizeOnHand(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < INVENTORY_LIMITS.minOnHand
    || value > INVENTORY_LIMITS.maxOnHand
  ) {
    throw new InventoryValidationError('invalid_quantity');
  }
  return value;
}

/** Seller text input accepts plain ASCII digits only. */
export function parseOnHandText(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]{1,7}$/.test(trimmed)) return null;
  const onHand = Number(trimmed);
  return onHand <= INVENTORY_LIMITS.maxOnHand ? onHand : null;
}

export function requireInventoryVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new InventoryValidationError('invalid_version');
  }
  return Number(value);
}

export function requireInventoryMoveType(value: unknown): InventoryMoveType {
  if (typeof value !== 'string' || !MOVE_TYPES.has(value)) {
    throw new InventoryValidationError('invalid_move_type');
  }
  return value as InventoryMoveType;
}

export function requireInventoryBalance(value: unknown): number {
  return normalizeOnHand(typeof value === 'number' ? value : Number.NaN);
}

export function requireInventoryDelta(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < -INVENTORY_LIMITS.maxOnHand
    || value > INVENTORY_LIMITS.maxOnHand
  ) {
    throw new InventoryValidationError('invalid_quantity');
  }
  return value;
}
