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
  sotuvchiBuyerRules,
  sotuvchiBuyerTools,
} from './buyer';
import {
  sotuvchiSellerCancelledRule,
  sotuvchiSellerStatusRule,
  sotuvchiStorefrontPendingRule,
} from './rules';

export const sotuvchiAgentManifest: AgentManifest = {
  id: 'sotuvchi',
  version: '1.2.0',
  locales: ['ru', 'uz'],
  capabilities: ['store.onboarding', 'store.catalog'],
  tools: [...sotuvchiCatalogTools, ...sotuvchiBuyerTools],
  deterministicRules: [
    sotuvchiStorefrontPendingRule,
    sotuvchiSellerStatusRule,
    sotuvchiSellerCancelledRule,
    ...sotuvchiCatalogRules,
    ...sotuvchiBuyerRules,
  ],
  workflows: [eraseWorkflowDefinition(sotuvchiOnboardingWorkflow)],
  policies: {
    grounding: 'strict',
    aiSelection: 'disabled',
  },
};
