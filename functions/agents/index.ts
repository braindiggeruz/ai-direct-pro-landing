// Agents-space barrel. Production agent registrations will be added here in
// their own stages (e.g. P2.x registers sotuvchi). Keep free of onRequest*
// exports — see boundary checker.
export * from './types';
export {
  DuplicateAgentIdError,
  getAgent,
  listAgents,
  requireAgent,
  registerAgent,
} from './registry';
