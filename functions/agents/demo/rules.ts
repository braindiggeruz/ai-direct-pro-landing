import type {
  DeterministicRule,
  RuntimeTurnInput,
} from '../../platform/contracts';

const ECHO = /^echo:\s*(.+)$/isu;

function echoValue(input: RuntimeTurnInput): string | null {
  if (input.message.kind !== 'text') return null;
  return ECHO.exec(input.message.text)?.[1]?.trim() || null;
}

export const demoEchoRule: DeterministicRule = {
  id: 'echo',
  priority: 10,
  match(input) {
    return echoValue(input) !== null;
  },
  async execute(_context, input) {
    const value = echoValue(input);
    if (!value) return { kind: 'reject', reasonCode: 'rejected' };
    return {
      kind: 'answer',
      response: {
        messages: [{ text: value }],
        claims: [],
      },
      facts: [],
    };
  },
};

export const demoKnowledgeRule: DeterministicRule = {
  id: 'knowledge-question',
  priority: 20,
  match(input) {
    return input.message.kind === 'text';
  },
  async execute(_context, input) {
    if (input.message.kind !== 'text') {
      return { kind: 'reject', reasonCode: 'rejected' };
    }
    return {
      kind: 'tool',
      toolName: 'knowledge.lookup',
      input: { query: input.message.text },
    };
  },
};
