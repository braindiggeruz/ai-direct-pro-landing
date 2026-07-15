// Provider selection / Auto-Free fallback.
//
//   Auto-Free (default):
//     1. Try Puter (browser, no API key)
//     2. Fall back to Mock (always available, deterministic)
//
//   Manual:
//     - 'puter' / 'mock'  (admin can force from the UI dropdown)
//
// Gemini Free is implemented at the backend level only; this client picker
// never tries to call Gemini from the browser.

import { MockProvider } from './mock';
import { PuterProvider } from './puter';
import type { AiProviderClient } from './types';
import type { AiProvider } from '../../../shared/ai-seo';

const map: Record<Exclude<AiProvider, 'gemini'>, AiProviderClient> = {
  puter: PuterProvider,
  mock: MockProvider,
};

export type ProviderChoice = 'auto' | 'puter' | 'mock';

export async function pickProvider(choice: ProviderChoice): Promise<AiProviderClient> {
  if (choice === 'puter') return PuterProvider;
  if (choice === 'mock')  return MockProvider;
  // auto
  const puterOk = await PuterProvider.isAvailable();
  return puterOk ? PuterProvider : MockProvider;
}

export const providers = map;
export { PuterProvider, MockProvider };
