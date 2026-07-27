import type { IdentityService } from '../../platform/identity';

export interface TelegramIdentityResolution {
  identityId: string;
}

export interface TelegramIdentityPort {
  resolveTelegramIdentity(
    telegramExternalId: string,
  ): Promise<TelegramIdentityResolution>;
}

export function createTelegramIdentityPort(
  identityService: Pick<IdentityService, 'getOrCreateIdentity'>,
): TelegramIdentityPort {
  return {
    async resolveTelegramIdentity(telegramExternalId) {
      const resolution = await identityService.getOrCreateIdentity(
        'telegram',
        telegramExternalId,
      );
      return { identityId: resolution.identity.id };
    },
  };
}
