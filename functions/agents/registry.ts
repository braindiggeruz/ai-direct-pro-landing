// The single production registration point. A production agent adds one
// registerAgent(manifest) call here; no filesystem discovery or dynamic code.
// P1.3 keeps it empty: the demo agent is offline-only.
import type { AgentManifest } from '../platform/contracts';
import {
  createAgentRegistry,
  DuplicateAgentIdError,
} from '../platform/runtime';
import { sotuvchiAgentManifest } from './sotuvchi';

const productionRegistry = createAgentRegistry([sotuvchiAgentManifest]);
export { DuplicateAgentIdError };

export function registerAgent(manifest: AgentManifest): void {
  productionRegistry.register(manifest);
}

export function getAgent(id: string): AgentManifest | undefined {
  return productionRegistry.find(id);
}

export function requireAgent(id: string): AgentManifest {
  return productionRegistry.get(id);
}

export function listAgents(): readonly AgentManifest[] {
  return productionRegistry.list();
}

/** Test-only helper: registries must be resettable between test cases. */
export function clearAgentsForTests(): void {
  productionRegistry.clearForTests();
}
