import type { AgentManifest, RuntimeServices } from '../contracts';
import type { AiFacade, AiPolicySelector } from '../ai';

export interface AgentRegistryPort {
  get(agentId: string): AgentManifest;
}

export interface RuntimeAiConfiguration {
  facade: AiFacade;
  policy: AiPolicySelector;
}

export interface CreateAgentRuntimeInput {
  registry: AgentRegistryPort;
  services: RuntimeServices;
  ai?: RuntimeAiConfiguration;
}

export interface AiToolSelection {
  tool: string | null;
  arguments: unknown;
}
