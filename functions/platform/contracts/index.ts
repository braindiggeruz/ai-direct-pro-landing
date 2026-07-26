// Barrel for platform contracts — the ONLY import surface agents/ and
// channels/ are allowed to use from the platform (enforced by
// scripts/check-agent-boundaries.ts). Types only: importing this module has
// no runtime side effects.
export type { Locale, OrgContext } from './context';
export type { FactValue, FactSheet } from './facts';
export type { Tool, ToolInputSchema, UnknownTool } from './tool';
export { eraseTool } from './tool';
export type { AgentCapability, AgentManifest } from './agent';
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
  WorkflowDefinition,
  WorkflowStateDefinition,
  WorkflowTransition,
  WorkflowTrigger,
} from './workflow';
