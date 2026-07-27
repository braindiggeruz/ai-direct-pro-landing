// Barrel for platform contracts — the ONLY import surface agents/ and
// channels/ are allowed to use from the platform (enforced by
// scripts/check-agent-boundaries.ts). Types only: importing this module has
// no runtime side effects.
export type { Locale, OrgContext } from './context';
export type { Facts, FactValue, FactSheet } from './facts';
export type {
  RuntimeSchema,
  Tool,
  ToolDefinition,
  ToolInputSchema,
  UnknownTool,
} from './tool';
export { eraseTool } from './tool';
export type {
  AgentCapability,
  AgentManifest,
  AgentPolicies,
} from './agent';
export type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelIdentityRef,
  Inbound,
  InboundMessage,
  Outbound,
  OutboundChoice,
} from './channel';
export type { EventScalar, EventValue, PiiSafePayload, PlatformEvent } from './events';
export type {
  WorkflowActionRef,
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowGuard,
  WorkflowGuardTrigger,
  WorkflowJsonValue,
  WorkflowPayloadReducer,
  WorkflowPayloadSchema,
  WorkflowStateDefinition,
  WorkflowTransition,
  WorkflowTrigger,
} from './workflow';
export { eraseWorkflowDefinition } from './workflow';
export type {
  DeterministicRule,
  GroundingResult,
  KnowledgeServicePort,
  RuntimeActiveWorkflow,
  RuntimeExactClaim,
  RuntimeKnowledgeItem,
  RuntimeKnowledgeSearchResult,
  RuntimeMessage,
  RuntimeReasonCode,
  RuntimeResponseDraft,
  RuntimeRuleContext,
  RuntimeServices,
  RuntimeStepResult,
  RuntimeTurnInput,
  RuntimeTurnResult,
  ToolContext,
  ToolExecutionSummary,
  ToolResponseTemplate,
  WorkflowServicePort,
} from './runtime';
