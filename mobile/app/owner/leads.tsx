import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, View } from 'react-native';
import { errMsg, post } from '../../src/api';
import { fmtDate, telUrl, timeAgo, waUrl, ymd } from '../../src/format';
import { Pager } from '../../src/Pager';
import { usePaged, usePoll } from '../../src/useFetch';
import { Badge, Button, C, Chips, Empty, ErrorView, Input, ListItem, Loading, Row, Sheet, s } from '../../src/ui';
import { leadStatus, type Lead } from '../../src/leads';

type Filter = 'open' | 'contacted' | 'demo_scheduled' | 'demo_done' | 'converted' | 'lost' | 'all';

export default function OwnerLeads() {
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const list = usePaged<Lead>('/leads', { status: filter === 'all' ? undefined : filter, search: q || undefined });
  // Website enquiries / demo bookings show up within 30 s while this screen is open.
  usePoll(() => list.reload());
  const [add, setAdd] = useState(false);

  return (
    <View style={s.screen}>
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          ListHeaderComponent={
            <View>
              <Button title="Add enquiry" icon="person-add" onPress={() => setAdd(true)} style={{ marginBottom: 12 }} />
              <Input placeholder="Search name or phone…" value={search} onChangeText={setSearch} onSubmitEditing={() => setQ(search.trim())} onEndEditing={() => setQ(search.trim())} returnKeyType="search" />
              <Chips value={filter} onChange={setFilter} options={[
                { value: 'open', label: 'Active' },
                { value: 'contacted', label: 'Contacted' }, { value: 'demo_scheduled', label: 'Demo' }, { value: 'demo_done', label: 'Demo done' }, { value: 'converted', label: 'Admitted' }, { value: 'lost', label: 'Lost' }, { value: 'all', label: 'All' },
              ]} />
            </View>
          }
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="person-add-outline" title="No enquiries here" text="Website enquiries and demo bookings appear here automatically." />}
          ListFooterComponent={<Pager {...list.pager} />}
          ItemSeparatorComponent={() => <View style={s.divider} />}
          renderItem={({ item: l }) => {
            const st = leadStatus(l.status);
            const due = !!l.followUpAt && !['converted', 'lost'].includes(l.status) && new Date(l.followUpAt) < new Date(new Date().setHours(24, 0, 0, 0));
            return (
              <ListItem
                title={`${l.name}${l.studentName ? ` · ${l.studentName}` : ''}`}
                subtitle={`${[l.courseName, l.studentClass].filter(Boolean).join(' · ') || l.phone} · ${l.followUpAt && !['converted', 'lost'].includes(l.status) ? `follow up ${fmtDate(l.followUpAt, false)}` : timeAgo(l.createdAt)}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Badge tone={due ? 'red' : st.tone}>{due ? 'Follow up' : st.label}</Badge>
                    <Row style={{ gap: 4 }}>
                      <Button small title="" icon="call" variant="secondary" onPress={() => Linking.openURL(telUrl(l.phone))} />
                      <Button small title="" icon="logo-whatsapp" variant="success" onPress={() => Linking.openURL(waUrl(l.phone, `Namaste ${l.name.split(' ')[0]}, `))} />
                    </Row>
                  </View>
                }
                onPress={() => router.push({ pathname: '/lead/[id]', params: { id: l._id } })}
              />
            );
          }}
        />
      )}
      <AddLead open={add} onClose={() => setAdd(false)} onSaved={(id) => { setAdd(false); list.reload(); router.push({ pathname: '/lead/[id]', params: { id } }); }} />
    </View>
  );
}

type Src = 'walk_in' | 'phone' | 'whatsapp' | 'referral';

function AddLead({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState<{ name: string; phone: string; studentName: string; studentClass: string; note: string; source: Src }>({ name: '', phone: '', studentName: '', studentClass: '', note: '', source: 'walk_in' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const l = await post<Lead>('/leads', { ...f, followUpAt: ymd() });
      setF({ name: '', phone: '', studentName: '', studentClass: '', note: '', source: 'walk_in' });
      onSaved(l._id);
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New enquiry">
      <Input label="Parent / enquirer name *" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <Input label="Phone *" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" />
      <Input label="Student name" value={f.studentName} onChangeText={(v) => setF({ ...f, studentName: v })} />
      <Input label="Class" value={f.studentClass} onChangeText={(v) => setF({ ...f, studentClass: v })} placeholder="e.g. Class 10" />
      <Chips<Src> value={f.source} onChange={(v) => setF({ ...f, source: v })} options={[
        { value: 'walk_in', label: 'Walk-in' }, { value: 'phone', label: 'Phone call' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'referral', label: 'Referral' },
      ]} />
      <Input label="Note" value={f.note} onChangeText={(v) => setF({ ...f, note: v })} multiline />
      <Button title="Save enquiry" icon="checkmark" onPress={save} loading={busy} />
    </Sheet>
  );
}

