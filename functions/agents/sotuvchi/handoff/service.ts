import type { OrgContext } from '../../../platform/contracts';
import {
  createWorkflowEngine,
  WorkflowAlreadyFinishedError,
  WorkflowTransitionNotAllowedError,
  WorkflowVersionConflictError,
  type WorkflowEngine,
} from '../../../platform/workflow';
import type { SotuvchiCatalogService } from '../catalog';
import {
  HandoffAuthorizationError,
  HandoffExpiredError,
  HandoffIdempotencyConflictError,
  HandoffNotFoundError,
  HandoffPersistenceError,
  HandoffReplyConflictError,
  HandoffStateError,
} from './errors';
import { ensureSotuvchiHandoffSchema } from './schema';
import {
  createSotuvchiHandoffStore,
  type HandoffOperationInput,
  type HandoffStore,
} from './store';
import type {
  HandoffBuyerSession,
  HandoffReason,
  HandoffSnapshot,
  HandoffSummary,
  SellerReplySession,
  SotuvchiHandoff,
} from './types';
import {
  expiryFrom,
  HANDOFF_LIMITS,
  isExpiredAt,
  normalizeHandoffQuestion,
  normalizeHandoffReply,
  requireHandoffId,
  requireHandoffLimit,
  requireHandoffReason,
  validateSellerReplyPayload,
} from './validation';
import { sotuvchiSellerReplyWorkflow } from './workflow';

const ID_BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

export interface SotuvchiHandoffServiceOptions {
  handoffIdGenerator?: () => string;
}

export interface SellerHandoffContext {
  identityId: string;
  orgId: string;
  storeId: string;
  requestId: string;
}

function randomBase32(prefix: 'h'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += ID_BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return `${prefix}-${encoded}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class SotuvchiHandoffService {
  private readonly store: HandoffStore;
  private readonly workflows: WorkflowEngine;
  private readonly handoffIdGenerator: () => string;

  constructor(
    private readonly db: D1Database,
    private readonly catalog: SotuvchiCatalogService,
    private readonly botUsername: string,
    options: SotuvchiHandoffServiceOptions = {},
  ) {
    this.store = createSotuvchiHandoffStore(db);
    this.workflows = createWorkflowEngine(db);
    this.handoffIdGenerator = options.handoffIdGenerator
      ?? (() => randomBase32('h'));
  }

  private async ready(): Promise<void> {
    await ensureSotuvchiHandoffSchema(this.db);
  }

  /**
   * Retention sweep. There is no scheduler, so cleanup runs opportunistically
   * on every scoped read or write; the exact moment of physical deletion is
   * therefore not guaranteed, only that expired content is unreadable.
   */
  private async sweep(orgId: string, storeId: string): Promise<void> {
    await this.store.clearExpiredContent(
      orgId,
      storeId,
      new Date().toISOString(),
    );
  }

  private async trustedBuyerSession(
    org: OrgContext,
  ): Promise<HandoffBuyerSession> {
    await this.ready();
    if (!org.actorId) throw new HandoffAuthorizationError();
    const session = await this.store.findBuyerSession(
      this.botUsername,
      org.actorId,
    );
    if (!session || session.orgId !== org.orgId) {
      throw new HandoffAuthorizationError();
    }
    await this.sweep(session.orgId, session.storeId);
    return session;
  }

  async resolveSeller(org: OrgContext): Promise<SellerHandoffContext> {
    await this.ready();
    if (!org.actorId) throw new HandoffAuthorizationError();
    const owner = await this.catalog.resolveOwnerContext({
      identityId: org.actorId,
      orgId: org.orgId,
      requestId: org.requestId,
      locale: org.locale,
    });
    await this.sweep(owner.orgId, owner.storeId);
    return {
      identityId: owner.identityId,
      orgId: owner.orgId,
      storeId: owner.storeId,
      requestId: requireHandoffId(org.requestId),
    };
  }

  private async operation(
    requestId: string,
    name: string,
    value: unknown,
  ): Promise<HandoffOperationInput> {
    return {
      idempotencyKey: requireHandoffId(requestId),
      operation: name,
      fingerprint: await fingerprint({ name, value }),
      createdAt: new Date().toISOString(),
    };
  }

  private async replay(
    orgId: string,
    storeId: string,
    operation: HandoffOperationInput,
  ): Promise<string | null> {
    const record = await this.store.getOperation(
      orgId,
      storeId,
      operation.idempotencyKey,
    );
    if (!record) return null;
    if (
      record.operation !== operation.operation
      || record.fingerprint !== operation.fingerprint
    ) {
      throw new HandoffIdempotencyConflictError();
    }
    return record.targetId;
  }

  private async requireHandoff(
    orgId: string,
    storeId: string,
    handoffId: string,
  ): Promise<SotuvchiHandoff> {
    const handoff = await this.store.getHandoff(orgId, handoffId);
    if (!handoff || handoff.storeId !== storeId) {
      throw new HandoffNotFoundError();
    }
    return handoff;
  }

  /**
   * Buyer escalation. A repeated request resolves to the conversation already
   * open instead of creating a second one, so the seller queue cannot be
   * flooded by one buyer.
   */
  async requestHandoff(
    org: OrgContext,
    rawReason: unknown,
    rawQuestion: unknown,
  ): Promise<HandoffSnapshot> {
    const session = await this.trustedBuyerSession(org);
    const reason: HandoffReason = requireHandoffReason(rawReason);
    const questionText = normalizeHandoffQuestion(rawQuestion);
    // The fingerprint covers the step, never the question itself.
    const operation = await this.operation(org.requestId, 'handoff.create', {
      reason,
    });
    const replayed = await this.replay(
      session.orgId,
      session.storeId,
      operation,
    );
    if (replayed !== null) {
      return {
        handoff: await this.requireHandoff(
          session.orgId,
          session.storeId,
          replayed,
        ),
        outcome: 'existing',
      };
    }

    const existing = await this.store.findActiveForSession(
      session.orgId,
      session.storeId,
      session.id,
    );
    if (existing) return { handoff: existing, outcome: 'existing' };

    const createdAt = new Date().toISOString();
    const changes = await this.store.createHandoff(
      {
        id: this.handoffIdGenerator(),
        orgId: session.orgId,
        storeId: session.storeId,
        buyerIdentityId: session.identityId,
        buyerSessionId: session.id,
        sellerIdentityId: await this.store.findStoreOwner(
          session.orgId,
          session.storeId,
        ),
        reason,
        questionText,
        createdAt,
        expiresAt: expiryFrom(createdAt, HANDOFF_LIMITS.contentTtlMs),
      },
      operation,
    );
    if (changes.some((value) => value !== 1)) {
      const raced = await this.store.findActiveForSession(
        session.orgId,
        session.storeId,
        session.id,
      );
      if (raced) return { handoff: raced, outcome: 'existing' };
      throw new HandoffPersistenceError('persistence_failed');
    }
    const created = await this.store.findActiveForSession(
      session.orgId,
      session.storeId,
      session.id,
    );
    if (!created) throw new HandoffPersistenceError('persistence_failed');
    return { handoff: created, outcome: 'created' };
  }

  async getActiveForBuyer(org: OrgContext): Promise<SotuvchiHandoff | null> {
    const session = await this.trustedBuyerSession(org);
    return this.store.findActiveForSession(
      session.orgId,
      session.storeId,
      session.id,
    );
  }

  async listHandoffs(
    org: OrgContext,
    rawLimit?: unknown,
  ): Promise<readonly HandoffSummary[]> {
    const seller = await this.resolveSeller(org);
    return this.store.listHandoffs(
      seller.orgId,
      seller.storeId,
      requireHandoffLimit(rawLimit, HANDOFF_LIMITS.listLimit),
    );
  }

  async getHandoff(
    org: OrgContext,
    rawHandoffId: unknown,
  ): Promise<SotuvchiHandoff> {
    const seller = await this.resolveSeller(org);
    return this.requireHandoff(
      seller.orgId,
      seller.storeId,
      requireHandoffId(rawHandoffId),
    );
  }

  /** Binds the seller's next message to one handoff, durably. */
  async startReply(
    org: OrgContext,
    rawHandoffId: unknown,
  ): Promise<SotuvchiHandoff> {
    const seller = await this.resolveSeller(org);
    const handoffId = requireHandoffId(rawHandoffId);
    const handoff = await this.requireHandoff(
      seller.orgId,
      seller.storeId,
      handoffId,
    );
    const now = new Date().toISOString();
    if (handoff.contentCleared || isExpiredAt(handoff.expiresAt, now)) {
      throw new HandoffExpiredError();
    }
    if (handoff.status !== 'open') {
      throw new HandoffStateError(
        handoff.status === 'answered' ? 'already_answered' : 'invalid_transition',
      );
    }
    const created = await this.workflows.create(
      seller.orgId,
      sotuvchiSellerReplyWorkflow,
      {
        idempotencyKey: `sotuvchi:handoff-reply:${handoffId}:${seller.requestId}`,
        initialPayload: { handoffId },
      },
    );
    await this.store.startReplySession({
      orgId: seller.orgId,
      storeId: seller.storeId,
      sellerIdentityId: seller.identityId,
      handoffId,
      workflowInstanceId: created.instance.id,
      requestKey: seller.requestId,
      createdAt: now,
      expiresAt: expiryFrom(now, HANDOFF_LIMITS.replySessionTtlMs),
    });
    return handoff;
  }

  /**
   * Channel-facing lookup of the trusted active reply workflow. The seller
   * never supplies an org, store, handoff or workflow reference; the org comes
   * from the already-resolved onboarding context and ownership is re-checked
   * again on every write.
   */
  async getActiveReplyWorkflowRef(
    orgId: unknown,
    identityId: unknown,
  ): Promise<{ orgId: string; instanceId: string; expectedVersion: number } | null> {
    await this.ready();
    const session = await this.store.findReplySessionByOwner(
      requireHandoffId(orgId),
      requireHandoffId(identityId),
    );
    if (
      !session
      || session.state !== 'awaiting_reply'
      || isExpiredAt(session.expiresAt, new Date().toISOString())
    ) {
      return null;
    }
    const instance = await this.workflows.get(
      session.orgId,
      session.workflowInstanceId,
    );
    if (
      !instance
      || instance.workflowId !== sotuvchiSellerReplyWorkflow.id
      || instance.state !== 'awaiting_reply'
    ) {
      return null;
    }
    validateSellerReplyPayload(instance.payload);
    return {
      orgId: session.orgId,
      instanceId: session.workflowInstanceId,
      expectedVersion: instance.version,
    };
  }

  private async settleReplyWorkflow(
    session: SellerReplySession,
    actionId: 'submit-reply' | 'cancel',
    requestId: string,
  ): Promise<void> {
    const instance = await this.workflows.get(
      session.orgId,
      session.workflowInstanceId,
    );
    if (!instance || instance.state !== 'awaiting_reply') return;
    try {
      await this.workflows.transition(
        session.orgId,
        sotuvchiSellerReplyWorkflow,
        session.workflowInstanceId,
        {
          trigger: { on: 'action', actionId },
          idempotencyKey: `sotuvchi:handoff-reply:${actionId}:${requestId}`,
          expectedVersion: instance.version,
        },
      );
    } catch (error) {
      if (
        !(error instanceof WorkflowVersionConflictError)
        && !(error instanceof WorkflowAlreadyFinishedError)
        && !(error instanceof WorkflowTransitionNotAllowedError)
      ) {
        throw error;
      }
    }
  }

  /** Exactly one final seller reply per handoff. */
  async submitReply(
    org: OrgContext,
    rawReply: unknown,
  ): Promise<HandoffSnapshot> {
    const seller = await this.resolveSeller(org);
    const session = await this.store.findReplySession(
      seller.orgId,
      seller.storeId,
      seller.identityId,
    );
    if (!session) throw new HandoffStateError('no_reply_session');
    const replyText = normalizeHandoffReply(rawReply);
    // The fingerprint covers the target, never the reply itself.
    const operation = await this.operation(seller.requestId, 'handoff.reply', {
      handoffId: session.handoffId,
    });
    // Replay is resolved before the session state guard: submitting the reply
    // settles the session, so a repeated update must return the stored answer
    // instead of reading the settled session as a missing target.
    const replayed = await this.replay(
      seller.orgId,
      seller.storeId,
      operation,
    );
    if (replayed !== null) {
      return {
        handoff: await this.requireHandoff(
          seller.orgId,
          seller.storeId,
          replayed,
        ),
        outcome: 'unchanged',
      };
    }
    if (session.state !== 'awaiting_reply') {
      throw new HandoffStateError('no_reply_session');
    }
    const now = new Date().toISOString();
    if (isExpiredAt(session.expiresAt, now)) {
      throw new HandoffExpiredError();
    }

    const handoff = await this.requireHandoff(
      seller.orgId,
      seller.storeId,
      session.handoffId,
    );
    if (handoff.contentCleared || isExpiredAt(handoff.expiresAt, now)) {
      throw new HandoffExpiredError();
    }
    if (handoff.status === 'answered' || handoff.replyText !== null) {
      throw new HandoffReplyConflictError();
    }
    if (handoff.status !== 'open') {
      throw new HandoffStateError('invalid_transition');
    }
    const changes = await this.store.answerHandoff(
      handoff,
      seller.identityId,
      replyText,
      now,
      operation,
    );
    if (changes.some((value) => value !== 1)) {
      throw new HandoffReplyConflictError();
    }
    await this.store.settleReplySession(
      seller.orgId,
      seller.storeId,
      seller.identityId,
      'completed',
      now,
    );
    await this.settleReplyWorkflow(session, 'submit-reply', seller.requestId);
    return {
      handoff: await this.requireHandoff(
        seller.orgId,
        seller.storeId,
        handoff.id,
      ),
      outcome: 'answered',
    };
  }

  async closeHandoff(
    org: OrgContext,
    rawHandoffId: unknown,
  ): Promise<HandoffSnapshot> {
    const seller = await this.resolveSeller(org);
    const handoffId = requireHandoffId(rawHandoffId);
    const operation = await this.operation(seller.requestId, 'handoff.close', {
      handoffId,
    });
    const replayed = await this.replay(seller.orgId, seller.storeId, operation);
    if (replayed !== null) {
      return {
        handoff: await this.requireHandoff(
          seller.orgId,
          seller.storeId,
          replayed,
        ),
        outcome: 'unchanged',
      };
    }
    const handoff = await this.requireHandoff(
      seller.orgId,
      seller.storeId,
      handoffId,
    );
    if (handoff.status === 'closed' || handoff.status === 'expired') {
      return { handoff, outcome: 'unchanged' };
    }
    const now = new Date().toISOString();
    const changes = await this.store.closeHandoff(
      handoff,
      seller.identityId,
      now,
      operation,
    );
    if (changes.some((value) => value !== 1)) {
      throw new HandoffStateError('invalid_transition');
    }
    const session = await this.store.findReplySession(
      seller.orgId,
      seller.storeId,
      seller.identityId,
    );
    if (session && session.handoffId === handoff.id) {
      await this.store.settleReplySession(
        seller.orgId,
        seller.storeId,
        seller.identityId,
        'cancelled',
        now,
      );
      await this.settleReplyWorkflow(session, 'cancel', seller.requestId);
    }
    return {
      handoff: await this.requireHandoff(
        seller.orgId,
        seller.storeId,
        handoff.id,
      ),
      outcome: 'closed',
    };
  }

  // ── Delivery surface ─────────────────────────────────────────────────────

  async listPendingSellerNotifications(
    orgId: string,
    storeId: string,
    limit: number = HANDOFF_LIMITS.listLimit,
  ): Promise<readonly SotuvchiHandoff[]> {
    await this.ready();
    return this.store.listPendingSellerNotifications(
      requireHandoffId(orgId),
      requireHandoffId(storeId),
      requireHandoffLimit(limit, HANDOFF_LIMITS.listLimit),
    );
  }

  async listPendingBuyerDeliveries(
    orgId: string,
    storeId: string,
    limit: number = HANDOFF_LIMITS.listLimit,
  ): Promise<readonly SotuvchiHandoff[]> {
    await this.ready();
    return this.store.listPendingBuyerDeliveries(
      requireHandoffId(orgId),
      requireHandoffId(storeId),
      requireHandoffLimit(limit, HANDOFF_LIMITS.listLimit),
    );
  }

  claimSellerNotification(orgId: string, handoffId: string): Promise<number> {
    return this.store.claimSellerNotification(
      orgId,
      handoffId,
      new Date().toISOString(),
    );
  }

  markSellerNotified(orgId: string, handoffId: string): Promise<number> {
    return this.store.markSellerNotified(
      orgId,
      handoffId,
      new Date().toISOString(),
    );
  }

  claimBuyerDelivery(orgId: string, handoffId: string): Promise<number> {
    return this.store.claimBuyerDelivery(
      orgId,
      handoffId,
      new Date().toISOString(),
    );
  }

  markBuyerDelivered(orgId: string, handoffId: string): Promise<number> {
    return this.store.markBuyerDelivered(
      orgId,
      handoffId,
      new Date().toISOString(),
    );
  }

  findStoreOwner(orgId: string, storeId: string): Promise<string | null> {
    return this.store.findStoreOwner(orgId, storeId);
  }

  async findStoreLocale(orgId: string, storeId: string) {
    await this.ready();
    return this.store.findStoreLocale(orgId, storeId);
  }

  async findOrderBuyerIdentity(
    orgId: string,
    orderId: string,
  ): Promise<string | null> {
    await this.ready();
    return this.store.findOrderBuyerIdentity(orgId, orderId);
  }

  getHandoffById(
    orgId: string,
    handoffId: string,
  ): Promise<SotuvchiHandoff | null> {
    return this.store.getHandoff(orgId, handoffId);
  }
}

export function createSotuvchiHandoffService(
  db: D1Database,
  catalog: SotuvchiCatalogService,
  botUsername: string,
  options: SotuvchiHandoffServiceOptions = {},
): SotuvchiHandoffService {
  return new SotuvchiHandoffService(db, catalog, botUsername, options);
}
