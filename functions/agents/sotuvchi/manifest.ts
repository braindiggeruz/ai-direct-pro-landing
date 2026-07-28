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
  sotuvchiHandoffRules,
  sotuvchiHandoffTools,
  sotuvchiSellerReplyWorkflow,
} from './handoff';
import {
  sotuvchiSellerCancelledRule,
  sotuvchiSellerStatusRule,
  sotuvchiStorefrontPendingRule,
} from './rules';

export const sotuvchiAgentManifest: AgentManifest = {
  id: 'sotuvchi',
  version: '1.5.0',
  locales: ['ru', 'uz'],
  capabilities: [
    'store.onboarding',
    'store.catalog',
    'commerce.order',
    'handoff',
  ],
  tools: [
    ...sotuvchiCatalogTools,
    ...sotuvchiBuyerTools,
    ...sotuvchiCheckoutTools,
    ...sotuvchiOrdersTools,
    ...sotuvchiHandoffTools,
  ],
  deterministicRules: [
    sotuvchiStorefrontPendingRule,
    sotuvchiSellerStatusRule,
    sotuvchiSellerCancelledRule,
    ...sotuvchiCatalogRules,
    ...sotuvchiCheckoutRules,
    ...sotuvchiOrdersRules,
    ...sotuvchiHandoffRules,
    ...sotuvchiBuyerRules,
  ],
  workflows: [
    eraseWorkflowDefinition(sotuvchiOnboardingWorkflow),
    eraseWorkflowDefinition(sotuvchiCheckoutWorkflow),
    eraseWorkflowDefinition(sotuvchiSellerReplyWorkflow),
  ],
  policies: {
    grounding: 'strict',
    aiSelection: 'disabled',
  },
};
