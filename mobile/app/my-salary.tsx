import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { fmtDate, fmtMins, inr } from '../src/format';
import { Pager, useClientPage } from '../src/Pager';
import { useFetch } from '../src/useFetch';
import { Badge, C, Card, ErrorView, Grid, H2, Loading, P, Row, Screen, Stat } from '../src/ui';

interface Sal { _id: string; label: string; amount: number; paidAmount: number; dueDate: string; status: 'pending' | 'partial' | 'paid'; paidAt?: string; bonus?: number; deduction?: number; leaveDays?: number; leaveDeduction?: number }
interface Me { label: string; totals: { present: number; late: number; leave: number; minutes: number; avgMinutes: number } }

/** Teacher: own attendance this month + salary history. */
export default function MySalary() {
  const sal = useFetch<Sal[]>('/staff-attendance/me/salaries');
  const me = useFetch<Me>('/staff-attendance/me');
  const page = useClientPage(sal.data);
  if (sal.loading && !sal.data) return <Loading />;
  if (sal.error && !sal.data) return <ErrorView message={sal.error} onRetry={sal.onRefresh} />;
  return (
    <Screen refreshing={sal.refreshing} onRefresh={() => { sal.onRefresh(); me.reload(); }}>
      <Stack.Screen options={{ title: 'My attendance & salary' }} />
      {me.data && (
        <>
          <H2>{me.data.label}</H2>
          <Grid>
            <Stat label="Days present" value={me.data.totals.present} icon="calendar-outline" tone="green" hint={me.data.totals.leave ? `${me.data.totals.leave} leave` : undefined} />
            <Stat label="Late days" value={me.data.totals.late} icon="alarm-outline" tone="amber" />
            <Stat label="Hours worked" value={fmtMins(me.data.totals.minutes)} icon="time-outline" />
            <Stat label="Average / day" value={fmtMins(me.data.totals.avgMinutes)} icon="speedometer-outline" tone="blue" />
          </Grid>
        </>
      )}
      <H2>Salary</H2>
      {(sal.data ?? []).length === 0 ? <P>No salary records yet.</P> : page.items.map((x) => (
        <Card key={x._id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: C.text }}>{x.label}</Text>
              <P small>{x.status === 'paid' && x.paidAt ? `Paid on ${fmtDate(x.paidAt)}` : `Pay day ${fmtDate(x.dueDate)}`}</P>
              {x.leaveDeduction ? <P small style={{ color: C.red }}>Leave {x.leaveDays} day{x.leaveDays === 1 ? '' : 's'}: −{inr(x.leaveDeduction)}</P> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: C.text }}>{inr(x.amount)}</Text>
              {x.status === 'paid' ? <Badge tone="green">Paid</Badge> : x.status === 'partial' ? <Badge tone="amber">{inr(x.amount - x.paidAmount)} pending</Badge> : <Badge>Upcoming</Badge>}
            </View>
          </Row>
        </Card>
      ))}
      {(sal.data?.length ?? 0) > 0 && <Pager {...page.pager} />}
    </Screen>
  );
}
