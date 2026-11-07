import type { Env } from '../../../_types';
import { handleInternalDocuments } from '../../../platform/documents/http';
export const onRequest: PagesFunction<Env> = async ({ request, env }) => handleInternalDocuments(request, env);
