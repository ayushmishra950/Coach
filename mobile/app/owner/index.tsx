import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { fmtDate, fmtTime, greeting, inr, inrShort, timeAgo } from '../../src/format';
import { useFetch, usePoll } from '../../src/useFetch';
import { Badge, Banner, C, Card, ErrorView, Grid, H1, H2, ListItem, Loading, P, Progress, Screen, Stat, pctColor, s } from '../../src/ui';

interface OwnerDash {
  holiday?: string | null;
  counts: { students: number; teachers: number; batches: number };
  todayAttendance: { present: number; total: number };
  fees: { collectedThisMonth: number; pendingThisMonth: number; total: number; collected: number; pending: number };
  actions: { pendingFeeStudents: number; overdueInvoices: number; absentAlerts: number; testsNeedingMarks: number };
  classes: { _id: string; name: string; startTime: string; endTime: string; teacher?: string; marked: boolean; present: number; total: number; students: number }[];
  recentPayments: { _id: string; amount: number; method: string; paidAt: string; studentId: { name: string } | null }[];
  absentAlerts: { studentId: string; count: number; student: { name: string } }[];
}
interface StaffDay { summary: { total: number; checkedIn: number; working: number; late: number; leave: number } }
interface SalarySummary { overdue: { count: number; amount: number }; next: { dueDate: string; count: number; amount: number } | null }

export default function OwnerHome() {
  const { session } = useAuth();
  const d = useFetch<OwnerDash>('/dashboard');
  const staff = useFetch<StaffDay>('/staff-attendance/day');
  const sal = useFetch<SalarySummary>('/salaries/summary');
  const leads = useFetch<{ counts: Record<string, number> }>('/leads', { status: 'followup' });
  const leaves = useFetch<{ pending: number }>('/academics/leaves', { status: 'pending' });
  const reports = useFetch<{ unseen: number }>('/work-reports', { status: 'unseen' });
  // New enquiries, payments, check-ins and reports appear without pulling down.
  usePoll(() => { d.reload(); staff.reload(); leads.reload(); leaves.reload(); reports.reload(); }, ['notification:new', 'lead:new', 'staff:attendance', 'report:new']);

  const refresh = () => { d.onRefresh(); staff.reload(); sal.reload(); leads.reload(); leaves.reload(); };
  if (d.loading && !d.data) return <Loading />;
  if (d.error && !d.data) return <ErrorView message={d.error} onRetry={d.onRefresh} />;
  const x = d.data!;
  const att = x.todayAttendance.total ? Math.round((x.todayAttendance.present / x.todayAttendance.total) * 100) : null;
  const followups = leads.data?.counts.followup ?? 0;
  const pendingLeaves = leaves.data?.pending ?? 0;

  return (
    <Screen refreshing={d.refreshing} onRefresh={refresh}>
      <P muted>{greeting()},</P>
      <H1>{session?.user.name.split(' ')[0]} 👋</H1>
      <P style={{ marginBottom: 16 }}>{session?.institute?.name}</P>

      {session?.institute?.status === 'trial' && session.institute.trialDaysLeft != null && (
        <Banner tone="violet" icon="sparkles">{session.institute.trialDaysLeft > 0 ? `Free Premium trial — ${session.institute.trialDaysLeft} days left` : 'Your free trial has ended (Starter features). Choose a plan on the website.'}</Banner>
      )}
      {x.holiday ? <Banner tone="blue" icon="sunny">Today is a holiday — {x.holiday}</Banner> : null}
      {followups > 0 && <Banner tone="violet" icon="person-add" onPress={() => router.push('/owner/leads')}>{followups} enquir{followups === 1 ? 'y' : 'ies'} to follow up today</Banner>}
      {pendingLeaves > 0 && <Banner tone="amber" icon="calendar" onPress={() => router.push('/leaves')}>{pendingLeaves} leave request{pendingLeaves === 1 ? '' : 's'} waiting</Banner>}
      {(reports.data?.unseen ?? 0) > 0 && <Banner tone="green" icon="clipboard" onPress={() => router.push('/work-reports')}>{reports.data!.unseen} new teacher work report{reports.data!.unseen === 1 ? '' : 's'}</Banner>}
      {sal.data && sal.data.overdue.count > 0 && <Banner tone="red" icon="cash" onPress={() => router.push('/salaries')}>{inr(sal.data.overdue.amount)} teacher salary overdue ({sal.data.overdue.count})</Banner>}

      <Grid>
        <Stat label="Active students" value={x.counts.students} icon="people" onPress={() => router.push('/owner/students')} />
        <Stat label="Collected this month" value={inrShort(x.fees.collectedThisMonth)} icon="wallet" tone="green" hint={`${inr(x.fees.pendingThisMonth)} pending`} onPress={() => router.push('/owner/fees')} />
        <Stat label="Today's attendance" value={att == null ? '—' : `${att}%`} icon="checkbox" tone="blue" hint={`${x.todayAttendance.present}/${x.todayAttendance.total} present`} onPress={() => router.push('/attendance')} />
        <Stat label="Teachers checked in" value={staff.data ? `${staff.data.summary.checkedIn}/${staff.data.summary.total}` : '—'} icon="finger-print" tone="violet" hint={staff.data?.summary.late ? `${staff.data.summary.late} late` : undefined} onPress={() => router.push('/staff')} />
      </Grid>

      <H2>Needs attention</H2>
      <Card>
        {[
          { n: x.actions.overdueInvoices, t: 'fee installments overdue', go: '/owner/fees' as const, tone: C.red },
          { n: x.actions.pendingFeeStudents, t: 'students with pending fees', go: '/owner/fees' as const, tone: C.amber },
          { n: x.actions.absentAlerts, t: 'students absent 3+ classes in a row', go: '/attendance' as const, tone: C.red },
          { n: x.actions.testsNeedingMarks, t: 'tests need marks', go: '/tests' as const, tone: C.violet },
        ].filter((a) => a.n > 0).map((a) => (
          <ListItem key={a.t} title={<Text style={s.itemTitle}><Text style={{ color: a.tone }}>{a.n}</Text> {a.t}</Text>} onPress={() => router.push(a.go)} />
        ))}
        {!x.actions.overdueInvoices && !x.actions.pendingFeeStudents && !x.actions.absentAlerts && !x.actions.testsNeedingMarks && <P>All caught up 🎉</P>}
      </Card>

      <H2>Today's classes</H2>
      <Card>
        {x.classes.length === 0 ? <P>No classes scheduled today.</P> : x.classes.map((c) => (
          <ListItem key={c._id} title={c.name}
            subtitle={`${fmtTime(c.startTime)} – ${fmtTime(c.endTime)}${c.teacher ? ` · ${c.teacher}` : ''} · ${c.students} students`}
            right={c.marked ? <Badge tone="green">{c.present}/{c.total}</Badge> : <Badge tone="amber">Not marked</Badge>}
            onPress={() => router.push({ pathname: '/attendance/[batchId]', params: { batchId: c._id, name: c.name } })} />
        ))}
      </Card>

      {sal.data?.next && (
        <Card onPress={() => router.push('/salaries')}>
          <P small muted>NEXT SALARY PAY DAY</P>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginTop: 2 }}>{inr(sal.data.next.amount)}</Text>
          <P>{sal.data.next.count} teacher{sal.data.next.count === 1 ? '' : 's'} · {fmtDate(sal.data.next.dueDate)}</P>
        </Card>
      )}

      <H2>Fee collection</H2>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <P>Collected <Text style={{ color: C.green, fontWeight: '800' }}>{inr(x.fees.collected)}</Text></P>
          <P>of {inr(x.fees.total)}</P>
        </View>
        <Progress value={x.fees.total ? (x.fees.collected / x.fees.total) * 100 : 0} color={pctColor(x.fees.total ? (x.fees.collected / x.fees.total) * 100 : null)} />
      </Card>

      {x.recentPayments.length > 0 && (
        <>
          <H2>Recent payments</H2>
          <Card>
            {x.recentPayments.map((p) => (
              <ListItem key={p._id} icon="receipt-outline" title={p.studentId?.name ?? 'Student'} subtitle={`${p.method.toUpperCase()} · ${timeAgo(p.paidAt)}`}
                right={<Text style={{ fontWeight: '800', color: C.green }}>{inr(p.amount)}</Text>} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
