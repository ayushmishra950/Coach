import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { errMsg, get, post } from '../src/api';
import { fmtDate, fmtDateTime, timeAgo, ymd } from '../src/format';
import { Pager } from '../src/Pager';
import { usePaged, usePoll } from '../src/useFetch';
import { Activity, teacherOf, type WorkActivity, type WorkReport } from '../src/workReports';
import { Avatar, Badge, Banner, Button, C, Card, Chips, Empty, ErrorView, Input, Loading, P, Row, Screen, Sheet } from '../src/ui';

type Status = 'all' | 'unseen' | 'seen';
type Extra = { unseen: number; missing?: { _id: string; name: string }[] };

/** Owner: teachers' daily work reports — read, reply, mark as seen. */
export default function WorkReportsScreen() {
  const [status, setStatus] = useState<Status>('unseen');
  const [day, setDay] = useState<'all' | 'today'>('all');
  const list = usePaged<WorkReport, Extra>('/work-reports', { status: status === 'all' ? undefined : status, date: day === 'today' ? ymd() : undefined });
  usePoll(() => list.reload());
  const [open, setOpen] = useState<WorkReport | null>(null);

  const seenAll = async () => {
    try {
      const r = await post<{ updated: number }>('/work-reports/seen-all', { date: day === 'today' ? ymd() : undefined });
      Alert.alert('Done', `${r.updated} report(s) marked as seen`);
      list.reload();
    } catch (e) {
      Alert.alert('Could not update', errMsg(e));
    }
  };

  return (
    <Screen scroll={false} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Work reports' }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
        <Chips value={status} onChange={setStatus} options={[{ value: 'unseen', label: 'Not seen', count: list.extra?.unseen }, { value: 'all', label: 'All' }, { value: 'seen', label: 'Seen' }]} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
        <Chips value={day} onChange={setDay} options={[{ value: 'all', label: 'All days' }, { value: 'today', label: 'Today' }]} />
      </ScrollView>
      {list.extra?.missing?.length ? <Banner tone="amber" icon="alert-circle">No report yet today: {list.extra.missing.map((m) => m.name).join(', ')}</Banner> : null}
      {(list.extra?.unseen ?? 0) > 0 && <Button title="Mark all as seen" icon="checkmark-done" variant="secondary" small onPress={seenAll} style={{ marginBottom: 8 }} />}
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(r) => r._id}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          renderItem={({ item: r }) => (
            <Card onPress={() => setOpen(r)} style={{ marginBottom: 8, borderColor: r.seenAt ? C.border : C.brand }}>
              <Row>
                <Avatar name={teacherOf(r)} size={36} />
                <View style={{ flex: 1 }}>
                  <P bold>{teacherOf(r)}</P>
                  <P small muted>{fmtDate(r.date)} · sent {timeAgo(r.submittedAt)}</P>
                </View>
                {r.seenAt ? <Badge tone="green">Seen</Badge> : <Badge tone="amber">New</Badge>}
              </Row>
              <P small numberOfLines={2} style={{ marginTop: 6 }}>{r.classes.map((c) => `${c.batchName ?? ''}${c.batchName && c.topic ? ': ' : ''}${c.topic}`).join(' · ') || r.otherWork || r.tests || r.homework}</P>
              {r.issues ? <P small style={{ color: C.red, marginTop: 4 }}>⚠ {r.issues}</P> : null}
            </Card>
          )}
          ListFooterComponent={<Pager {...list.pager} />}
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="clipboard-outline" title="No reports here" text="Teachers send their daily report from their app or website." />}
        />
      )}
      <ReportSheet report={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); list.reload(); }} />
    </Screen>
  );
}

function ReportSheet({ report, onClose, onSaved }: { report: WorkReport | null; onClose: () => void; onSaved: () => void }) {
  const [comment, setComment] = useState('');
  const [activity, setActivity] = useState<WorkActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (report && loadedFor !== report._id) {
    setLoadedFor(report._id);
    setActivity(null);
    setComment('');
    get<{ activity: WorkActivity | null }>(`/work-reports/${report._id}`).then((d) => setActivity(d.activity)).catch(() => undefined);
  }
  const save = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await post(`/work-reports/${report._id}/seen`, comment.trim() ? { comment: comment.trim() } : {});
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const r = report;
  return (
    <Sheet open={!!r} onClose={onClose} title={r ? `${teacherOf(r)} — ${fmtDate(r.date)}` : ''}>
      {r && (
        <ScrollView style={{ maxHeight: 520 }}>
          <P small muted>{r.seenAt ? `Seen ${fmtDateTime(r.seenAt)}` : `Sent ${fmtDateTime(r.submittedAt)}`}</P>
          {r.classes.length > 0 && <P bold style={{ marginTop: 8 }}>Classes</P>}
          {r.classes.map((c, i) => <P key={i} small>• {c.batchName ?? '—'}{c.topic ? ` — ${c.topic}` : ''}</P>)}
          {r.tests ? <><P bold style={{ marginTop: 8 }}>Tests</P><P small>{r.tests}</P></> : null}
          {r.homework ? <><P bold style={{ marginTop: 8 }}>Homework</P><P small>{r.homework}</P></> : null}
          {r.otherWork ? <><P bold style={{ marginTop: 8 }}>Other work</P><P small>{r.otherWork}</P></> : null}
          {r.issues ? <P small style={{ color: C.red, marginTop: 8 }}>⚠ {r.issues}</P> : null}
          <Activity a={activity} />
          {r.ownerComment ? <P small style={{ color: C.violet, marginTop: 8 }}>Your reply: {r.ownerComment}</P> : null}
          <Input label="Reply (optional)" value={comment} onChangeText={setComment} multiline maxLength={1000} placeholder="e.g. Good work 👍" />
          <Button title={comment.trim() ? 'Send reply' : r.seenAt ? 'Close' : 'Mark as seen'} icon={comment.trim() ? 'send' : 'eye'} onPress={comment.trim() || !r.seenAt ? save : onClose} loading={busy} />
        </ScrollView>
      )}
    </Sheet>
  );
}
