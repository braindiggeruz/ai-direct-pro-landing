import {
  eraseTool,
  type FactSheet,
  type Tool,
} from '../../platform/contracts';
import { demoKnowledgeResponse } from './i18n';

interface KnowledgeLookupInput {
  query: string;
}

interface KnowledgeLookupOutput {
  id: string;
  name: string;
  status: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const knowledgeLookup: Tool<KnowledgeLookupInput, KnowledgeLookupOutput> = {
  name: 'knowledge.lookup',
  description: 'Find one demo knowledge item by its name or search key.',
  inputSchema: {
    parse(value: unknown): KnowledgeLookupInput {
      if (
        !isPlainObject(value)
        || Object.keys(value).length !== 1
        || typeof value.query !== 'string'
        || value.query.trim().length === 0
        || value.query.length > 256
      ) {
        throw new Error('invalid input');
      }
      return { query: value.query.trim() };
    },
  },
  async run(context, input) {
    const results = await context.services.knowledge.searchItems(
      context.org.orgId,
      {
        agentId: 'demo',
        kind: 'demo-item',
        query: input.query,
        limit: 1,
      },
    );
    const first = results[0]?.item;
    if (!first || !isPlainObject(first.payload)) throw new Error('not found');
    const { name, status } = first.payload;
    if (
      typeof name !== 'string'
      || name.length === 0
      || name.length > 256
      || typeof status !== 'string'
      || status.length === 0
      || status.length > 64
    ) {
      throw new Error('invalid result');
    }
    return { id: first.id, name, status };
  },
  facts(output): FactSheet {
    return {
      toolName: 'knowledge.lookup',
      values: {
        'knowledge.item.id': output.id,
        'knowledge.item.name': output.name,
        'knowledge.item.status': output.status,
      },
    };
  },
  response: demoKnowledgeResponse,
};

export const demoKnowledgeLookupTool = eraseTool(knowledgeLookup);
