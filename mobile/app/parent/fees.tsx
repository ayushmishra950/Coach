import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { errMsg, post } from '../../src/api';
import { fmtDate, inr } from '../../src/format';
import { Pager, useClientPage } from '../../src/Pager';
import { ChildPicker, useParent } from '../../src/parent';
import { Badge, Banner, Button, C, Card, Empty, ErrorView, Grid, H1, H2, ListItem, Loading, P, Row, Screen, Stat } from '../../src/ui';

export default function ParentFees() {
  const { data, child, children, setChildId, error, loading, refreshing, onRefresh, reload } = useParent();
  const [paying, setPaying] = useState<string | null>(null);
  const invPage = useClientPage(child?.fees.invoices, child?.student._id);
  const payPage = useClientPage(child?.fees.payments, child?.student._id);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  if (!child) return <Screen><Empty title="No student linked" /></Screen>;
  const gateway = data!.institute.gateway;
  const today = new Date().toISOString().slice(0, 10);

  const pay = async (invoiceId: string, due: number) => {
    setPaying(invoiceId);
    try {
      if (gateway === 'razorpay') {
        const { url, returnUrl } = await post<{ url: string; returnUrl: string }>('/parent/pay/link', { invoiceId });
        const r = await WebBrowser.openAuthSessionAsync(url, returnUrl);
        if (r.type === 'success' && r.url.includes('receipt=')) Alert.alert('Payment received ✓', 'Your receipt is ready below.');
        reload();
      } else if (gateway === 'demo') {
        await new Promise<void>((resolve, reject) => Alert.alert('Demo payment', `Pay ${inr(due)}? (test mode — no real money)`, [
          { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
          { text: 'Pay', onPress: () => resolve() },
        ]));
        await post('/parent/pay', { invoiceId });
        Alert.alert('Payment received ✓', 'Your receipt is ready below.');
        reload();
      }
    } catch (e) {
      if (errMsg(e) !== 'cancelled') Alert.alert('Payment failed', errMsg(e));
    } finally {
      setPaying(null);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <H1>Fees</H1>
      <P style={{ marginBottom: 12 }}>{child.student.name}</P>
      <ChildPicker children={children} value={child.student._id} onChange={setChildId} />
      <Grid>
        <Stat label="Total" value={inr(child.fees.total)} icon="receipt-outline" />
        <Stat label="Paid" value={inr(child.fees.paid)} icon="checkmark-circle-outline" tone="green" />
        <Stat label="Pending" value={inr(child.fees.pending)} icon="time-outline" tone={child.fees.pending > 0 ? 'red' : 'green'} />
      </Grid>
      {child.fees.pending > 0 && !gateway && <Banner tone="blue" icon="information-circle">Online payment isn't enabled by the institute yet. Please pay at the office.</Banner>}
      {gateway === 'demo' && <Banner tone="amber" icon="flask">Test mode: payments here are simulated.</Banner>}

      <H2>Installments</H2>
      <Card>
        {child.fees.invoices.length === 0 ? <P>No fees added yet.</P> : invPage.items.map((inv) => {
          const due = inv.amount - inv.paidAmount;
          const overdue = due > 0 && inv.dueDate.slice(0, 10) < today;
          return (
            <View key={inv._id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <P bold>{inv.title}</P>
                  <P small muted>Due {fmtDate(inv.dueDate)} · {inr(inv.amount)}</P>
                </View>
                {due <= 0 ? <Badge tone="green">Paid</Badge> : <Badge tone={overdue ? 'red' : 'amber'}>{overdue ? 'Overdue' : 'Due'} {inr(due)}</Badge>}
              </Row>
              {due > 0 && gateway ? (
                <Button title={`Pay ${inr(due)}`} icon="card-outline" small onPress={() => pay(inv._id, due)} loading={paying === inv._id} disabled={!!paying} style={{ marginTop: 8 }} />
              ) : null}
            </View>
          );
        })}
        {child.fees.invoices.length > 0 && <Pager {...invPage.pager} />}
      </Card>

      <H2>Receipts</H2>
      <Card>
        {child.fees.payments.length === 0 ? <P>No payments yet.</P> : payPage.items.map((p) => (
          <ListItem key={p._id} icon="receipt-outline" title={`#${p.receiptNo}`} subtitle={`${fmtDate(p.paidAt)} · ${p.method.toUpperCase()}${p.status === 'void' ? ' · cancelled' : ''}`}
            right={<Text style={{ fontWeight: '800', color: p.status === 'void' ? C.muted : C.text }}>{inr(p.amount)}</Text>}
            onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: p._id } })} />
        ))}
        {child.fees.payments.length > 0 && <Pager {...payPage.pager} />}
      </Card>
    </Screen>
  );
}
