/**
 * Store Pilot #1 import validator.
 *
 * Validates a seller product import file against the exact catalog contract
 * that production enforces. It imports the real normalizers rather than
 * restating the rules, so the validator cannot drift from the service.
 *
 * Read-only: it never touches D1, Cloudflare, Telegram or the network.
 *
 *   npx tsx scripts/market/validate-pilot-import.ts <file.json>
 *
 * Exit code 0 means the file is importable. Any other code means it is not.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  CATALOG_LIMITS,
  CatalogValidationError,
  normalizeAvailability,
  normalizeMediaRefs,
  normalizePriceMinor,
  normalizeProductDescription,
  normalizeProductName,
  normalizeSearchTerms,
  normalizeSku,
} from '../../functions/agents/sotuvchi/catalog';
import { STORE_PAYMENT_METHODS } from '../../functions/agents/sotuvchi/types';

const MIN_PILOT_PRODUCTS = 10;
const MAX_PILOT_PRODUCTS = 30;
const DELIVERY_MODES = new Set(['pickup', 'delivery', 'both']);
const LOCALES = new Set(['ru', 'uz']);

interface Finding {
  readonly where: string;
  readonly problem: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function check(
  findings: Finding[],
  where: string,
  run: () => void,
): void {
  try {
    run();
  } catch (error) {
    const problem = error instanceof CatalogValidationError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'invalid';
    findings.push({ where, problem });
  }
}

function validateStore(store: unknown, findings: Finding[]): void {
  if (!isRecord(store)) {
    findings.push({ where: 'store', problem: 'missing store block' });
    return;
  }
  check(findings, 'store.displayName', () => {
    normalizeProductName(store.displayName);
  });
  if (!LOCALES.has(String(store.locale))) {
    findings.push({ where: 'store.locale', problem: 'must be ru or uz' });
  }
  if (!DELIVERY_MODES.has(String(store.deliveryMode))) {
    findings.push({
      where: 'store.deliveryMode',
      problem: 'must be pickup, delivery or both',
    });
  }
  const methods = store.paymentMethods;
  if (!Array.isArray(methods) || methods.length === 0) {
    findings.push({
      where: 'store.paymentMethods',
      problem: 'at least one payment method is required',
    });
  } else {
    for (const method of methods) {
      if (!(STORE_PAYMENT_METHODS as readonly string[]).includes(
        String(method),
      )) {
        findings.push({
          where: 'store.paymentMethods',
          problem: `unsupported method ${String(method)}`,
        });
      }
    }
  }
  if (store.sellerTelegramVerified !== true) {
    findings.push({
      where: 'store.sellerTelegramVerified',
      problem: 'the seller Telegram identity must be verified out of band first',
    });
  }
  if (typeof store.consentRecordedAt !== 'string' || !store.consentRecordedAt) {
    findings.push({
      where: 'store.consentRecordedAt',
      problem: 'recorded seller consent is required before onboarding',
    });
  }
  for (const owner of ['supportOwner', 'incidentOwner'] as const) {
    const value = store[owner];
    if (typeof value !== 'string' || value.trim().length < 2) {
      findings.push({ where: `store.${owner}`, problem: 'must be named' });
    }
  }
  const sla = store.sellerResponseSlaMinutes;
  if (!Number.isInteger(sla) || Number(sla) <= 0) {
    findings.push({
      where: 'store.sellerResponseSlaMinutes',
      problem: 'must be a positive integer',
    });
  }
}

function validateCategories(
  value: unknown,
  findings: Finding[],
): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    findings.push({
      where: 'categories',
      problem: 'at least one category is required',
    });
    return keys;
  }
  value.forEach((category, index) => {
    const where = `categories[${index}]`;
    if (!isRecord(category)) {
      findings.push({ where, problem: 'must be an object' });
      return;
    }
    const key = String(category.key ?? '');
    if (!key) {
      findings.push({ where, problem: 'missing key' });
    } else if (keys.has(key)) {
      findings.push({ where, problem: `duplicate category key ${key}` });
    } else {
      keys.add(key);
    }
    check(findings, `${where}.name`, () => {
      normalizeProductName(category.name);
    });
  });
  return keys;
}

function validateProducts(
  value: unknown,
  categoryKeys: Set<string>,
  findings: Finding[],
): void {
  if (!Array.isArray(value)) {
    findings.push({ where: 'products', problem: 'must be an array' });
    return;
  }
  if (value.length < MIN_PILOT_PRODUCTS || value.length > MAX_PILOT_PRODUCTS) {
    findings.push({
      where: 'products',
      problem:
        `Store Pilot #1 requires ${MIN_PILOT_PRODUCTS}-${MAX_PILOT_PRODUCTS}`
        + ` approved products, found ${value.length}`,
    });
  }
  const seenKeys = new Set<string>();
  const seenSkus = new Set<string>();
  value.forEach((product, index) => {
    const where = `products[${index}]`;
    if (!isRecord(product)) {
      findings.push({ where, problem: 'must be an object' });
      return;
    }
    const key = String(product.key ?? '');
    if (!key) {
      findings.push({ where, problem: 'missing key' });
    } else if (seenKeys.has(key)) {
      findings.push({ where, problem: `duplicate product key ${key}` });
    } else {
      seenKeys.add(key);
    }
    if (!categoryKeys.has(String(product.categoryKey ?? ''))) {
      findings.push({
        where: `${where}.categoryKey`,
        problem: 'does not match any declared category',
      });
    }
    check(findings, `${where}.name`, () => {
      normalizeProductName(product.name);
    });
    check(findings, `${where}.description`, () => {
      normalizeProductDescription(product.description ?? null);
    });
    check(findings, `${where}.priceMinor`, () => {
      normalizePriceMinor(product.priceMinor);
    });
    if (product.currency !== 'UZS') {
      findings.push({
        where: `${where}.currency`,
        problem: 'UZS is the only accepted currency',
      });
    }
    check(findings, `${where}.availability`, () => {
      normalizeAvailability(product.availability);
    });
    if (!Number.isInteger(product.onHand) || Number(product.onHand) < 0) {
      findings.push({
        where: `${where}.onHand`,
        problem: 'opening inventory must be a non-negative integer',
      });
    }
    check(findings, `${where}.searchTerms`, () => {
      normalizeSearchTerms(product.searchTerms);
    });
    check(findings, `${where}.mediaRefs`, () => {
      normalizeMediaRefs(product.mediaRefs);
    });
    if (product.sku !== undefined && product.sku !== null) {
      check(findings, `${where}.sku`, () => {
        const sku = normalizeSku(product.sku);
        if (sku) {
          if (seenSkus.has(sku)) {
            throw new Error(`duplicate sku ${sku}`);
          }
          seenSkus.add(sku);
        }
      });
    }
    const specifications = product.specifications;
    if (specifications !== undefined) {
      if (!Array.isArray(specifications)) {
        findings.push({
          where: `${where}.specifications`,
          problem: 'must be an array',
        });
      } else if (specifications.length > CATALOG_LIMITS.specificationCount) {
        findings.push({
          where: `${where}.specifications`,
          problem: `at most ${CATALOG_LIMITS.specificationCount} entries`,
        });
      } else {
        specifications.forEach((specification, position) => {
          const at = `${where}.specifications[${position}]`;
          if (!isRecord(specification)) {
            findings.push({ where: at, problem: 'must be an object' });
            return;
          }
          for (const label of ['labelRu', 'labelUz'] as const) {
            const text = specification[label];
            if (
              typeof text !== 'string'
              || text.trim().length === 0
              || text.length > CATALOG_LIMITS.specificationLabelLength
            ) {
              findings.push({ where: `${at}.${label}`, problem: 'invalid' });
            }
          }
          const text = specification.value;
          if (
            typeof text !== 'string'
            || text.trim().length === 0
            || text.length > CATALOG_LIMITS.specificationValueLength
          ) {
            findings.push({ where: `${at}.value`, problem: 'invalid' });
          }
        });
      }
    }
  });
}

export function validatePilotImport(document: unknown): Finding[] {
  const findings: Finding[] = [];
  if (!isRecord(document)) {
    return [{ where: 'file', problem: 'must contain a JSON object' }];
  }
  if (document.isTemplate === true) {
    findings.push({
      where: 'file',
      problem:
        'this is the placeholder template. Copy it, replace every placeholder'
        + ' with approved real data and set isTemplate to false',
    });
  }
  validateStore(document.store, findings);
  const categoryKeys = validateCategories(document.categories, findings);
  validateProducts(document.products, categoryKeys, findings);
  return findings;
}

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: validate-pilot-import.ts <file.json>');
    process.exit(2);
  }
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    console.error(`not found: ${target}`);
    process.exit(2);
  }
  let document: unknown;
  try {
    document = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch {
    console.error('file is not valid JSON');
    process.exit(2);
  }
  const findings = validatePilotImport(document);
  if (findings.length === 0) {
    console.log('pilot-import: PASS');
    return;
  }
  console.error(`pilot-import: FAIL (${findings.length} finding(s))`);
  for (const finding of findings) {
    console.error(`  ${finding.where}: ${finding.problem}`);
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(
  import.meta.filename,
)) {
  main();
}
