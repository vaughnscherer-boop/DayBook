import type { FixRequest, FixResponse } from '@/lib/fix-format';
import type { GradeRequest, GradeResponse } from '@/lib/grade-import-format';
import { callServer } from '@/lib/server-api';

/** Has Claude read a school site's grades page and match it to the class's items. */
export function readGradesOnServer(request: GradeRequest): Promise<GradeResponse> {
  return callServer<GradeResponse>('read-grades', '/api/read-grades', request);
}

/** Has Claude propose fixes for what the student says is wrong with a class. */
export function fixClassOnServer(request: FixRequest): Promise<FixResponse> {
  return callServer<FixResponse>('fix-class', '/api/fix-class', request);
}
