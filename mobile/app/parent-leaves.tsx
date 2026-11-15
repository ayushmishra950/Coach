import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { errMsg, post } from '../src/api';
import { addDays, fmtDay, timeAgo, ymd } from '../src/format';
import { Pager, useClientPage } from '../src/Pager';
import { ChildPicker, useParent } from '../src/parent';
import { useFetch } from '../src/useFetch';
import { Badge, Button, C, Card, Chips, Empty, ErrorView, H2, Input, Loading, P, Row, Screen, Sheet, type Tone } from '../src/ui';

interface Leave { _id: string; from: string; to: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; reviewNote?: string; reviewedByName?: string; createdAt: string }
const TONE: Record<Leave['status'], Tone> = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };

export default function ParentLeaves() {
  const p = useParent();
  const sid = p.child?.student._id;
  const list = useFetch<Leave[]>(sid ? '/parent/leaves' : null, { studentId: sid });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const page = useClientPage(list.data, sid);

  if (p.loading && !p.data) return <Loading />;
  if (p.error && !p.data) return <ErrorView message={p.error} onRetry={p.onRefresh} />;
  if (!p.child) return <Screen><Empty title="No student linked" /></Screen>;

  const cancel = (l: Leave) => Alert.alert('Cancel this request?', `${fmtDay(l.from)}${l.to !== l.from ? ` – ${fmtDay(l.to)}` : ''}`, [
    { text: 'No', style: 'cancel' },
    { text: 'Cancel request', style: 'destructive', onPress: async () => {
      setBusy(l._id);
      try { await post(`/parent/leaves/${l._id}/cancel`); list.reload(); } catch (e) { Alert.alert('Could not cancel', errMsg(e)); } finally { setBusy(null); }
    } },
  ]);

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.onRefresh} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Leave requests' }} />
      <ChildPicker children={p.children} value={sid} onChange={p.setChildId} />
      <Button title={`Apply leave for ${p.child.student.name.split(' ')[0]}`} icon="add" onPress={() => setOpen(true)} />
      <H2>History</H2>
      {list.loading && !list.data ? <Loading /> : list.error && !list.data ? <ErrorView message={list.error} onRetry={list.onRefresh} /> : !list.data?.length ? (
        <Empty icon="calendar-outline" title="No leave requests" text="The teacher is informed as soon as you apply." />
      ) : page.items.map((l) => (
        <Card key={l._id} style={{ marginBottom: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <P bold style={{ flex: 1 }}>{fmtDay(l.from)}{l.to !== l.from ? ` – ${fmtDay(l.to)}` : ''}</P>
            <Badge tone={TONE[l.status]}>{l.status}</Badge>
          </Row>
          <P style={{ marginTop: 4 }}>{l.reason}</P>
          {l.reviewNote ? <P small style={{ marginTop: 4, color: C.violet }}>{l.reviewedByName ?? 'Reply'}: {l.reviewNote}</P> : null}
          <P small muted style={{ marginTop: 4 }}>Applied {timeAgo(l.createdAt)}</P>
          {l.status === 'pending' && <Button title="Cancel request" variant="ghost" small onPress={() => cancel(l)} loading={busy === l._id} style={{ marginTop: 6 }} />}
        </Card>
      ))}
      {(list.data?.length ?? 0) > 0 && <Pager {...page.pager} />}
      <ApplySheet open={open} onClose={() => setOpen(false)} studentId={sid!} onDone={() => { setOpen(false); list.reload(); }} />
    </Screen>
  );
}

function ApplySheet({ open, onClose, studentId, onDone }: { open: boolean; onClose: () => void; studentId: string; onDone: () => void }) {
  const today = new Date();
  const days = Array.from({ length: 21 }, (_, i) => ymd(addDays(today, i - 2)));
  const [from, setFrom] = useState(ymd(today));
  const [to, setTo] = useState(ymd(today));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!reason.trim()) return Alert.alert('Write the reason for leave');
    setSaving(true);
    try {
      await post('/parent/leaves', { studentId, from, to: to < from ? from : to, reason: reason.trim() });
      setReason('');
      Alert.alert('Leave request sent ✓', 'The teacher and the institute have been informed.');
      onDone();
    } catch (e) {
      Alert.alert('Could not send', errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const opts = days.map((d) => ({ value: d, label: fmtDay(d) }));
  return (
    <Sheet open={open} onClose={onClose} title="Apply for leave">
      <P small bold>From</P>
      <View style={{ height: 44, marginBottom: 8 }}><ScrollChips value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} options={opts} /></View>
      <P small bold>To</P>
      <View style={{ height: 44, marginBottom: 8 }}><ScrollChips value={to} onChange={setTo} options={opts.filter((o) => o.value >= from)} /></View>
      <Input label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Not well / family function" multiline maxLength={500} />
      <Button title="Send request" icon="send" onPress={save} loading={saving} />
    </Sheet>
  );
}

function ScrollChips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Chips value={value} onChange={onChange} options={options} />
    </ScrollView>
  );
}
