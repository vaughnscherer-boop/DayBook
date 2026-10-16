import type { AskRequest, AskResponse } from '@/lib/ask-format';
import { callServer } from '@/lib/server-api';

/**
 * Asks Claude about the schedule. The hosted `ask-schedule` function in Supabase (signed-in
 * accounts); the local `npm run server` stands in when Supabase isn't set up.
 */
export function askDaybook(request: AskRequest): Promise<AskResponse> {
  return callServer<AskResponse>('ask-schedule', '/api/ask', request);
}
