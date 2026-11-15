import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { errMsg, post } from '../../src/api';
import { addDays, fmtDay, fmtDateTime, ymd } from '../../src/format';
import { useFetch } from '../../src/useFetch';
import { Avatar, Banner, Button, C, Card, ErrorView, Loading, P, Row, Screen } from '../../src/ui';

type Status = 'present' | 'absent' | 'late';
interface Sheet {
  batch: { _id: string; name: string };
  date: string;
  students: { _id: string; name: string; studentCode: string }[];
  records: { studentId: string; status: Status }[] | null;
  submittedAt: string | null;
  holiday: string | null;
  locked: boolean;
  editDays: number;
  onLeave?: { studentId: string; reason: string }[];
}
const META: Record<Status, { label: string; short: string; color: string }> = {
  present: { label: 'Present', short: 'P', color: '#059669' },
  absent: { label: 'Absent', short: 'A', color: '#e11d48' },
  late: { label: 'Late', short: 'L', color: '#d97706' },
};

export default function MarkAttendance() {
  const { batchId, name } = useLocalSearchParams<{ batchId: string; name?: string }>();
  const [date, setDate] = useState(ymd());
  const { data, error, loading, onRefresh } = useFetch<Sheet>(batchId ? '/attendance/sheet' : null, { batchId, date });
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const m: Record<string, Status> = {};
    for (const st of data.students) {
      const rec = data.records?.find((r) => String(r.studentId) === st._id);
      // Fresh sheet: everyone present, except students on approved leave.
      m[st._id] = rec?.status ?? (data.onLeave?.some((l) => String(l.studentId) === st._id) ? 'absent' : 'present');
    }
    setMarks(m);
  }, [data]);

  const counts = useMemo(() => {
    const v = Object.values(marks);
    return { present: v.filter((x) => x === 'present').length, absent: v.filter((x) => x === 'absent').length, late: v.filter((x) => x === 'late').length };
  }, [marks]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await post('/attendance', { batchId, date, records: data.students.map((st) => ({ studentId: st._id, status: marks[st._id] ?? 'present' })) });
      Alert.alert('Attendance saved ✓', counts.absent ? `${counts.absent} absent — their parents are being informed.` : 'Everyone is present.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const title = data?.batch.name ?? name ?? 'Attendance';
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const sheet = data!;
  const locked = sheet.locked;

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Button small title="" icon="chevron-back" variant="secondary" onPress={() => setDate(ymd(addDays(new Date(date + 'T00:00:00'), -1)))} />
        <Text style={{ fontWeight: '800', fontSize: 16, color: C.text }}>{fmtDay(date)}</Text>
        <Button small title="" icon="chevron-forward" variant="secondary" disabled={date >= ymd()} onPress={() => setDate(ymd(addDays(new Date(date + 'T00:00:00'), 1)))} />
      </Row>
      {sheet.holiday ? <Banner tone="blue" icon="sunny">Holiday: {sheet.holiday}. You can still mark if a class was held.</Banner> : null}
      {locked ? <Banner tone="amber" icon="lock-closed">Attendance older than {sheet.editDays} days can only be changed by the owner.</Banner> : null}
      {sheet.submittedAt ? <P small muted style={{ marginBottom: 8 }}>Last saved {fmtDateTime(sheet.submittedAt)} — editing</P> : null}

      <Card>
        <Row style={{ justifyContent: 'space-around' }}>
          {(['present', 'late', 'absent'] as Status[]).map((k) => (
            <View key={k} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: META[k].color }}>{counts[k]}</Text>
              <P small>{META[k].label}</P>
            </View>
          ))}
        </Row>
        {!locked && (
          <Row style={{ marginTop: 12 }}>
            <Button small title="All present" variant="secondary" icon="checkmark-done" onPress={() => setMarks(Object.fromEntries(sheet.students.map((x) => [x._id, 'present'])))} style={{ flex: 1 }} />
            <Button small title="All absent" variant="secondary" icon="close" onPress={() => setMarks(Object.fromEntries(sheet.students.map((x) => [x._id, 'absent'])))} style={{ flex: 1 }} />
          </Row>
        )}
      </Card>

      {sheet.students.length === 0 ? <P>No students in this batch yet.</P> : sheet.students.map((st) => {
        const cur = marks[st._id] ?? 'present';
        const leave = sheet.onLeave?.find((l) => String(l.studentId) === st._id);
        return (
          <Card key={st._id} style={{ paddingVertical: 10, borderColor: cur === 'absent' ? '#fecdd3' : cur === 'late' ? '#fde68a' : '#eef2f7' }}>
            <Row>
              <Avatar name={st.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.text }} numberOfLines={1}>{st.name}</Text>
                <P small>{leave ? `On approved leave · ${leave.reason}` : st.studentCode}</P>
              </View>
              <Row style={{ gap: 4 }}>
                {(['present', 'absent', 'late'] as Status[]).map((k) => (
                  <Pressable key={k} disabled={locked} onPress={() => setMarks((m) => ({ ...m, [st._id]: k }))}
                    style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: cur === k ? META[k].color : '#f1f5f9' }}>
                    <Text style={{ fontWeight: '800', color: cur === k ? '#fff' : C.sub }}>{META[k].short}</Text>
                  </Pressable>
                ))}
              </Row>
            </Row>
          </Card>
        );
      })}
      {!locked && sheet.students.length > 0 && <Button title="Save attendance" icon="save" onPress={save} loading={saving} style={{ marginTop: 8 }} />}
    </Screen>
  );
}
