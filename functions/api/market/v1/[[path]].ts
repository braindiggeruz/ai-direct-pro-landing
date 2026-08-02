import type { Env } from '../../../_types';
import { handleMarketRequest } from '../../../market/router';

export const onRequest: PagesFunction<Env> = ({ request, env, waitUntil }) =>
  handleMarketRequest({ request, env, waitUntil });
