import type { BreakdownRequest, BreakdownResponse } from '@/lib/breakdown-format';
import { callServer } from '@/lib/server-api';

/**
 * Has Claude split an assignment into dated steps. The hosted `break-down` function in Supabase
 * (signed-in accounts); EXPO_PUBLIC_IMPORT_API_URL, or the local `npm run server` when Supabase
 * isn't set up, stand in while developing.
 */
export function breakDownOnServer(request: BreakdownRequest): Promise<BreakdownResponse> {
  return callServer<BreakdownResponse>('break-down', '/api/break-down', request);
}
