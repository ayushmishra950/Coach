import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { CollectSheet, type Invoice } from '../../src/CollectSheet';
import { useAuth } from '../../src/auth';
import { fmtDate, inr, telUrl, waUrl } from '../../src/format';
import { useFetch } from '../../src/useFetch';
import { Avatar, Badge, Button, C, Card, ErrorView, H2, ListItem, Loading, P, Progress, Row, Screen, pctColor } from '../../src/ui';

interface Detail {
  student: { _id: string; name: string; studentCode: string; phone?: string; parentName?: string; parentPhone?: string; course?: string; status: string; batches: { _id: string; name: string }[] };
  attendance: { pct: number; total: number; present: number; history: { date: string; batch?: string; status?: string }[] };
  scores: { avg: number | null; results: { _id: string; subject: string; topic?: string; date: string; marks: number | null; maxMarks: number; absent: boolean; pct?: number | null }[]; bySubject: { subject: string; avg: number }[] };
  fees: { total: number; paid: number; pending: number; invoices: Invoice[]; payments: { _id: string; amount: number; receiptNo: string; paidAt: string; method: string; status?: string }[] } | null;
}

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data, error, loading, refreshing, onRefresh, reload } = useFetch<Detail>(id ? `/students/${id}` : null);
  const [collect, setCollect] = useState<Invoice | null>(null);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const { student: st, attendance: att, scores, fees } = data!;
  const isOwner = session?.user.role === 'owner';
  const today = new Date(new Date().toDateString()).getTime();

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: st.name }} />
      <Card>
        <Row>
          <Avatar name={st.name} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: C.text }}>{st.name}</Text>
            <P small>{st.studentCode}{st.course ? ` · ${st.course}` : ''}</P>
            <P small>{st.batches.map((b) => b.name).join(', ') || 'No batch'}</P>
          </View>
          {st.status === 'inactive' && <Badge>Inactive</Badge>}
        </Row>
        {st.parentPhone ? (
          <Row style={{ marginTop: 14 }}>
            <Button small title={`Call ${st.parentName?.split(' ')[0] ?? 'parent'}`} icon="call" variant="secondary" onPress={() => Linking.openURL(telUrl(st.parentPhone!))} style={{ flex: 1 }} />
            <Button small title="WhatsApp" icon="logo-whatsapp" variant="success" onPress={() => Linking.openURL(waUrl(st.parentPhone!, `Namaste ${st.parentName ?? ''}, `))} style={{ flex: 1 }} />
          </Row>
        ) : null}
      </Card>

      <Row style={{ alignItems: 'stretch' }}>
        <Card style={{ flex: 1 }}>
          <P small muted>ATTENDANCE</P>
          <Text style={{ fontSize: 24, fontWeight: '800', color: pctColor(att.pct) }}>{att.total ? `${att.pct}%` : '—'}</Text>
          <P small>{att.present}/{att.total} classes</P>
        </Card>
        <Card style={{ flex: 1 }}>
          <P small muted>AVG SCORE</P>
          <Text style={{ fontSize: 24, fontWeight: '800', color: pctColor(scores.avg) }}>{scores.avg != null ? `${scores.avg}%` : '—'}</Text>
          <P small>{scores.results.length} tests</P>
        </Card>
      </Row>

      {isOwner && fees && (
        <>
          <H2>Fees</H2>
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <P>Paid <Text style={{ color: C.green, fontWeight: '800' }}>{inr(fees.paid)}</Text> of {inr(fees.total)}</P>
              {fees.pending > 0 && <Badge tone="amber">{inr(fees.pending)} due</Badge>}
            </Row>
            <Progress value={fees.total ? (fees.paid / fees.total) * 100 : 0} color={C.green} />
            {fees.invoices.map((inv) => {
              const due = inv.amount - inv.paidAmount;
              const overdue = inv.status !== 'paid' && new Date(inv.dueDate).getTime() < today;
              return (
                <ListItem key={inv._id} title={inv.title} subtitle={`${inr(inv.amount)} · due ${fmtDate(inv.dueDate)}`}
                  right={inv.status === 'paid' ? <Badge tone="green">Paid</Badge> : <Button small title={`Collect ${inr(due)}`} variant={overdue ? 'danger' : 'primary'} onPress={() => setCollect(inv)} />} />
              );
            })}
            {fees.invoices.length === 0 && <P style={{ marginTop: 8 }}>No fee installments yet. Add them on the website.</P>}
          </Card>
          {fees.payments.length > 0 && (
            <Card>
              <P small muted>RECEIPTS</P>
              {fees.payments.map((p) => (
                <ListItem key={p._id} icon="receipt-outline" title={`#${p.receiptNo}`} subtitle={`${fmtDate(p.paidAt)} · ${p.method.toUpperCase()}${p.status === 'void' ? ' · cancelled' : ''}`}
                  right={<Text style={{ fontWeight: '800', color: p.status === 'void' ? C.muted : C.text }}>{inr(p.amount)}</Text>}
                  onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: p._id } })} />
              ))}
            </Card>
          )}
        </>
      )}

      <H2>Recent results</H2>
      <Card>
        {scores.results.length === 0 ? <P>No results yet.</P> : scores.results.slice(0, 10).map((r) => {
          const pct = r.absent || r.marks == null ? null : Math.round((r.marks / r.maxMarks) * 100);
          return (
            <ListItem key={r._id} title={r.subject} subtitle={`${r.topic ? `${r.topic} · ` : ''}${fmtDate(r.date)}`}
              right={r.absent ? <Badge tone="red">Absent</Badge> : <Text style={{ fontWeight: '800', color: pctColor(pct) }}>{r.marks}/{r.maxMarks}</Text>} />
          );
        })}
      </Card>

      <H2>Attendance history</H2>
      <Card>
        {att.history.length === 0 ? <P>No attendance yet.</P> : att.history.slice(0, 15).map((h, i) => (
          <ListItem key={`${h.date}-${i}`} title={fmtDate(h.date)} subtitle={h.batch}
            right={<Badge tone={h.status === 'present' ? 'green' : h.status === 'late' ? 'amber' : 'red'}>{h.status ?? '—'}</Badge>} />
        ))}
      </Card>

      <CollectSheet invoice={collect} onClose={() => setCollect(null)} onDone={() => { setCollect(null); reload(); }} />
    </Screen>
  );
}
