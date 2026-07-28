export {
  ChannelAddressNotFoundError,
  ChannelAddressPersistenceError,
  ChannelAddressValidationError,
} from './errors';
export type { ChannelAddressValidationCode } from './errors';
export { ensureChannelAddressSchema } from './schema';
export {
  ChannelAddressService,
  createChannelAddressBindingPort,
  createChannelAddressService,
} from './service';
export type { ChannelAddressServiceOptions } from './service';
export {
  createChannelAddressStore,
  PLATFORM_CHANNEL_ADDRESSES_DDL,
  requireChannel,
  requireIdentityId,
  requireNamespace,
  requireThreadRef,
} from './store';
export type { ChannelAddressStore } from './store';
export { CHANNEL_ADDRESS_STATUSES } from './types';
export type {
  BindChannelAddressInput,
  ChannelAddress,
  ChannelAddressBindingPort,
  ChannelAddressKey,
  ChannelAddressStatus,
  ChannelDeliveryPort,
} from './types';
