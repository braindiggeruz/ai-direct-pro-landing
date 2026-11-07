import type { Env } from '../../_types';
import { handleOutreachInboxIngest } from '../../platform/lead-radar/outreach-inbox-http';

export const onRequest:PagesFunction<Env>=async({request,env})=>handleOutreachInboxIngest(request,env);
