import {
  eraseTool,
  type AgentDomainServicePort,
  type RuntimeSchema,
  type Tool,
} from '../../../platform/contracts';
import { StatsAuthorizationError, StatsValidationError } from './errors';
import {
  projectStatsFacts,
  type StatsFactValues,
  type StatsView,
} from './facts';
import { composeDashboardResponse, composeStatsResponse } from './responses';
import type { SotuvchiStatsService } from './service';

export const SELLER_STATS_TOOL = 'seller.stats.get';
export const SELLER_DASHBOARD_TOOL = 'seller.dashboard.get';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** No parameters at all: the window, tenant and store are server-side. */
const emptySchema: RuntimeSchema<Record<string, never>> = {
  parse(value) {
    if (!isPlainObject(value) || Object.keys(value).length !== 0) {
      throw new StatsValidationError();
    }
    return {};
  },
};

function statsTool(): Tool<Record<string, never>, StatsFactValues> {
  return {
    name: SELLER_STATS_TOOL,
    description: 'Report store counters of the authenticated owner store.',
    inputSchema: emptySchema,
    async run(context, input) {
      const domain = context.services.agentDomain;
      if (!domain) throw new StatsAuthorizationError();
      return domain.execute({
        agentId: 'sotuvchi',
        operation: SELLER_STATS_TOOL,
        org: context.org,
        input,
      });
    },
    facts(values) {
      return { toolName: SELLER_STATS_TOOL, values };
    },
    response: { compose: composeStatsResponse },
  };
}

function dashboardTool(): Tool<Record<string, never>, StatsFactValues> {
  return {
    name: SELLER_DASHBOARD_TOOL,
    description: 'Show exact store counters for the authenticated owner.',
    inputSchema: emptySchema,
    async run(context, input) {
      const domain = context.services.agentDomain;
      if (!domain) throw new StatsAuthorizationError();
      return domain.execute({
        agentId: 'sotuvchi',
        operation: SELLER_DASHBOARD_TOOL,
        org: context.org,
        input,
      });
    },
    facts(values) {
      return { toolName: SELLER_DASHBOARD_TOOL, values };
    },
    response: { compose: composeDashboardResponse },
  };
}

export const sotuvchiStatsTools = [
  eraseTool(statsTool()),
  eraseTool(dashboardTool()),
] as const;

const STATS_OPERATIONS = new Set(sotuvchiStatsTools.map((tool) => tool.name));

export function createSotuvchiStatsDomainPort(
  service: SotuvchiStatsService,
): AgentDomainServicePort {
  return {
    async execute(call) {
      if (call.agentId !== 'sotuvchi' || !STATS_OPERATIONS.has(call.operation)) {
        throw new StatsAuthorizationError();
      }
      emptySchema.parse(call.input);
      const view: StatsView = call.operation === SELLER_DASHBOARD_TOOL
        ? 'seller_dashboard'
        : 'seller_stats';
      return projectStatsFacts(await service.getStats(call.org), view);
    },
  };
}

/** Stats operations first; every other operation keeps its port. */
export function withSotuvchiStatsDomain(
  base: AgentDomainServicePort,
  stats: AgentDomainServicePort,
): AgentDomainServicePort {
  return {
    execute(call) {
      return STATS_OPERATIONS.has(call.operation)
        ? stats.execute(call)
        : base.execute(call);
    },
  };
}
