// Production schema is migration-owned. This module intentionally exports only
// read-only contracts/assertions; test databases are bootstrapped by applying
// the real migration chain in test helpers.
export * from './schema-contract';
export {
  assertLeadRadarRuntimeSchema,
  hasLeadRadarPersonalDataSchema,
  LeadRadarSchemaUnavailableError,
} from './runtime-schema';
