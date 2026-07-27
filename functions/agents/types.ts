// Agent-space types: re-export of the platform contract surface that agent
// authors need. Agents import from here (or platform/contracts directly);
// they may NOT import channels/* or platform implementation modules.
export type {
  AgentCapability,
  AgentManifest,
  AgentPolicies,
  DeterministicRule,
  Facts,
  FactSheet,
  FactValue,
  KnowledgeServicePort,
  Locale,
  OrgContext,
  RuntimeResponseDraft,
  RuntimeRuleContext,
  RuntimeServices,
  RuntimeStepResult,
  RuntimeTurnInput,
  ToolContext,
  Tool,
  ToolDefinition,
  ToolInputSchema,
  ToolResponseTemplate,
  UnknownTool,
  WorkflowDefinition,
} from '../platform/contracts';
export { eraseTool } from '../platform/contracts';
