import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { addDays, fmtClock, fmtDay, fmtMins, ymd } from '../src/format';
import { Pager, useClientPage } from '../src/Pager';
import { useFetch, usePoll } from '../src/useFetch';
import { Avatar, Badge, Button, C, Card, ErrorView, Grid, Loading, P, Row, Screen, Stat, type Tone } from '../src/ui';

interface Item {
  teacher: { _id: string; name: string; subjects?: string[] };
  row: { checkIn?: string; checkOut?: string; minutes?: number; late?: boolean; lateBy?: number; earlyLeave?: boolean; status: string } | null;
  liveMinutes: number | null;
}
interface Day { date: string; isToday: boolean; items: Item[]; summary: { total: number; checkedIn: number; working: number; late: number; leave: number; notIn: number } }

/** Owner: teachers' check-in / check-out for a day. */
export default function Staff() {
  const [date, setDate] = useState(ymd());
  const { data, error, loading, refreshing, onRefresh, reload } = useFetch<Day>('/staff-attendance/day', { date });
  const page = useClientPage(data?.items, date);
  // Check-ins / check-outs appear the moment a teacher taps the button.
  usePoll(() => reload(), ['staff:attendance']);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const d = data!;
  const state = (it: Item): [string, Tone] => {
    const r = it.row;
    if (!r) return [d.isToday ? 'Not in yet' : 'No record', 'gray'];
    if (r.status === 'leave') return ['On leave', 'blue'];
    if (r.status === 'absent') return ['Absent', 'red'];
    if (r.checkIn && !r.checkOut) return d.isToday ? ['Working', 'green'] : ['No check-out', 'amber'];
    return ['Checked out', 'brand'];
  };
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: 'Staff check-in' }} />
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Button small title="" icon="chevron-back" variant="secondary" onPress={() => setDate(ymd(addDays(new Date(date + 'T00:00:00'), -1)))} />
        <Text style={{ fontWeight: '800', fontSize: 16, color: C.text }}>{fmtDay(date)}</Text>
        <Button small title="" icon="chevron-forward" variant="secondary" disabled={date >= ymd()} onPress={() => setDate(ymd(addDays(new Date(date + 'T00:00:00'), 1)))} />
      </Row>
      <Grid>
        <Stat label="Checked in" value={`${d.summary.checkedIn}/${d.summary.total}`} icon="log-in-outline" tone="green" hint={d.isToday ? `${d.summary.working} working now` : undefined} />
        <Stat label="Late" value={d.summary.late} icon="alarm-outline" tone="amber" />
        <Stat label="On leave" value={d.summary.leave} icon="calendar-outline" tone="blue" />
        <Stat label={d.isToday ? 'Not in yet' : 'No record'} value={d.summary.notIn} icon="person-remove-outline" tone="red" />
      </Grid>
      <View style={{ height: 12 }} />
      {page.items.map((it) => {
        const [label, tone] = state(it);
        const r = it.row;
        return (
          <Card key={it.teacher._id}>
            <Row>
              <Avatar name={it.teacher.name} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{it.teacher.name}</Text>
                <P small>{r?.checkIn ? `${fmtClock(r.checkIn)} → ${r.checkOut ? fmtClock(r.checkOut) : '…'}` : it.teacher.subjects?.join(', ') ?? ''}</P>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge tone={tone}>{label}</Badge>
                {r?.late ? <Badge tone="amber">+{r.lateBy}m late</Badge> : null}
                {it.liveMinutes != null ? <P small style={{ color: C.green }}>{fmtMins(it.liveMinutes)}…</P> : r?.checkOut ? <P small>{fmtMins(r.minutes)}</P> : null}
              </View>
            </Row>
          </Card>
        );
      })}
      <P small muted>To correct a time or mark leave, use Staff check-in on the website.</P>
      {d.items.length > 0 && <Pager {...page.pager} />}
    </Screen>
  );
}
