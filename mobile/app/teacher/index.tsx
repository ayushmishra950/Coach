import { router } from 'expo-router';
import { useAuth } from '../../src/auth';
import { CheckInCard } from '../../src/CheckIn';
import { fmtDate, fmtTime, greeting } from '../../src/format';
import { useFetch, usePoll } from '../../src/useFetch';
import { Badge, Banner, Card, ErrorView, Grid, H1, H2, ListItem, Loading, P, Screen, Stat } from '../../src/ui';

interface TeacherDash {
  holiday?: string | null;
  counts: { batches: number; students: number; testsPending: number };
  todayAttendance: { present: number; total: number };
  classes: { _id: string; name: string; startTime: string; endTime: string; room?: string; students: number; marked: boolean; present: number; total: number }[];
  pendingTests: { _id: string; subject: string; topic?: string; date: string; batchId: { name: string } }[];
  absentAlerts: { studentId: string; count: number; student: { name: string } }[];
}

export default function TeacherToday() {
  const { session } = useAuth();
  const d = useFetch<TeacherDash>('/dashboard');
  const leaves = useFetch<{ pending: number }>('/academics/leaves', { status: 'pending' });
  usePoll(() => { d.reload(); leaves.reload(); report.reload(); });
  const report = useFetch<{ report: { seenAt?: string | null; ownerComment?: string } | null }>('/work-reports/me/today');
  if (d.loading && !d.data) return <Loading />;
  if (d.error && !d.data) return <ErrorView message={d.error} onRetry={d.onRefresh} />;
  const x = d.data!;
  const unmarked = x.holiday ? [] : x.classes.filter((c) => !c.marked);

  return (
    <Screen refreshing={d.refreshing} onRefresh={() => { d.onRefresh(); leaves.reload(); report.reload(); }}>
      <P muted>{greeting()},</P>
      <H1>{session?.user.name.split(' ')[0]} 👋</H1>
      <P style={{ marginBottom: 16 }}>{session?.institute?.name}</P>
      <CheckInCard />
      {x.holiday ? <Banner tone="blue" icon="sunny">Today is a holiday — {x.holiday}</Banner> : null}
      {unmarked.length > 0 && (
        <Banner tone="brand" icon="checkbox" onPress={() => router.push({ pathname: '/attendance/[batchId]', params: { batchId: unmarked[0]._id, name: unmarked[0].name } })}>
          Mark attendance for {unmarked[0].name}{unmarked.length > 1 ? ` (+${unmarked.length - 1} more)` : ''}
        </Banner>
      )}
      {report.data && !report.data.report && new Date().getHours() >= 12 && (
        <Banner tone="green" icon="clipboard" onPress={() => router.push('/daily-report')}>Send today's work report to the owner</Banner>
      )}
      {report.data?.report?.ownerComment ? <Banner tone="violet" icon="chatbubble" onPress={() => router.push('/daily-report')}>Owner replied on your report: {report.data.report.ownerComment}</Banner> : null}
      {(leaves.data?.pending ?? 0) > 0 && <Banner tone="amber" icon="calendar" onPress={() => router.push('/leaves')}>{leaves.data!.pending} leave request(s) waiting for you</Banner>}

      <Grid>
        <Stat label="My batches" value={x.counts.batches} icon="albums-outline" />
        <Stat label="My students" value={x.counts.students} icon="people-outline" tone="violet" onPress={() => router.push('/students')} />
        <Stat label="Today present" value={x.todayAttendance.total ? `${Math.round((x.todayAttendance.present / x.todayAttendance.total) * 100)}%` : '—'} icon="checkbox-outline" tone="green" hint={`${x.todayAttendance.present}/${x.todayAttendance.total}`} />
        <Stat label="Tests to grade" value={x.counts.testsPending} icon="clipboard-outline" tone="amber" onPress={() => router.push('/teacher/tests')} />
      </Grid>

      <H2>Today's classes</H2>
      <Card>
        {x.classes.length === 0 ? <P>No classes today.</P> : x.classes.map((c) => (
          <ListItem key={c._id} title={c.name} subtitle={`${fmtTime(c.startTime)} – ${fmtTime(c.endTime)}${c.room ? ` · ${c.room}` : ''} · ${c.students} students`}
            right={c.marked ? <Badge tone="green">{c.present}/{c.total}</Badge> : <Badge tone="amber">Mark</Badge>}
            onPress={() => router.push({ pathname: '/attendance/[batchId]', params: { batchId: c._id, name: c.name } })} />
        ))}
      </Card>

      {x.pendingTests.length > 0 && (
        <>
          <H2>Tests waiting for marks</H2>
          <Card>
            {x.pendingTests.map((t) => (
              <ListItem key={t._id} icon="clipboard-outline" title={`${t.subject}${t.topic ? ` · ${t.topic}` : ''}`} subtitle={`${t.batchId?.name} · ${fmtDate(t.date)}`}
                onPress={() => router.push({ pathname: '/test/[id]', params: { id: t._id } })} />
            ))}
          </Card>
        </>
      )}

      {x.absentAlerts.length > 0 && (
        <>
          <H2>Absence alerts</H2>
          <Card>
            {x.absentAlerts.map((a) => (
              <ListItem key={a.studentId} icon="alert-circle-outline" title={a.student.name} right={<Badge tone="red">{a.count} in a row</Badge>}
                onPress={() => router.push({ pathname: '/student/[id]', params: { id: a.studentId } })} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
