import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { errMsg, put } from '../src/api';
import { fmtTime } from '../src/format';
import { useFetch } from '../src/useFetch';
import { C, Card, Chips, ErrorView, H2, Icon, Loading, P, Progress, Row, Screen, Sheet, s } from '../src/ui';

interface Row_ {
  _id: string; name: string; color?: string; subject?: string; days: string[]; startTime: string; endTime: string; room?: string; teacher?: string;
  syllabus: { total: number; done: number; pct: number | null; next: string | null };
}
interface Topic { _id: string; title: string; done: boolean; subject?: string }
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = (typeof WEEK)[number];
const TODAY = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const)[new Date().getDay()];

/** Weekly timetable + syllabus completion (tick topics as done). */
export default function Timetable() {
  const { data, error, loading, refreshing, onRefresh, reload } = useFetch<Row_[]>('/academics/syllabus');
  const [day, setDay] = useState<Day>(TODAY);
  const [open, setOpen] = useState<Row_ | null>(null);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const classes = (data ?? []).filter((b) => b.days.includes(day)).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: 'Timetable & syllabus' }} />
      <Chips value={day} onChange={setDay} options={WEEK.map((d) => ({ value: d, label: d === TODAY ? `${d} · Today` : d }))} />
      <Card>
        {classes.length === 0 ? <P>No classes on {day}.</P> : classes.map((b) => (
          <Row key={b._id} style={{ paddingVertical: 8 }}>
            <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: b.color ?? C.brand }} />
            <View style={{ width: 74 }}><Text style={{ fontWeight: '800', color: C.text }}>{fmtTime(b.startTime)}</Text><P small>{fmtTime(b.endTime)}</P></View>
            <View style={{ flex: 1 }}><Text style={s.itemTitle}>{b.name}</Text><P small>{[b.room, b.teacher].filter(Boolean).join(' · ')}</P></View>
          </Row>
        ))}
      </Card>
      <H2>Syllabus completion</H2>
      {(data ?? []).map((b) => (
        <Card key={b._id} onPress={() => setOpen(b)}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[s.itemTitle, { flex: 1 }]} numberOfLines={1}>{b.name}</Text>
            <Text style={{ fontWeight: '800', color: C.brand }}>{b.syllabus.total ? `${b.syllabus.pct}%` : '—'}</Text>
          </Row>
          <Progress value={b.syllabus.pct ?? 0} />
          <P small style={{ marginTop: 6 }}>{b.syllabus.total ? `${b.syllabus.done}/${b.syllabus.total} topics${b.syllabus.next ? ` · Next: ${b.syllabus.next}` : ' · Completed 🎉'}` : 'No topics yet — add them on the website'}</P>
        </Card>
      ))}
      <Topics batch={open} onClose={() => { setOpen(null); reload(); }} />
    </Screen>
  );
}

function Topics({ batch, onClose }: { batch: Row_ | null; onClose: () => void }) {
  const t = useFetch<{ syllabus: Topic[] }>(batch ? `/academics/syllabus/${batch._id}` : null);
  const [list, setList] = useState<Topic[] | null>(null);
  const topics = list ?? t.data?.syllabus ?? [];
  const toggle = async (x: Topic) => {
    try {
      setList(await put<Topic[]>(`/academics/syllabus/${batch!._id}/${x._id}`, { done: !x.done }));
    } catch (e) {
      Alert.alert('Could not update', errMsg(e));
    }
  };
  return (
    <Sheet open={!!batch} onClose={() => { setList(null); onClose(); }} title={batch?.name ?? ''}>
      {t.loading && !t.data ? <Loading /> : topics.length === 0 ? <P>No topics yet.</P> : topics.map((x) => (
        <Pressable key={x._id} onPress={() => toggle(x)} style={[s.row, { paddingVertical: 10 }]}>
          <Icon name={x.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={x.done ? C.green : C.muted} />
          <Text style={[s.p, { flex: 1, color: x.done ? C.muted : C.text, textDecorationLine: x.done ? 'line-through' : 'none' }]}>{x.title}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

