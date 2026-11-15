import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { errMsg, post, put } from '../../src/api';
import { addDays, fmtDate, fmtDateTime, telUrl, waUrl, ymd } from '../../src/format';
import { LEAD_STATUS, SOURCE_LABEL, leadStatus, type Lead } from '../../src/leads';
import { useFetch } from '../../src/useFetch';
import { Badge, Button, C, Card, Chips, ErrorView, H2, Input, Loading, P, Row, Screen } from '../../src/ui';

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lead, setData, error, loading, refreshing, onRefresh } = useFetch<Lead>(id ? `/leads/${id}` : null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading && !lead) return <Loading />;
  if (error && !lead) return <ErrorView message={error} onRetry={onRefresh} />;
  const l = lead!;
  const st = leadStatus(l.status);

  const update = async (body: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try {
      setData(await put<Lead>(`/leads/${l._id}`, body));
      if (msg) Alert.alert(msg);
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const r = await post<Lead>(`/leads/${l._id}/notes`, { text: note.trim() });
      setNote('');
      setData(r);
      if (r.status === 'new') setData(await put<Lead>(`/leads/${l._id}`, { status: 'contacted' }));
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const followIn = (days: number) => update({ followUpAt: ymd(addDays(new Date(), days)) }, `Follow-up set for ${fmtDate(addDays(new Date(), days))}`);
  const scheduleDemo = (days: number) => {
    const d = addDays(new Date(), days);
    d.setHours(17, 0, 0, 0);
    update({ status: 'demo_scheduled', demoAt: d.toISOString(), followUpAt: ymd(d) }, `Demo scheduled for ${fmtDateTime(d)}`);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: l.name }} />
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{l.name}</Text>
        <P>{l.phone}{l.email ? ` · ${l.email}` : ''}</P>
        <Row style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
          <Badge tone={st.tone}>{st.label}</Badge>
          {l.kind === 'demo' && <Badge tone="violet">Asked for demo</Badge>}
          <Badge>{SOURCE_LABEL[l.source] ?? l.source}</Badge>
        </Row>
        {(l.studentName || l.studentClass || l.courseName) ? <P style={{ marginTop: 8 }}>Student: <Text style={{ fontWeight: '700' }}>{[l.studentName, l.studentClass, l.courseName].filter(Boolean).join(' · ')}</Text></P> : null}
        {l.message ? <P style={{ marginTop: 6, fontStyle: 'italic' }}>“{l.message}”</P> : null}
        {l.demoAt && l.status === 'demo_scheduled' ? <P style={{ marginTop: 6 }}>Demo: <Text style={{ fontWeight: '700' }}>{fmtDateTime(l.demoAt)}</Text>{l.demoBatchId ? ` · ${l.demoBatchId.name}` : ''}</P> : null}
        {l.followUpAt && !['converted', 'lost'].includes(l.status) ? <P>Next follow-up: <Text style={{ fontWeight: '700' }}>{fmtDate(l.followUpAt)}</Text></P> : null}
        <Row style={{ marginTop: 12 }}>
          <Button small title="Call" icon="call" variant="secondary" onPress={() => Linking.openURL(telUrl(l.phone))} style={{ flex: 1 }} />
          <Button small title="WhatsApp" icon="logo-whatsapp" variant="success" onPress={() => Linking.openURL(waUrl(l.phone, `Namaste ${l.name.split(' ')[0]}, `))} style={{ flex: 1 }} />
        </Row>
      </Card>

      {l.status !== 'converted' && (
        <>
          <H2>Status</H2>
          <Chips value={l.status} onChange={(v) => v !== l.status && update({ status: v })} options={LEAD_STATUS.filter((x) => x.value !== 'converted').map((x) => ({ value: x.value, label: x.label }))} />
          <H2>Follow up</H2>
          <Row style={{ flexWrap: 'wrap' }}>
            {[[0, 'Today'], [1, 'Tomorrow'], [3, 'In 3 days'], [7, 'Next week']].map(([d, label]) => (
              <Button key={String(d)} small title={String(label)} variant="secondary" disabled={busy} onPress={() => followIn(Number(d))} />
            ))}
          </Row>
          <H2>Free demo class</H2>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button small title="Tomorrow 5 PM" icon="calendar" variant="secondary" disabled={busy} onPress={() => scheduleDemo(1)} />
            <Button small title="Day after, 5 PM" icon="calendar" variant="secondary" disabled={busy} onPress={() => scheduleDemo(2)} />
          </Row>
          <P small muted style={{ marginTop: 6 }}>Give admission (create the student with fees) from the website's Enquiries page.</P>
        </>
      )}

      <H2>Notes</H2>
      <Card>
        <Input placeholder="e.g. Called, will visit on Saturday" value={note} onChangeText={setNote} multiline />
        <Button small title="Add note" icon="add" onPress={addNote} loading={busy} disabled={!note.trim()} />
        <View style={{ marginTop: 12, gap: 10 }}>
          {[...l.notes].reverse().map((n, i) => (
            <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: C.brandSoft, paddingLeft: 10 }}>
              <P style={{ color: C.text }}>{n.text}</P>
              <P small muted>{n.by} · {fmtDateTime(n.at)}</P>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
