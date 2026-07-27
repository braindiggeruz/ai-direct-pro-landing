import {
  eraseWorkflowDefinition,
  type AgentManifest,
} from '../../platform/contracts';
import { sotuvchiOnboardingWorkflow } from './onboarding/workflow';
import {
  sotuvchiSellerCancelledRule,
  sotuvchiSellerStatusRule,
  sotuvchiStorefrontPendingRule,
} from './rules';

export const sotuvchiAgentManifest: AgentManifest = {
  id: 'sotuvchi',
  version: '1.0.0',
  locales: ['ru', 'uz'],
  capabilities: ['store.onboarding'],
  tools: [],
  deterministicRules: [
    sotuvchiStorefrontPendingRule,
    sotuvchiSellerStatusRule,
    sotuvchiSellerCancelledRule,
  ],
  workflows: [eraseWorkflowDefinition(sotuvchiOnboardingWorkflow)],
  policies: {
    grounding: 'strict',
    aiSelection: 'disabled',
  },
};
