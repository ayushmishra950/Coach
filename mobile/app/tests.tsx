import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { fmtDate } from '../src/format';
import { Pager } from '../src/Pager';
import { usePaged } from '../src/useFetch';
import { Badge, C, Chips, Empty, ErrorView, ListItem, Loading, s, type Tone } from '../src/ui';

interface TestRow {
  _id: string; subject: string; topic?: string; date: string; maxMarks: number; status: 'scheduled' | 'graded' | 'published';
  batch: { _id: string; name: string } | null; students: number; entered: number; avg: number | null;
}
const TONE: Record<TestRow['status'], Tone> = { scheduled: 'gray', graded: 'blue', published: 'green' };

/** Tests list (owner: all, teacher: own batches). Tap to enter marks. */
export default function Tests() {
  const [status, setStatus] = useState<'all' | TestRow['status']>('all');
  const list = usePaged<TestRow>('/tests', { status: status === 'all' ? undefined : status });
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Tests & marks' }} />
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          ListHeaderComponent={<Chips value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'scheduled', label: 'Need marks' }, { value: 'graded', label: 'Graded' }, { value: 'published', label: 'Published' }]} />}
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="clipboard-outline" title="No tests" text="Create tests on the website; enter marks here." />}
          ListFooterComponent={<Pager {...list.pager} />}
          ItemSeparatorComponent={() => <View style={s.divider} />}
          renderItem={({ item: t }) => (
            <ListItem icon="clipboard-outline" title={`${t.subject}${t.topic ? ` · ${t.topic}` : ''}`}
              subtitle={`${t.batch?.name ?? '—'} · ${fmtDate(t.date)} · ${t.entered}/${t.students} entered${t.avg != null ? ` · avg ${t.avg}%` : ''}`}
              right={<Badge tone={TONE[t.status]}>{t.status === 'scheduled' ? 'Marks due' : t.status}</Badge>}
              onPress={() => router.push({ pathname: '/test/[id]', params: { id: t._id } })} />
          )}
        />
      )}
    </View>
  );
}
