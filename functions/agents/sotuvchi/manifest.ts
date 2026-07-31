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
  sotuvchiStatsRules,
  sotuvchiStatsTools,
} from './stats';
import {
  sotuvchiSellerCancelledRule,
  sotuvchiSellerStatusRule,
  sotuvchiStorefrontPendingRule,
} from './rules';
import { sotuvchiBuyerNavigationRule } from './experience';

export const sotuvchiAgentManifest: AgentManifest = {
  id: 'sotuvchi',
  version: '1.6.0',
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
    ...sotuvchiStatsTools,
  ],
  deterministicRules: [
    sotuvchiStorefrontPendingRule,
    sotuvchiSellerStatusRule,
    sotuvchiSellerCancelledRule,
    sotuvchiBuyerNavigationRule,
    ...sotuvchiCatalogRules,
    ...sotuvchiCheckoutRules,
    ...sotuvchiOrdersRules,
    ...sotuvchiHandoffRules,
    ...sotuvchiStatsRules,
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
