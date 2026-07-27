import type { AgentManifest } from '../contracts';
import {
  AgentNotFoundError,
  DuplicateAgentIdError,
} from './errors';
import { validateAgentManifest } from './manifest';
import type { AgentRegistryPort } from './types';

export class AgentRegistry implements AgentRegistryPort {
  private readonly manifests = new Map<string, AgentManifest>();

  constructor(initial: readonly AgentManifest[] = []) {
    for (const manifest of initial) this.register(manifest);
  }

  register(manifest: AgentManifest): AgentManifest {
    const validated = validateAgentManifest(manifest);
    if (this.manifests.has(validated.id)) throw new DuplicateAgentIdError();
    this.manifests.set(validated.id, validated);
    return validated;
  }

  find(agentId: string): AgentManifest | undefined {
    return this.manifests.get(agentId);
  }

  get(agentId: string): AgentManifest {
    const manifest = this.find(agentId);
    if (!manifest) throw new AgentNotFoundError();
    return manifest;
  }

  list(): readonly AgentManifest[] {
    return [...this.manifests.values()]
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  clearForTests(): void {
    this.manifests.clear();
  }
}

export function createAgentRegistry(
  initial: readonly AgentManifest[] = [],
): AgentRegistry {
  return new AgentRegistry(initial);
}
