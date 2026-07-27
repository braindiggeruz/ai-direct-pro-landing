import type {
  AgentManifest,
  Facts,
  GroundingResult,
  OrgContext,
  RuntimeRuleContext,
  RuntimeStepResult,
  RuntimeTurnResult,
  ToolExecutionSummary,
} from '../contracts';
import {
  AgentGroundingError,
  AgentRoutingError,
  AgentRuntimeRejectedError,
  AgentToolExecutionError,
  AgentToolInputError,
  AgentToolNotFoundError,
} from './errors';
import { groundResponse } from './grounding';
import { composeToolResponse } from './response';
import {
  selectAiTool,
  selectDeterministicStep,
  validateRuntimeTurnInput,
} from './routing';
import { executeManifestTool } from './tools';
import type { CreateAgentRuntimeInput } from './types';

const NOT_REQUIRED: GroundingResult = { status: 'not_required' };

function emptyResult(
  status: 'handoff_required' | 'rejected',
  reasonCode: RuntimeTurnResult['reasonCode'],
  toolExecutions: readonly ToolExecutionSummary[] = [],
): RuntimeTurnResult {
  return {
    status,
    messages: [],
    facts: [],
    toolExecutions,
    grounding: NOT_REQUIRED,
    reasonCode,
  };
}

function groundedResult(
  step: Extract<RuntimeStepResult, { kind: 'answer' }>,
): RuntimeTurnResult {
  const facts = step.facts ?? [];
  const grounding = groundResponse(step.response, facts);
  if (grounding.status === 'failed') {
    return {
      status: 'rejected',
      messages: [],
      facts,
      toolExecutions: [],
      grounding,
      reasonCode: 'grounding_failed',
    };
  }
  return {
    status: 'answered',
    messages: step.response.messages,
    facts,
    toolExecutions: [],
    grounding,
  };
}

function toolFailureSummary(
  toolName: string,
  error: unknown,
): ToolExecutionSummary {
  if (error instanceof AgentToolInputError) {
    return { toolName, status: 'failed', code: 'input_rejected' };
  }
  if (error instanceof AgentGroundingError) {
    return { toolName, status: 'failed', code: 'facts_rejected' };
  }
  return { toolName, status: 'failed', code: 'execution_failed' };
}

export class AgentRuntime {
  constructor(private readonly input: CreateAgentRuntimeInput) {}

  async run(rawInput: unknown): Promise<RuntimeTurnResult> {
    const turn = validateRuntimeTurnInput(rawInput);
    const manifest = this.input.registry.get(turn.agentId);
    if (!manifest.locales.includes(turn.locale)) {
      throw new AgentRuntimeRejectedError();
    }
    const org: OrgContext = {
      orgId: turn.orgId,
      actorId: turn.contactId ?? turn.identityId,
      requestId: turn.requestId,
      locale: turn.locale,
    };
    const ruleContext: RuntimeRuleContext = {
      org,
      agentId: manifest.id,
      services: this.input.services,
    };

    let step: RuntimeStepResult | null = null;
    if (turn.activeWorkflow) {
      const workflow = this.input.services.workflow;
      if (!workflow) {
        return emptyResult('rejected', 'workflow_unavailable');
      }
      try {
        step = await workflow.handleActive(
          org,
          turn.activeWorkflow,
          turn.message,
        );
      } catch {
        return emptyResult('rejected', 'workflow_unavailable');
      }
    }
    if (!step) {
      step = await selectDeterministicStep(manifest, ruleContext, turn);
    }
    if (
      !step
      && (manifest.policies.aiSelection ?? 'disabled') === 'closed-list'
    ) {
      if (!this.input.ai) {
        return emptyResult('handoff_required', 'ai_unavailable');
      }
      try {
        const selection = await selectAiTool(manifest, turn, this.input.ai);
        step = selection.tool === null
          ? { kind: 'handoff', reasonCode: 'no_route' }
          : {
              kind: 'tool',
              toolName: selection.tool,
              input: selection.arguments,
            };
      } catch {
        return emptyResult('handoff_required', 'ai_unavailable');
      }
    }
    if (!step) return emptyResult('handoff_required', 'no_route');
    return this.executeStep(manifest, org, step);
  }

  private async executeStep(
    manifest: AgentManifest,
    org: OrgContext,
    step: RuntimeStepResult,
  ): Promise<RuntimeTurnResult> {
    if (step.kind === 'handoff') {
      return emptyResult('handoff_required', step.reasonCode);
    }
    if (step.kind === 'reject') {
      return emptyResult('rejected', step.reasonCode);
    }
    if (step.kind === 'answer') return groundedResult(step);

    try {
      const executed = await executeManifestTool(
        manifest,
        step.toolName,
        step.input,
        {
          org,
          requestId: org.requestId,
          locale: org.locale,
          services: this.input.services,
        },
      );
      const facts: Facts = [executed.facts];
      const response = composeToolResponse(
        executed.tool,
        executed.facts,
        org.locale,
      );
      const grounding = groundResponse(response, facts);
      const summary: ToolExecutionSummary = {
        toolName: executed.tool.name,
        status: 'succeeded',
      };
      if (grounding.status === 'failed') {
        return {
          status: 'rejected',
          messages: [],
          facts,
          toolExecutions: [summary],
          grounding,
          reasonCode: 'grounding_failed',
        };
      }
      return {
        status: 'answered',
        messages: response.messages,
        facts,
        toolExecutions: [summary],
        grounding,
      };
    } catch (error) {
      if (
        error instanceof AgentToolNotFoundError
        || error instanceof AgentToolInputError
        || error instanceof AgentToolExecutionError
        || error instanceof AgentGroundingError
      ) {
        return emptyResult(
          'rejected',
          error instanceof AgentGroundingError
            ? 'grounding_failed'
            : 'tool_failed',
          [toolFailureSummary(step.toolName, error)],
        );
      }
      throw new AgentRoutingError();
    }
  }
}

export function createAgentRuntime(
  input: CreateAgentRuntimeInput,
): AgentRuntime {
  return new AgentRuntime(input);
}
