import { Stack, useLocalSearchParams } from 'expo-router';
import { Share, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { fmtDate, fmtDateTime, inr } from '../../src/format';
import { useFetch } from '../../src/useFetch';
import { Badge, Button, C, Card, ErrorView, Loading, P, Row, Screen } from '../../src/ui';

interface Receipt {
  payment: {
    _id: string; receiptNo: string; amount: number; method: string; reference?: string; paidAt: string; status?: string; voidReason?: string; balanceAfter?: number; note?: string;
    studentId: { name: string; studentCode?: string; course?: string; parentName?: string } | null;
    invoiceId: { title: string; amount: number; paidAmount: number; dueDate: string } | null;
    collectedBy?: { name: string } | null;
  };
  institute: { name: string; phone?: string; email?: string; address?: string; city?: string; gstin?: string; brandColor?: string };
}

/** One fee receipt — parent sees their own child's, staff see any in the institute. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const path = session?.user.role === 'parent' ? `/parent/receipt/${id}` : `/fees/payments/${id}`;
  const { data, error, loading, onRefresh } = useFetch<Receipt>(id ? path : null);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const { payment: p, institute: i } = data!;
  const voided = p.status === 'void';
  const line = (k: string, v?: string | number | null) => (v == null || v === '' ? null : (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <P muted>{k}</P><P bold style={{ flexShrink: 1, textAlign: 'right' }}>{String(v)}</P>
    </Row>
  ));
  const share = () => Share.share({
    message: `${i.name}\nFee receipt #${p.receiptNo}\n${p.studentId?.name ?? ''}${p.invoiceId ? ` · ${p.invoiceId.title}` : ''}\nAmount: ${inr(p.amount)} (${p.method.toUpperCase()})\nDate: ${fmtDateTime(p.paidAt)}${voided ? '\nCANCELLED' : ''}`,
  });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: `Receipt #${p.receiptNo}` }} />
      <Card>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: i.brandColor || C.brand }}>{i.name}</Text>
          <P small muted>{[i.address, i.city].filter(Boolean).join(', ')}</P>
          <P small muted>{[i.phone, i.email].filter(Boolean).join(' · ')}</P>
          {i.gstin ? <P small muted>GSTIN {i.gstin}</P> : null}
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 14, backgroundColor: voided ? C.redSoft : C.greenSoft, borderRadius: 12, marginBottom: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: voided ? C.red : C.green, textDecorationLine: voided ? 'line-through' : 'none' }}>{inr(p.amount)}</Text>
          {voided ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Received</Badge>}
        </View>
        {line('Receipt no.', p.receiptNo)}
        {line('Date', fmtDateTime(p.paidAt))}
        {line('Student', p.studentId ? `${p.studentId.name}${p.studentId.studentCode ? ` (${p.studentId.studentCode})` : ''}` : null)}
        {line('Course', p.studentId?.course)}
        {line('For', p.invoiceId?.title)}
        {line('Due date', p.invoiceId ? fmtDate(p.invoiceId.dueDate) : null)}
        {line('Mode', p.method.toUpperCase())}
        {line('Reference', p.reference)}
        {line('Balance after this', p.balanceAfter != null ? inr(p.balanceAfter) : null)}
        {line('Collected by', p.collectedBy?.name)}
        {voided ? line('Cancel reason', p.voidReason) : null}
      </Card>
      <Button title="Share receipt" icon="share-social-outline" variant="secondary" onPress={share} style={{ marginTop: 12 }} />
    </Screen>
  );
}
