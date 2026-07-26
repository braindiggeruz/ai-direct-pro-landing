// Agent-space types: re-export of the platform contract surface that agent
// authors need. Agents import from here (or platform/contracts directly);
// they may NOT import channels/* or platform implementation modules.
export type {
  AgentCapability,
  AgentManifest,
  FactSheet,
  FactValue,
  Locale,
  OrgContext,
  Tool,
  ToolInputSchema,
  UnknownTool,
  WorkflowDefinition,
} from '../platform/contracts';
export { eraseTool } from '../platform/contracts';
