import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { errMsg, post } from '../src/api';
import { useAuth } from '../src/auth';
import { addDays, fmtDate, timeAgo, ymd } from '../src/format';
import { Pager } from '../src/Pager';
import { useFetch, usePaged } from '../src/useFetch';
import { Badge, Button, C, Card, Chips, Empty, ErrorView, Input, Loading, P, Row, Sheet, s } from '../src/ui';

interface Ann { _id: string; title: string; body: string; pinned: boolean; staffOnly?: boolean; category?: string; eventDate?: string; createdByName?: string; createdAt: string; batchIds: { _id: string; name: string }[] }
type Cat = 'general' | 'holiday' | 'ptm' | 'extra_class' | 'exam' | 'event';
const CATS: { value: Cat; label: string }[] = [
  { value: 'general', label: '📢 Notice' }, { value: 'holiday', label: '🏖️ Holiday' }, { value: 'ptm', label: '🤝 PTM' },
  { value: 'extra_class', label: '➕ Extra class' }, { value: 'exam', label: '📝 Exam' }, { value: 'event', label: '🎉 Event' },
];

/** Owner / teacher: notice board — read and post (holiday, PTM, extra class…). */
export default function Announcements() {
  const { session } = useAuth();
  const list = usePaged<Ann>('/announcements');
  const [open, setOpen] = useState(false);
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Announcements' }} />
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          ListHeaderComponent={<Button title="New announcement" icon="megaphone" onPress={() => setOpen(true)} style={{ marginBottom: 12 }} />}
          ListFooterComponent={<Pager {...list.pager} />}
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="megaphone-outline" title="No announcements yet" />}
          renderItem={({ item: a }) => (
            <Card style={a.pinned ? { borderColor: '#fde68a', backgroundColor: '#fffbeb' } : undefined}>
              <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                {a.pinned && <Text>📌</Text>}
                <Text style={[s.itemTitle, { flex: 1 }]}>{a.title}</Text>
              </Row>
              <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {a.category && a.category !== 'general' && <Badge tone="violet">{CATS.find((c) => c.value === a.category)?.label ?? a.category}{a.eventDate ? ` · ${fmtDate(a.eventDate, false)}` : ''}</Badge>}
                {a.staffOnly && <Badge tone="amber">Staff only</Badge>}
                {a.batchIds?.length ? a.batchIds.map((b) => <Badge key={b._id} tone="brand">{b.name}</Badge>) : <Badge tone="green">Everyone</Badge>}
              </Row>
              <P style={{ marginTop: 6 }}>{a.body}</P>
              <P small muted>{a.createdByName ?? 'Staff'} · {timeAgo(a.createdAt)}</P>
            </Card>
          )}
        />
      )}
      <Composer open={open} isOwner={session?.user.role === 'owner'} onClose={() => setOpen(false)} onSent={() => { setOpen(false); list.reload(); }} />
    </View>
  );
}

function Composer({ open, isOwner, onClose, onSent }: { open: boolean; isOwner: boolean; onClose: () => void; onSent: () => void }) {
  const batches = useFetch<{ _id: string; name: string }[]>(open ? '/batches/options' : null, { active: 'true' });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cat, setCat] = useState<Cat>('general');
  const [when, setWhen] = useState(ymd(addDays(new Date(), 1)));
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) return Alert.alert('Add a title and a message');
    if (!isOwner && !sel.length) return Alert.alert('Pick at least one of your batches');
    if (cat !== 'general' && !/^\d{4}-\d{2}-\d{2}$/.test(when)) return Alert.alert('Enter the date as YYYY-MM-DD');
    setBusy(true);
    try {
      const r = await post<{ recipients: number }>('/announcements', { title: title.trim(), body: body.trim(), batchIds: sel, category: cat, eventDate: cat !== 'general' ? when : null });
      Alert.alert('Posted ✓', r.recipients ? `Sending to ${r.recipients} famil${r.recipients === 1 ? 'y' : 'ies'}.` : 'Posted.');
      setTitle('');
      setBody('');
      setSel([]);
      setCat('general');
      onSent();
    } catch (e) {
      Alert.alert('Could not post', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New announcement">
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Holiday on Monday" />
      <Input label="Message" value={body} onChangeText={setBody} multiline />
      <Chips value={cat} onChange={setCat} options={CATS} />
      {cat !== 'general' && <Input label="Date (YYYY-MM-DD)" value={when} onChangeText={setWhen} />}
      <P small muted style={{ marginBottom: 6 }}>{isOwner ? 'Send to everyone, or pick batches:' : 'Pick your batches:'}</P>
      <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {batches.data?.map((b) => {
          const on = sel.includes(b._id);
          return <Button key={b._id} small title={b.name} variant={on ? 'primary' : 'secondary'} onPress={() => setSel((x) => (on ? x.filter((y) => y !== b._id) : [...x, b._id]))} />;
        })}
      </Row>
      <Button title={isOwner && !sel.length ? 'Send to everyone' : 'Send'} icon="send" onPress={send} loading={busy} />
    </Sheet>
  );
}
