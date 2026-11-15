import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { errMsg, post, put } from '../../src/api';
import { fmtDate } from '../../src/format';
import { useFetch } from '../../src/useFetch';
import { Avatar, Badge, Banner, Button, C, Card, ErrorView, Loading, P, Row, Screen, s } from '../../src/ui';

interface Detail {
  test: { _id: string; subject: string; topic?: string; maxMarks: number; date: string; status: 'scheduled' | 'graded' | 'published'; batch: { name: string }; passPercent?: number; negativeMarking?: boolean; mode?: 'offline' | 'online'; questions?: unknown[] };
  rows: { student: { _id: string; name: string; studentCode: string }; marks: number | null; absent: boolean; remark: string }[];
  stats: { avg: number | null; highest: number | null; passRate: number | null; entered: number };
}
interface Draft { marks: string; absent: boolean }

/** Marks entry for one test + publish to parents. */
export default function TestMarks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, onRefresh, reload } = useFetch<Detail>(id ? `/tests/${id}` : null);
  const attempts = useFetch<{ submitted: number; rows: unknown[] }>(data?.test.mode === 'online' && data.test.questions?.length ? `/tests/${id}/attempts` : null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.rows.map((r) => [r.student._id, { marks: r.marks == null ? '' : String(r.marks), absent: r.absent }])));
    setDirty(false);
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const { test, rows, stats } = data!;
  const min = test.negativeMarking ? -test.maxMarks : 0;
  const bad = Object.values(draft).some((d) => !d.absent && d.marks !== '' && (Number.isNaN(Number(d.marks)) || Number(d.marks) < min || Number(d.marks) > test.maxMarks));

  const save = async (andPublish = false) => {
    if (bad) return Alert.alert('Check the marks', `Marks must be between ${min} and ${test.maxMarks}.`);
    setSaving(true);
    try {
      if (dirty) {
        await put(`/tests/${test._id}/marks`, {
          results: rows.map((r) => {
            const d = draft[r.student._id];
            return { studentId: r.student._id, marks: d?.absent || d?.marks === '' ? null : Number(d?.marks), absent: !!d?.absent };
          }),
        });
      }
      if (andPublish) {
        await post(`/tests/${test._id}/publish`);
        Alert.alert('Results published ✓', 'Parents can see the marks now and get a notification.');
      } else Alert.alert('Marks saved ✓');
      setDirty(false);
      reload();
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <Stack.Screen options={{ title: test.subject }} />
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>{test.subject}{test.topic ? ` · ${test.topic}` : ''}</Text>
          <P>{test.batch?.name} · {fmtDate(test.date)} · out of {test.maxMarks}</P>
          <Row style={{ marginTop: 8 }}>
            <Badge tone={test.status === 'published' ? 'green' : test.status === 'graded' ? 'blue' : 'gray'}>{test.status}</Badge>
            {stats.avg != null && <Badge tone="brand">Avg {stats.avg}%</Badge>}
            {stats.highest != null && <Badge tone="green">Top {stats.highest}</Badge>}
            {stats.passRate != null && <Badge tone="amber">Pass {stats.passRate}%</Badge>}
          </Row>
        </Card>
        {test.mode === 'online' && test.questions?.length ? (
          <Banner tone="violet" icon="laptop-outline">Online MCQ test · {attempts.data ? `${attempts.data.submitted}/${attempts.data.rows.length} submitted` : '…'}. Scores fill in automatically; you can still edit them.</Banner>
        ) : null}
        {test.status === 'published' && <Banner tone="green" icon="eye">Parents can see these marks. Changes after publishing are recorded.</Banner>}

        {rows.length === 0 ? <P>No active students in this batch.</P> : rows.map((r) => {
          const d = draft[r.student._id] ?? { marks: '', absent: false };
          const invalid = !d.absent && d.marks !== '' && (Number.isNaN(Number(d.marks)) || Number(d.marks) < min || Number(d.marks) > test.maxMarks);
          return (
            <Card key={r.student._id} style={{ paddingVertical: 10 }}>
              <Row>
                <Avatar name={r.student.name} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.text }} numberOfLines={1}>{r.student.name}</Text>
                  <P small>{r.student.studentCode}</P>
                </View>
                <Pressable onPress={() => { setDraft((x) => ({ ...x, [r.student._id]: { ...d, absent: !d.absent } })); setDirty(true); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: d.absent ? C.redSoft : '#f1f5f9' }}>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: d.absent ? C.red : C.sub }}>AB</Text>
                </Pressable>
                <TextInput editable={!d.absent} value={d.absent ? '' : d.marks} placeholder={d.absent ? '—' : '0'} keyboardType="numbers-and-punctuation"
                  onChangeText={(v) => { setDraft((x) => ({ ...x, [r.student._id]: { ...d, marks: v.replace(/[^0-9.-]/g, '') } })); setDirty(true); }}
                  style={[s.input, { width: 72, textAlign: 'center', paddingVertical: 8, borderColor: invalid ? C.red : C.border }]} />
                <P small style={{ width: 34 }}>/{test.maxMarks}</P>
              </Row>
            </Card>
          );
        })}
        {rows.length > 0 && (
          <Row style={{ marginTop: 8 }}>
            <Button title={test.status === 'published' ? 'Save changes' : 'Save'} icon="save" variant={test.status === 'published' ? 'primary' : 'secondary'} onPress={() => save(false)} loading={saving} disabled={!dirty} style={{ flex: 1 }} />
            {test.status !== 'published' && <Button title="Publish to parents" icon="send" onPress={() => save(true)} loading={saving} disabled={stats.entered === 0 && !dirty} style={{ flex: 1 }} />}
          </Row>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
