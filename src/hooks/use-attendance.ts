import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';

import { listAttendance, type Attendance } from '@/db/attendance';
import { onDataChanged } from '@/lib/data-events';

/** Attendance records, reloaded when the screen is shown and when data changes. */
export function useAttendance() {
  const db = useSQLiteContext();
  const [records, setRecords] = useState<Attendance[]>([]);
  const reload = useCallback(() => {
    listAttendance(db).then(setRecords);
  }, [db]);
  useFocusEffect(reload);
  useEffect(() => onDataChanged(reload), [reload]);
  return records;
}
