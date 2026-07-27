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
  sotuvchiCheckoutRules,
  sotuvchiCheckoutTools,
  sotuvchiCheckoutWorkflow,
} from './checkout';
import {
  sotuvchiOrdersRules,
  sotuvchiOrdersTools,
} from './orders';
import {
  sotuvchiSellerCancelledRule,
  sotuvchiSellerStatusRule,
  sotuvchiStorefrontPendingRule,
} from './rules';

export const sotuvchiAgentManifest: AgentManifest = {
  id: 'sotuvchi',
  version: '1.4.0',
  locales: ['ru', 'uz'],
  capabilities: ['store.onboarding', 'store.catalog', 'commerce.order'],
  tools: [
    ...sotuvchiCatalogTools,
    ...sotuvchiBuyerTools,
    ...sotuvchiCheckoutTools,
    ...sotuvchiOrdersTools,
  ],
  deterministicRules: [
    sotuvchiStorefrontPendingRule,
    sotuvchiSellerStatusRule,
    sotuvchiSellerCancelledRule,
    ...sotuvchiCatalogRules,
    ...sotuvchiCheckoutRules,
    ...sotuvchiOrdersRules,
    ...sotuvchiBuyerRules,
  ],
  workflows: [
    eraseWorkflowDefinition(sotuvchiOnboardingWorkflow),
    eraseWorkflowDefinition(sotuvchiCheckoutWorkflow),
  ],
  policies: {
    grounding: 'strict',
    aiSelection: 'disabled',
  },
};
