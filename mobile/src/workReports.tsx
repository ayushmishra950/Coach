import { View } from 'react-native';
import { C, P } from './ui';

export interface WorkReport {
  _id: string;
  teacherId: { _id: string; name: string } | string;
  date: string;
  classes: { batchId?: string; batchName?: string; topic: string }[];
  tests?: string; homework?: string; otherWork?: string; issues?: string;
  submittedAt: string; seenAt?: string | null; seenByName?: string; ownerComment?: string;
}
export interface WorkActivity {
  attendance: { batch: string; present: number; total: number }[];
  tests: { subject: string; topic?: string; batch?: string; mode?: string }[];
  materials: { title: string; kind: string }[];
  topics: { batch: string; title: string }[];
}
export const teacherOf = (r: WorkReport) => (typeof r.teacherId === 'object' && r.teacherId ? r.teacherId.name : 'Teacher');

/** "Recorded in the app that day" — attendance marked, syllabus ticked, tests, material. */
export function Activity({ a }: { a?: WorkActivity | null }) {
  if (!a) return null;
  const rows = [
    ...a.attendance.map((x) => `✅ Attendance: ${x.batch} (${x.present}/${x.total})`),
    ...a.topics.map((x) => `📘 Syllabus done: ${x.title} — ${x.batch}`),
    ...a.tests.map((x) => `📝 Test: ${x.subject}${x.topic ? ` · ${x.topic}` : ''}${x.batch ? ` — ${x.batch}` : ''}`),
    ...a.materials.map((x) => `📎 Material: ${x.title}`),
  ];
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 10, marginTop: 10 }}>
      <P small bold muted>RECORDED IN THE APP THAT DAY</P>
      {rows.length === 0 ? <P small muted>Nothing recorded for this day.</P> : rows.map((r, i) => <P key={i} small>{r}</P>)}
    </View>
  );
}
