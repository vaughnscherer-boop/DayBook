import type { SQLiteDatabase } from 'expo-sqlite';

import { addEventException } from '@/db/events';

export type AttendanceStatus = 'went' | 'skipped' | 'cancelled';
export type Attendance = { id: string; event_id: string; group_id: string | null; day: string; status: AttendanceStatus; updated_at: string };

export async function listAttendance(db: SQLiteDatabase): Promise<Attendance[]> {
  return db.getAllAsync<Attendance>('SELECT * FROM attendance');
}

/**
 * Records whether you went to one class meeting. "Cancelled" also takes that meeting off the
 * calendar, so it neither counts as an absence nor clutters the day.
 */
export async function setAttendance(
  db: SQLiteDatabase,
  meeting: { eventId: string; groupId: string | null; day: string },
  status: AttendanceStatus
) {
  await db.runAsync(
    `INSERT INTO attendance (id, event_id, group_id, day, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    `${meeting.eventId}|${meeting.day}`,
    meeting.eventId,
    meeting.groupId,
    meeting.day,
    status,
    new Date().toISOString()
  );
  if (status === 'cancelled') await addEventException(db, meeting.eventId, meeting.day);
}

export async function clearAttendance(db: SQLiteDatabase, eventId: string, day: string) {
  await db.runAsync('DELETE FROM attendance WHERE id = ?', `${eventId}|${day}`);
}

export async function setAbsenceLimit(db: SQLiteDatabase, groupId: string, limit: number | null) {
  await db.runAsync('UPDATE groups SET absence_limit = ?, updated_at = ? WHERE id = ?', limit, new Date().toISOString(), groupId);
}
