// Agent registry — the single place where agents plug into the platform.
// Adding a production agent = one registerAgent(manifest) call from this
// module (a future stage). P0.1 registers nothing: no product agents exist
// yet, and demo manifests live only inside tests as fixtures.
//
// No runtime side effects on import beyond allocating the empty Map; no I/O.
import type { AgentManifest } from '../platform/contracts';

const agents = new Map<string, AgentManifest>();

export class DuplicateAgentIdError extends Error {
  constructor(public readonly agentId: string) {
    super(`duplicate agent id: ${agentId}`);
    this.name = 'DuplicateAgentIdError';
  }
}

export function registerAgent(manifest: AgentManifest): void {
  if (agents.has(manifest.id)) throw new DuplicateAgentIdError(manifest.id);
  agents.set(manifest.id, manifest);
}

export function getAgent(id: string): AgentManifest | undefined {
  return agents.get(id);
}

export function listAgents(): readonly AgentManifest[] {
  return [...agents.values()];
}

/** Test-only helper: registries must be resettable between test cases. */
export function clearAgentsForTests(): void {
  agents.clear();
}
