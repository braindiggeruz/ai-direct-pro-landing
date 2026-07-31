import type { Locale } from '../../platform/contracts';

const BOT_USERNAME = /^[a-z][a-z0-9_]{4,31}$/;
const ROUTE_CODE = /^[a-z0-9](?:[a-z0-9-]{0,31})$/;
const START_PAYLOAD = /^agent_([a-z0-9](?:[a-z0-9-]{0,31}))$/;
const MAX_DEEP_LINK_LENGTH = 256;

export type StartPayloadResult =
  | { status: 'none' }
  | { status: 'valid'; payload: string; routeCode: string }
  | { status: 'invalid'; code: 'invalid_start_payload' };

export type StartCommandResult =
  | StartPayloadResult
  | { status: 'missing' };

export interface TelegramAgentContext {
  orgId: string;
  agentId: string;
  locale: Locale;
  /** Trusted server-side action replacing the generic /start action. */
  entryActionId?: string;
  /** Trusted active workflow resolved outside the user-controlled payload. */
  workflow?: {
    instanceId: string;
    expectedVersion: number;
  };
}

export interface TelegramAgentContextInput {
  botUsername: string;
  startPayload?: string;
  /** True only for an accepted Telegram /start command, never inferred from text. */
  isStartCommand?: boolean;
  /** Bounded normalized action, used only for trusted session preferences. */
  actionId?: string;
  telegramIdentityId: string;
  locale: Locale;
  idempotencyKey: string;
}

export interface TelegramAgentContextResolver {
  resolve(
    input: TelegramAgentContextInput,
  ): Promise<TelegramAgentContext | null>;
}

export interface StaticTelegramAgentMapping {
  botUsername: string;
  routeCode: string;
  orgId: string;
  agentId: string;
  locale?: Locale;
  /** Optional trusted identity allowlist for non-/start offline/demo turns. */
  allowedIdentityIds?: readonly string[];
}

interface ValidatedMapping extends StaticTelegramAgentMapping {
  botUsername: string;
  routeCode: string;
  allowedIdentityIds: readonly string[];
}

function isSafeIdentifier(value: string, maxLength = 120): boolean {
  return (
    typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && /^[a-z0-9][a-z0-9._-]*$/.test(value)
  );
}

export function normalizeTelegramBotUsername(username: string): string {
  const normalized = username.trim().replace(/^@/, '').toLowerCase();
  if (!BOT_USERNAME.test(normalized)) {
    throw new Error('telegram bot username rejected');
  }
  return normalized;
}

export function parseTelegramStartPayload(
  value: unknown,
): StartPayloadResult {
  if (value === undefined) return { status: 'none' };
  if (typeof value !== 'string' || value.length > 64) {
    return { status: 'invalid', code: 'invalid_start_payload' };
  }
  const match = START_PAYLOAD.exec(value);
  if (!match) return { status: 'invalid', code: 'invalid_start_payload' };
  return {
    status: 'valid',
    payload: value,
    routeCode: match[1],
  };
}

export function parseTelegramStartCommand(text: string): StartCommandResult {
  const match = /^\/start(?:@[a-z][a-z0-9_]{4,31})?(?:\s+(\S+))?\s*$/i
    .exec(text);
  if (!match) return { status: 'none' };
  if (match[1] === undefined) return { status: 'missing' };
  return parseTelegramStartPayload(match[1]);
}

export function parseTelegramDeepLink(
  value: string,
  expectedBotUsername: string,
): StartPayloadResult {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_DEEP_LINK_LENGTH
  ) {
    return { status: 'invalid', code: 'invalid_start_payload' };
  }
  try {
    const url = new URL(value);
    const expected = normalizeTelegramBotUsername(expectedBotUsername);
    const keys = [...url.searchParams.keys()];
    if (
      url.protocol !== 'https:'
      || url.hostname !== 't.me'
      || url.username
      || url.password
      || url.hash
      || url.pathname !== `/${expected}`
      || keys.length !== 1
      || keys[0] !== 'start'
    ) {
      return { status: 'invalid', code: 'invalid_start_payload' };
    }
    return parseTelegramStartPayload(url.searchParams.get('start') ?? undefined);
  } catch {
    return { status: 'invalid', code: 'invalid_start_payload' };
  }
}

function validateMapping(mapping: StaticTelegramAgentMapping): ValidatedMapping {
  const botUsername = normalizeTelegramBotUsername(mapping.botUsername);
  if (
    !ROUTE_CODE.test(mapping.routeCode)
    || !isSafeIdentifier(mapping.orgId)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapping.agentId)
    || (mapping.locale !== undefined
      && mapping.locale !== 'ru'
      && mapping.locale !== 'uz')
  ) {
    throw new Error('telegram agent mapping rejected');
  }
  const allowedIdentityIds = [...(mapping.allowedIdentityIds ?? [])];
  if (
    allowedIdentityIds.some((identityId) => !isSafeIdentifier(identityId))
    || new Set(allowedIdentityIds).size !== allowedIdentityIds.length
  ) {
    throw new Error('telegram agent mapping rejected');
  }
  return {
    ...mapping,
    botUsername,
    allowedIdentityIds,
  };
}

export function createStaticTelegramAgentContextResolver(
  input: readonly StaticTelegramAgentMapping[],
): TelegramAgentContextResolver {
  const mappings = input.map(validateMapping);
  const routeKeys = new Set<string>();
  for (const mapping of mappings) {
    const key = `${mapping.botUsername}:${mapping.routeCode}`;
    if (routeKeys.has(key)) throw new Error('telegram agent mapping rejected');
    routeKeys.add(key);
  }

  return {
    async resolve(contextInput) {
      let botUsername: string;
      try {
        botUsername = normalizeTelegramBotUsername(contextInput.botUsername);
      } catch {
        return null;
      }
      const parsed = parseTelegramStartPayload(contextInput.startPayload);
      let mapping: ValidatedMapping | undefined;
      if (parsed.status === 'valid') {
        mapping = mappings.find(
          (candidate) =>
            candidate.botUsername === botUsername
            && candidate.routeCode === parsed.routeCode,
        );
      } else if (parsed.status === 'none') {
        mapping = mappings.find(
          (candidate) =>
            candidate.botUsername === botUsername
            && candidate.allowedIdentityIds.includes(
              contextInput.telegramIdentityId,
            ),
        );
      }
      if (!mapping) return null;
      return {
        orgId: mapping.orgId,
        agentId: mapping.agentId,
        locale: mapping.locale ?? contextInput.locale,
      };
    },
  };
}
