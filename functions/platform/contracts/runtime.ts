import type { Outbound } from './channel';
import type { Locale, OrgContext } from './context';
import type { Facts, FactSheet, FactValue } from './facts';
import type { WorkflowTrigger } from './workflow';

export type RuntimeMessage =
  | { kind: 'text'; text: string }
  | { kind: 'action'; actionId: string };

export interface RuntimeActiveWorkflow {
  instanceId: string;
  expectedVersion: number;
  idempotencyKey: string;
  trigger: WorkflowTrigger;
}

export interface RuntimeTurnInput {
  requestId: string;
  orgId: string;
  agentId: string;
  identityId?: string;
  contactId?: string;
  locale: Locale;
  message: RuntimeMessage;
  conversationRef?: string;
  activeWorkflow?: RuntimeActiveWorkflow;
}

export interface RuntimeExactClaim {
  key: string;
  value: FactValue;
}

export interface RuntimeResponseDraft {
  messages: readonly Outbound[];
  /** Template-derived exact claims. Grounding requires claim ⊆ Facts. */
  claims?: readonly RuntimeExactClaim[];
}

export type RuntimeReasonCode =
  | 'no_route'
  | 'ai_unavailable'
  | 'tool_failed'
  | 'grounding_failed'
  | 'workflow_unavailable'
  | 'rejected';

export type RuntimeStepResult =
  | {
      kind: 'answer';
      response: RuntimeResponseDraft;
      facts?: Facts;
    }
  | {
      kind: 'tool';
      toolName: string;
      input: unknown;
    }
  | {
      kind: 'handoff';
      reasonCode: RuntimeReasonCode;
    }
  | {
      kind: 'reject';
      reasonCode: RuntimeReasonCode;
    };

export interface RuntimeKnowledgeItem {
  id: string;
  status: string;
  payload: unknown;
}

export interface RuntimeKnowledgeSearchResult {
  item: RuntimeKnowledgeItem;
  score: number;
  matchedTokens: number;
}

export interface KnowledgeServicePort {
  searchItems(
    orgId: string,
    input: {
      agentId: string;
      kind: string;
      query: string;
      limit?: number;
    },
  ): Promise<readonly RuntimeKnowledgeSearchResult[]>;
}

export interface WorkflowServicePort {
  handleActive(
    org: OrgContext,
    workflow: RuntimeActiveWorkflow,
    message: RuntimeMessage,
  ): Promise<RuntimeStepResult | null>;
}

/**
 * Agent-neutral bridge for trusted product-domain operations. Manifests still
 * expose a closed tool list; tools choose both agentId and operation, while
 * user input can provide neither tenant authority nor an arbitrary operation.
 */
export interface AgentDomainServicePort {
  execute(input: {
    agentId: string;
    operation: string;
    org: OrgContext;
    input: unknown;
  }): Promise<Readonly<Record<string, FactValue>>>;
}

export interface RuntimeServices {
  knowledge: KnowledgeServicePort;
  workflow?: WorkflowServicePort;
  agentDomain?: AgentDomainServicePort;
}

export interface ToolContext {
  org: OrgContext;
  requestId: string;
  locale: Locale;
  services: RuntimeServices;
}

export interface RuntimeRuleContext {
  org: OrgContext;
  agentId: string;
  services: RuntimeServices;
}

export interface DeterministicRule {
  id: string;
  /** Lower values run first. Priorities must be unique within one manifest. */
  priority: number;
  match(input: RuntimeTurnInput): boolean;
  execute(
    context: RuntimeRuleContext,
    input: RuntimeTurnInput,
  ): Promise<RuntimeStepResult>;
}

export type ToolResponseTemplate =
  | {
      /** One strict template per supported locale; placeholders reference facts. */
      text: Readonly<Partial<Record<Locale, string>>>;
      compose?: never;
    }
  | {
      /**
       * Trusted deterministic composer for channel-neutral structured output.
       * Runtime validates and grounds the returned draft before delivery.
       */
      compose(
        facts: FactSheet,
        locale: Locale,
      ): RuntimeResponseDraft;
      text?: never;
    };

export interface ToolExecutionSummary {
  toolName: string;
  status: 'succeeded' | 'failed';
  code?: 'input_rejected' | 'execution_failed' | 'facts_rejected';
}

export type GroundingResult =
  | { status: 'passed' }
  | { status: 'not_required' }
  | {
      status: 'failed';
      reasonCode:
        | 'invalid_facts'
        | 'unsupported_claim'
        | 'unsupported_number';
    };

export interface RuntimeTurnResult {
  status: 'answered' | 'handoff_required' | 'rejected';
  messages: readonly Outbound[];
  facts: Facts;
  toolExecutions: readonly ToolExecutionSummary[];
  grounding: GroundingResult;
  reasonCode?: RuntimeReasonCode;
}
