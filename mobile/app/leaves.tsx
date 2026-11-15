import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, Text, View } from 'react-native';
import { errMsg, put } from '../src/api';
import { fmtDate, telUrl, timeAgo } from '../src/format';
import { Pager } from '../src/Pager';
import { usePaged } from '../src/useFetch';
import { Badge, Button, C, Card, Chips, Empty, ErrorView, Input, Loading, P, Row, Sheet, s, type Tone } from '../src/ui';

interface Leave {
  _id: string; from: string; to: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; createdAt: string; reviewedByName?: string; reviewNote?: string;
  studentId: { _id: string; name: string; studentCode: string; parentName?: string; parentPhone?: string } | null;
}
const TONE: Record<Leave['status'], Tone> = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** Owner / teacher: approve or reject parents' leave applications. */
export default function Leaves() {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const list = usePaged<Leave>('/academics/leaves', { status: filter === 'all' ? undefined : filter });
  const [review, setReview] = useState<{ l: Leave; status: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await put(`/academics/leaves/${review.l._id}`, { status: review.status, note });
      setReview(null);
      setNote('');
      list.reload();
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Leave requests' }} />
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          ListHeaderComponent={<Chips value={filter} onChange={setFilter} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} />}
          ListFooterComponent={<Pager {...list.pager} />}
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="calendar-outline" title={filter === 'pending' ? 'No pending requests' : 'Nothing here'} />}
          renderItem={({ item: l }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.itemTitle}>{l.studentId?.name ?? 'Student'}</Text>
                <Badge tone={TONE[l.status]}>{l.status}</Badge>
              </Row>
              <P bold>{l.from === l.to ? fmtDate(l.from) : `${fmtDate(l.from, false)} – ${fmtDate(l.to)}`} · {days(l.from, l.to)} day{days(l.from, l.to) > 1 ? 's' : ''}</P>
              <P>{l.reason}</P>
              <P small muted>{l.studentId?.parentName ?? 'Parent'} · {timeAgo(l.createdAt)}{l.reviewedByName ? ` · ${l.status} by ${l.reviewedByName}` : ''}</P>
              {l.status === 'pending' && (
                <Row style={{ marginTop: 10 }}>
                  {l.studentId?.parentPhone ? <Button small title="" icon="call" variant="secondary" onPress={() => Linking.openURL(telUrl(l.studentId!.parentPhone!))} /> : null}
                  <Button small title="Reject" variant="secondary" icon="close" onPress={() => setReview({ l, status: 'rejected' })} style={{ flex: 1 }} />
                  <Button small title="Approve" variant="success" icon="checkmark" onPress={() => setReview({ l, status: 'approved' })} style={{ flex: 1 }} />
                </Row>
              )}
            </Card>
          )}
        />
      )}
      <Sheet open={!!review} onClose={() => setReview(null)} title={review?.status === 'approved' ? 'Approve leave' : 'Reject leave'}>
        <Input label="Note for the parent (optional)" value={note} onChangeText={setNote} multiline />
        <Button title={review?.status === 'approved' ? 'Approve' : 'Reject'} variant={review?.status === 'approved' ? 'success' : 'danger'} onPress={submit} loading={busy} />
      </Sheet>
    </View>
  );
}
