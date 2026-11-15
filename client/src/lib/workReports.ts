/** Teacher daily work report (GET /work-reports…). */
export interface WorkReport {
  _id: string;
  teacherId: { _id: string; name: string; subjects?: string[] } | string;
  date: string;
  classes: { batchId?: string; batchName?: string; topic: string }[];
  tests?: string;
  homework?: string;
  otherWork?: string;
  issues?: string;
  submittedAt: string;
  seenAt?: string | null;
  seenByName?: string;
  ownerComment?: string;
}

/** What the app recorded for the teacher that day (attendance, tests, material, syllabus ticks). */
export interface WorkActivity {
  attendance: { batch: string; present: number; total: number }[];
  tests: { subject: string; topic?: string; batch?: string; mode?: string }[];
  materials: { title: string; kind: string }[];
  topics: { batch: string; title: string }[];
}

export const teacherOf = (r: WorkReport) => (typeof r.teacherId === 'object' && r.teacherId ? r.teacherId.name : 'Teacher');
