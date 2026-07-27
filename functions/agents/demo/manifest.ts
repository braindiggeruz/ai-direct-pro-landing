import type { AgentManifest } from '../../platform/contracts';
import { demoEchoRule, demoKnowledgeRule } from './rules';
import { demoKnowledgeLookupTool } from './tools';

export const demoAgentManifest: AgentManifest = {
  id: 'demo',
  version: '1.0.0',
  locales: ['ru', 'uz'],
  capabilities: ['knowledge.query'],
  tools: [demoKnowledgeLookupTool],
  deterministicRules: [demoEchoRule, demoKnowledgeRule],
  policies: {
    grounding: 'strict',
    aiSelection: 'disabled',
  },
  knowledgeKinds: ['demo-item'],
};
