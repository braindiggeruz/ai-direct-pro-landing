// Platform contract: AgentManifest — the declaration that IS an agent.
// A future agent (Sotuvchi, Clinic, Dentist…) ships a manifest plus locale
// packs and knowledge schemas; it never implements runtime plumbing.
import type { Locale } from './context';
import type { DeterministicRule } from './runtime';
import type { ToolDefinition } from './tool';
import type { WorkflowDefinition } from './workflow';

/** Closed capability list — extended only by a platform stage, never ad-hoc. */
export type AgentCapability =
  | 'store.onboarding'
  | 'knowledge.query'
  | 'commerce.order'
  | 'scheduling.book'
  | 'handoff';

export interface AgentPolicies {
  grounding: 'strict';
  aiSelection?: 'disabled' | 'closed-list';
}

export interface AgentManifest {
  /** Stable unique id, kebab-case (registry enforces uniqueness). */
  id: string;
  version: string;
  locales: readonly Locale[];
  capabilities: readonly AgentCapability[];
  tools: readonly ToolDefinition[];
  deterministicRules?: readonly DeterministicRule[];
  policies: AgentPolicies;
  /** Declarative processes executed by the platform FSM (P1.2+). */
  workflows?: readonly WorkflowDefinition[];
  /** Knowledge collection kinds this agent reads (engine arrives in P1.1). */
  knowledgeKinds?: readonly string[];
}
