import {
  eraseWorkflowDefinition,
  type AgentManifest,
} from '../../platform/contracts';
import { sotuvchiOnboardingWorkflow } from './onboarding/workflow';
import {
  sotuvchiCatalogRules,
  sotuvchiCatalogTools,
} from './catalog';
import {
  sotuvchiSellerCancelledRule,
  sotuvchiSellerStatusRule,
  sotuvchiStorefrontPendingRule,
} from './rules';

export const sotuvchiAgentManifest: AgentManifest = {
  id: 'sotuvchi',
  version: '1.1.0',
  locales: ['ru', 'uz'],
  capabilities: ['store.onboarding', 'store.catalog'],
  tools: sotuvchiCatalogTools,
  deterministicRules: [
    sotuvchiStorefrontPendingRule,
    sotuvchiSellerStatusRule,
    sotuvchiSellerCancelledRule,
    ...sotuvchiCatalogRules,
  ],
  workflows: [eraseWorkflowDefinition(sotuvchiOnboardingWorkflow)],
  policies: {
    grounding: 'strict',
    aiSelection: 'disabled',
  },
};
