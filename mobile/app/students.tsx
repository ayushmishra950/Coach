import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useAuth } from '../src/auth';
import { inr } from '../src/format';
import { Pager } from '../src/Pager';
import { usePaged } from '../src/useFetch';
import { Avatar, Badge, C, Chips, Empty, ErrorView, Input, ListItem, Loading, pctColor, s } from '../src/ui';

interface StudentRow {
  _id: string; name: string; studentCode: string; parentName?: string; parentPhone?: string; status: string;
  batches: { _id: string; name: string }[]; attendancePct: number | null; avgScore: number | null;
  fees: { pending: number; overdue: number } | null;
}

/** Students list (owner: all; teacher: their batches). Shared by the owner tab and the teacher "More" menu. */
export default function Students() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const list = usePaged<StudentRow>('/students', { search: q || undefined, status: status === 'all' ? undefined : status });
  const isOwner = session?.user.role === 'owner';

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Students' }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Input placeholder="Search name, code, parent phone…" value={search} onChangeText={setSearch} onSubmitEditing={() => setQ(search.trim())} returnKeyType="search"
          onEndEditing={() => setQ(search.trim())} />
        <Chips value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
      </View>
      {list.loading && !list.items.length ? <Loading /> : list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          ListHeaderComponent={<Text style={[s.itemSub, { marginBottom: 6 }]}>{list.total} student{list.total === 1 ? '' : 's'}</Text>}
          ListEmptyComponent={<Empty icon="people-outline" title="No students found" />}
          ListFooterComponent={<Pager {...list.pager} />}
          ItemSeparatorComponent={() => <View style={s.divider} />}
          renderItem={({ item: st }) => (
            <ListItem
              left={<Avatar name={st.name} />}
              title={st.name}
              subtitle={`${st.studentCode}${st.batches?.length ? ` · ${st.batches.map((b) => b.name).join(', ')}` : ''}`}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {st.attendancePct != null && <Text style={{ fontSize: 12, fontWeight: '800', color: pctColor(st.attendancePct) }}>{st.attendancePct}% att.</Text>}
                  {isOwner && st.fees && st.fees.pending > 0 ? <Badge tone={st.fees.overdue > 0 ? 'red' : 'amber'}>{inr(st.fees.pending)} due</Badge> : null}
                  {st.status === 'inactive' && <Badge>Inactive</Badge>}
                </View>
              }
              onPress={() => router.push({ pathname: '/student/[id]', params: { id: st._id } })}
            />
          )}
        />
      )}
    </View>
  );
}
