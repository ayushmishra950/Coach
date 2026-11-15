import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { errMsg, put, type Paged } from '../src/api';
import { addDays, fmtDate, fmtDateTime, fmtDay, ymd } from '../src/format';
import { useFetch } from '../src/useFetch';
import { Activity, type WorkActivity, type WorkReport } from '../src/workReports';
import { Pager } from '../src/Pager';
import { Badge, Button, C, Card, Chips, ErrorView, H2, Input, ListItem, Loading, P, Row, Screen } from '../src/ui';

interface Today { date: string; report: WorkReport | null; activity: WorkActivity; batches: { _id: string; name: string }[] }
type ClassRow = { batchId: string; topic: string };

/** Teacher: today's work report (or one of the last 3 days) + past reports. */
export default function DailyReportScreen() {
  const days = [0, 1, 2, 3].map((n) => ymd(addDays(new Date(), -n)));
  const [date, setDate] = useState(days[0]);
  const [page, setPage] = useState(1);
  const t = useFetch<Today>('/work-reports/me/today', { date });
  const hist = useFetch<Paged<WorkReport>>('/work-reports/me', { page });
  const [classes, setClasses] = useState<ClassRow[]>([{ batchId: '', topic: '' }]);
  const [f, setF] = useState({ tests: '', homework: '', otherWork: '', issues: '' });
  const [saving, setSaving] = useState(false);
  const rep = t.data?.report ?? null;
  const locked = !!rep?.seenAt;

  useEffect(() => {
    if (!t.data) return;
    const r = t.data.report;
    setClasses(r?.classes.length ? r.classes.map((c) => ({ batchId: c.batchId ?? '', topic: c.topic ?? '' })) : [{ batchId: '', topic: '' }]);
    setF({ tests: r?.tests ?? '', homework: r?.homework ?? '', otherWork: r?.otherWork ?? '', issues: r?.issues ?? '' });
  }, [t.data]);

  const send = async () => {
    const list = classes.filter((c) => c.batchId || c.topic.trim());
    if (!list.length && !f.tests.trim() && !f.homework.trim() && !f.otherWork.trim()) return Alert.alert('Write what you did', 'Add a class, test, homework or other work.');
    setSaving(true);
    try {
      await put('/work-reports/me/today', { date, classes: list, ...f });
      Alert.alert(rep ? 'Report updated ✓' : 'Report sent ✓', 'The owner can see it now.');
      t.reload();
      hist.reload();
    } catch (e) {
      Alert.alert('Could not send', errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const setRow = (i: number, patch: Partial<ClassRow>) => setClasses((p) => p.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Screen edges={['bottom']} refreshing={t.refreshing} onRefresh={() => { t.onRefresh(); hist.reload(); }}>
      <Stack.Screen options={{ title: 'Daily report' }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <Chips value={date} onChange={setDate} options={days.map((d, i) => ({ value: d, label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fmtDay(d) }))} />
      </ScrollView>
      {t.loading && !t.data ? <Loading /> : t.error && !t.data ? <ErrorView message={t.error} onRetry={t.onRefresh} /> : t.data && (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <P bold>{fmtDate(date)}</P>
              {rep ? (locked ? <Badge tone="green">Seen</Badge> : <Badge tone="amber">Sent · not seen</Badge>) : <Badge>Not sent</Badge>}
            </Row>
            {locked ? <P small muted>Seen by {rep?.seenByName ?? 'owner'} · {fmtDateTime(rep?.seenAt)}. It can't be changed now.</P> : rep ? <P small muted>Sent {fmtDateTime(rep.submittedAt)} — you can edit until the owner sees it.</P> : null}
            {rep?.ownerComment ? <View style={{ backgroundColor: C.brandSoft, padding: 10, borderRadius: 10, marginTop: 8 }}><P small style={{ color: C.violet }}>{rep.seenByName ?? 'Owner'}: {rep.ownerComment}</P></View> : null}

            <P small bold style={{ marginTop: 12, marginBottom: 6 }}>Classes taken & topics</P>
            {classes.map((c, i) => (
              <View key={i} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 8, marginBottom: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                  <Chips value={c.batchId} onChange={(v) => !locked && setRow(i, { batchId: v })} options={[{ value: '', label: 'No batch' }, ...t.data!.batches.map((b) => ({ value: b._id, label: b.name }))]} />
                </ScrollView>
                <Input value={c.topic} onChangeText={(v) => setRow(i, { topic: v })} placeholder="Topic taught" editable={!locked} maxLength={300} />
                {!locked && classes.length > 1 && (
                  <Pressable onPress={() => setClasses((p) => p.filter((_, j) => j !== i))} style={{ alignSelf: 'flex-end' }}>
                    <Text style={{ color: C.red, fontSize: 12, fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {!locked && classes.length < 20 && <Button title="Add class" icon="add" variant="ghost" small onPress={() => setClasses((p) => [...p, { batchId: '', topic: '' }])} />}
            <Input label="Tests / quizzes taken" value={f.tests} onChangeText={(v) => setF({ ...f, tests: v })} multiline editable={!locked} maxLength={1000} />
            <Input label="Homework given" value={f.homework} onChangeText={(v) => setF({ ...f, homework: v })} multiline editable={!locked} maxLength={1000} />
            <Input label="Other work" value={f.otherWork} onChangeText={(v) => setF({ ...f, otherWork: v })} multiline editable={!locked} maxLength={2000} placeholder="Doubt sessions, notes, parent calls…" />
            <Input label="Issues (optional)" value={f.issues} onChangeText={(v) => setF({ ...f, issues: v })} multiline editable={!locked} maxLength={1000} />
            <Activity a={t.data.activity} />
            {!locked && <Button title={rep ? 'Update report' : 'Send report'} icon="send" onPress={send} loading={saving} style={{ marginTop: 12 }} />}
          </Card>
        </>
      )}

      <H2>My past reports</H2>
      <Card>
        {!hist.data ? <Loading /> : hist.data.items.length === 0 ? <P>No reports yet.</P> : hist.data.items.map((r) => (
          <ListItem key={r._id} title={fmtDate(r.date)} onPress={days.includes(r.date) ? () => setDate(r.date) : undefined}
            subtitle={[r.classes.length && `${r.classes.length} class${r.classes.length > 1 ? 'es' : ''}`, r.tests && 'tests', r.homework && 'homework', r.otherWork && 'other work'].filter(Boolean).join(' · ') || '—'}
            right={r.seenAt ? <Badge tone="green">Seen</Badge> : <Badge tone="amber">Not seen</Badge>} />
        ))}
        {hist.data && <Pager page={hist.data.page} pages={hist.data.pages} total={hist.data.total} onChange={setPage} />}
      </Card>
    </Screen>
  );
}
