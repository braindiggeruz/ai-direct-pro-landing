import { createIdentityService } from '../../../platform/identity';
import {
  createOrganizationStore,
  DuplicateSlugError,
} from '../../../platform/orgs';
import {
  createWorkflowEngine,
  WorkflowVersionConflictError,
  type WorkflowEngine,
  type WorkflowInstance,
} from '../../../platform/workflow';
import type {
  ConfirmOnboardingResult,
  ResolvedSotuvchiStorefront,
  SotuvchiIdentityContext,
  SotuvchiOnboardingDraft,
  SotuvchiOnboardingRecord,
  SotuvchiOnboardingSnapshot,
  SotuvchiOnboardingState,
  StoreProfile,
  SubmitOnboardingStepInput,
} from '../types';
import { SotuvchiOnboardingError } from './errors';
import { ensureSotuvchiOnboardingSchema } from './schema';
import {
  createSotuvchiOnboardingStore,
  type CompleteStoreResult,
  type SotuvchiOnboardingStore,
} from './store';
import {
  emptyOnboardingDraft,
  normalizeSotuvchiIdentityContext,
  normalizeSubmitStepInput,
  requireStorefrontCode,
  validateOnboardingDraft,
} from './validation';
import { sotuvchiOnboardingWorkflow } from './workflow';

const ONBOARDING_STATES = new Set<SotuvchiOnboardingState>([
  'start',
  'awaiting_name',
  'awaiting_locale',
  'awaiting_delivery',
  'awaiting_payment',
  'review',
  'completed',
  'cancelled',
]);
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const MAX_STOREFRONT_CODE_ATTEMPTS = 5;

export interface SotuvchiOnboardingServiceOptions {
  storefrontCodeGenerator?: () => string;
  maxStorefrontCodeAttempts?: number;
}

function generateStorefrontCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return requireStorefrontCode(`s-${encoded}`);
}

function organizationSlug(onboardingId: string): string {
  const opaque = onboardingId
    .replace(/^sotuvchi_onboarding_/, '')
    .replace(/[^a-z0-9]/g, '');
  if (opaque.length !== 32) {
    throw new SotuvchiOnboardingError('persistence_failed');
  }
  return `shop-${opaque}`;
}

function requireWorkflowInstance(
  instance: WorkflowInstance | null,
): WorkflowInstance<SotuvchiOnboardingDraft> {
  if (
    !instance
    || instance.workflowId !== sotuvchiOnboardingWorkflow.id
    || instance.workflowVersion !== sotuvchiOnboardingWorkflow.version
    || !ONBOARDING_STATES.has(instance.state as SotuvchiOnboardingState)
  ) {
    throw new SotuvchiOnboardingError('corrupt_row');
  }
  return {
    ...instance,
    state: instance.state,
    payload: validateOnboardingDraft(instance.payload),
  };
}

function requireExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new SotuvchiOnboardingError('invalid_version');
  }
  return Number(value);
}

function completeDraft(
  draft: SotuvchiOnboardingDraft,
): draft is SotuvchiOnboardingDraft & {
  storeName: string;
  locale: 'ru' | 'uz';
  deliveryMode: 'pickup' | 'delivery' | 'both';
} {
  return draft.storeName !== null
    && draft.locale !== null
    && draft.deliveryMode !== null
    && draft.paymentMethods.length > 0;
}

export class SotuvchiOnboardingService {
  private readonly identities;
  private readonly organizations;
  private readonly workflows: WorkflowEngine;
  private readonly store: SotuvchiOnboardingStore;
  private readonly codeGenerator: () => string;
  private readonly maxCodeAttempts: number;

  constructor(
    private readonly db: D1Database,
    options: SotuvchiOnboardingServiceOptions = {},
  ) {
    this.identities = createIdentityService(db);
    this.organizations = createOrganizationStore(db);
    this.workflows = createWorkflowEngine(db);
    this.store = createSotuvchiOnboardingStore(db);
    this.codeGenerator = options.storefrontCodeGenerator
      ?? generateStorefrontCode;
    this.maxCodeAttempts = options.maxStorefrontCodeAttempts
      ?? MAX_STOREFRONT_CODE_ATTEMPTS;
    if (
      !Number.isInteger(this.maxCodeAttempts)
      || this.maxCodeAttempts < 1
      || this.maxCodeAttempts > 10
    ) {
      throw new SotuvchiOnboardingError('invalid_storefront_code');
    }
  }

  private async ready(): Promise<void> {
    await ensureSotuvchiOnboardingSchema(this.db);
  }

  private async snapshot(
    record: SotuvchiOnboardingRecord,
  ): Promise<SotuvchiOnboardingSnapshot> {
    if (!record.orgId || !record.workflowInstanceId) {
      throw new SotuvchiOnboardingError('persistence_failed');
    }
    const instance = requireWorkflowInstance(
      await this.workflows.get(record.orgId, record.workflowInstanceId),
    );
    const store = await this.store.getOwnedStore(
      record.orgId,
      record.ownerIdentityId,
    );
    const state = instance.state as SotuvchiOnboardingState;
    const status = state === 'completed'
      ? 'completed'
      : state === 'cancelled'
        ? 'cancelled'
        : record.status;
    let normalizedRecord = record;
    if (record.status !== status) {
      normalizedRecord = await this.store.setOnboardingStatus(
        record.id,
        record.ownerIdentityId,
        status,
      );
    }
    return {
      record: normalizedRecord,
      orgId: record.orgId,
      workflowInstanceId: record.workflowInstanceId,
      state,
      version: instance.version,
      status,
      draft: instance.payload,
      store,
    };
  }

  private async ensureOrganization(
    record: SotuvchiOnboardingRecord,
    context: SotuvchiIdentityContext,
  ): Promise<SotuvchiOnboardingRecord> {
    if (record.orgId) return record;
    const slug = organizationSlug(record.id);
    let organization = await this.organizations.getOrganizationBySlug(slug);
    if (!organization) {
      try {
        const created = await this.organizations.createOrganizationWithOwner(
          {
            name: 'Sotuvchi store',
            slug,
            defaultLocale: context.locale,
          },
          context.identityId,
        );
        organization = created.organization;
      } catch (error) {
        if (!(error instanceof DuplicateSlugError)) throw error;
        organization = await this.organizations.getOrganizationBySlug(slug);
      }
    }
    if (
      !organization
      || !await this.organizations.hasRole(
        organization.id,
        context.identityId,
        'owner',
      )
    ) {
      throw new SotuvchiOnboardingError('owner_required');
    }
    return this.store.attachOrganization(
      record.id,
      context.identityId,
      organization.id,
    );
  }

  private async ensureWorkflow(
    record: SotuvchiOnboardingRecord,
  ): Promise<SotuvchiOnboardingRecord> {
    if (!record.orgId) throw new SotuvchiOnboardingError('persistence_failed');
    const tenantId = record.orgId;
    let instanceId = record.workflowInstanceId;
    if (!instanceId) {
      const created = await this.workflows.create(
        tenantId,
        sotuvchiOnboardingWorkflow,
        {
          idempotencyKey: `sotuvchi:onboarding:${record.id}`,
          initialPayload: emptyOnboardingDraft(),
        },
      );
      instanceId = created.instance.id;
      record = await this.store.attachWorkflow(
        record.id,
        record.ownerIdentityId,
        instanceId,
      );
    }
    if (!instanceId) throw new SotuvchiOnboardingError('persistence_failed');
    const workflowInstanceId = instanceId;
    let instance = requireWorkflowInstance(
      await this.workflows.get(tenantId, workflowInstanceId),
    );
    if (instance.state === 'start') {
      await this.workflows.transition(
        tenantId,
        sotuvchiOnboardingWorkflow,
        instance.id,
        {
          trigger: { on: 'action', actionId: 'begin' },
          idempotencyKey: `sotuvchi:onboarding:begin:${record.id}`,
          expectedVersion: instance.version,
        },
      );
      instance = requireWorkflowInstance(
        await this.workflows.get(tenantId, instance.id),
      );
    }
    if (
      instance.status === 'active'
      && record.status === 'starting'
    ) {
      record = await this.store.setOnboardingStatus(
        record.id,
        record.ownerIdentityId,
        'active',
      );
    }
    return record;
  }

  async startOnboarding(
    rawContext: unknown,
  ): Promise<SotuvchiOnboardingSnapshot> {
    const context = normalizeSotuvchiIdentityContext(rawContext);
    await this.ready();
    if (!await this.identities.getIdentityById(context.identityId)) {
      throw new SotuvchiOnboardingError('identity_not_found');
    }
    const claimed = await this.store.claimOnboarding(
      context.identityId,
      context.botUsername,
    );
    let record = claimed.record;
    if (record.botUsername !== context.botUsername) {
      throw new SotuvchiOnboardingError('tenant_mismatch');
    }
    record = await this.ensureOrganization(record, context);
    record = await this.ensureWorkflow(record);
    return this.snapshot(record);
  }

  async getOnboarding(
    rawContext: unknown,
  ): Promise<SotuvchiOnboardingSnapshot | null> {
    const context = normalizeSotuvchiIdentityContext(rawContext);
    await this.ready();
    const record = await this.store.getOnboardingByIdentity(
      context.identityId,
    );
    if (!record) return null;
    if (record.botUsername !== context.botUsername) {
      throw new SotuvchiOnboardingError('tenant_mismatch');
    }
    return this.snapshot(record);
  }

  async submitOnboardingStep(
    rawContext: unknown,
    rawInput: unknown,
  ): Promise<SotuvchiOnboardingSnapshot> {
    const context = normalizeSotuvchiIdentityContext(rawContext);
    const input: SubmitOnboardingStepInput = normalizeSubmitStepInput(rawInput);
    const current = await this.getOnboarding(context);
    if (!current) throw new SotuvchiOnboardingError('onboarding_not_found');
    if (current.status === 'completed' || current.status === 'cancelled') {
      throw new SotuvchiOnboardingError('onboarding_finished');
    }
    const action = {
      name: 'submit-name',
      locale: 'submit-locale',
      delivery: 'submit-delivery',
      payment: 'submit-payment',
    } as const;
    await this.workflows.transition(
      current.orgId,
      sotuvchiOnboardingWorkflow,
      current.workflowInstanceId,
      {
        trigger: { on: 'action', actionId: action[input.step] },
        idempotencyKey: input.idempotencyKey,
        expectedVersion: input.expectedVersion,
        triggerData: { value: input.value },
      },
    );
    const record = await this.store.getOnboardingByIdentity(
      context.identityId,
    );
    if (!record) throw new SotuvchiOnboardingError('persistence_failed');
    return this.snapshot(record);
  }

  async cancelOnboarding(
    rawContext: unknown,
    expectedVersion: unknown,
  ): Promise<SotuvchiOnboardingSnapshot> {
    const context = normalizeSotuvchiIdentityContext(rawContext);
    const version = requireExpectedVersion(expectedVersion);
    const current = await this.getOnboarding(context);
    if (!current) throw new SotuvchiOnboardingError('onboarding_not_found');
    if (current.status === 'completed') {
      throw new SotuvchiOnboardingError('onboarding_finished');
    }
    if (current.status !== 'cancelled') {
      await this.workflows.transition(
        current.orgId,
        sotuvchiOnboardingWorkflow,
        current.workflowInstanceId,
        {
          trigger: { on: 'action', actionId: 'cancel' },
          idempotencyKey: `sotuvchi:cancel:${context.requestId}`,
          expectedVersion: version,
        },
      );
    }
    const record = await this.store.getOnboardingByIdentity(
      context.identityId,
    );
    if (!record) throw new SotuvchiOnboardingError('persistence_failed');
    return this.snapshot(record);
  }

  private async completeStore(
    current: SotuvchiOnboardingSnapshot,
  ): Promise<Exclude<CompleteStoreResult, { outcome: 'collision' }>> {
    if (!completeDraft(current.draft)) {
      throw new SotuvchiOnboardingError('invalid_step');
    }
    for (let attempt = 0; attempt < this.maxCodeAttempts; attempt += 1) {
      const storefrontCode = requireStorefrontCode(this.codeGenerator());
      const result = await this.store.completeStoreWithRoute(
        current.orgId,
        current.record.ownerIdentityId,
        {
          name: current.draft.storeName,
          locale: current.draft.locale,
          deliveryMode: current.draft.deliveryMode,
          paymentMethods: current.draft.paymentMethods,
          storefrontCode,
          botUsername: current.record.botUsername,
        },
      );
      if (result.outcome !== 'collision') return result;
    }
    throw new SotuvchiOnboardingError('storefront_collision');
  }

  async confirmOnboarding(
    rawContext: unknown,
    expectedVersion: unknown,
  ): Promise<ConfirmOnboardingResult> {
    const context = normalizeSotuvchiIdentityContext(rawContext);
    const version = requireExpectedVersion(expectedVersion);
    let current = await this.getOnboarding(context);
    if (!current) throw new SotuvchiOnboardingError('onboarding_not_found');
    if (current.state !== 'review' && current.state !== 'completed') {
      throw new SotuvchiOnboardingError('invalid_step');
    }
    if (
      !await this.organizations.hasRole(
        current.orgId,
        context.identityId,
        'owner',
      )
    ) {
      throw new SotuvchiOnboardingError('owner_required');
    }
    if (!completeDraft(current.draft)) {
      throw new SotuvchiOnboardingError('invalid_step');
    }

    await this.organizations.updateOrganization(current.orgId, {
      name: current.draft.storeName,
      defaultLocale: current.draft.locale,
    });
    const completed = await this.completeStore(current);

    if (current.state !== 'completed') {
      try {
        await this.workflows.transition(
          current.orgId,
          sotuvchiOnboardingWorkflow,
          current.workflowInstanceId,
          {
            trigger: { on: 'action', actionId: 'confirm' },
            idempotencyKey: `sotuvchi:confirm:${context.requestId}`,
            expectedVersion: version,
          },
        );
      } catch (error) {
        if (!(error instanceof WorkflowVersionConflictError)) throw error;
        const refreshed = await this.getOnboarding(context);
        if (!refreshed || refreshed.state !== 'completed') throw error;
      }
      current = (await this.getOnboarding(context)) ?? current;
    }
    if (current.state !== 'completed') {
      throw new SotuvchiOnboardingError('persistence_failed');
    }
    await this.store.setOnboardingStatus(
      current.record.id,
      context.identityId,
      'completed',
    );
    return {
      store: completed.store,
      route: completed.route,
      outcome: completed.outcome,
      workflowStatus: 'completed',
    };
  }

  async getOwnedStore(rawContext: unknown): Promise<StoreProfile | null> {
    const context = normalizeSotuvchiIdentityContext(rawContext);
    await this.ready();
    const record = await this.store.getOnboardingByIdentity(
      context.identityId,
    );
    if (!record?.orgId) return null;
    if (record.botUsername !== context.botUsername) {
      throw new SotuvchiOnboardingError('tenant_mismatch');
    }
    return this.store.getOwnedStore(record.orgId, context.identityId);
  }

  async resolveStorefrontRoute(
    botUsername: string,
    storefrontCode: string,
  ): Promise<ResolvedSotuvchiStorefront | null> {
    await this.ready();
    return this.store.resolveStorefrontRoute(botUsername, storefrontCode);
  }
}

export function createSotuvchiOnboardingService(
  db: D1Database,
  options: SotuvchiOnboardingServiceOptions = {},
): SotuvchiOnboardingService {
  return new SotuvchiOnboardingService(db, options);
}
