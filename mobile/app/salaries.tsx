import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { errMsg, post } from '../src/api';
import { fmtDate, inr } from '../src/format';
import { Pager, useClientPage } from '../src/Pager';
import { useFetch } from '../src/useFetch';
import { Badge, Banner, Button, C, Card, Chips, ErrorView, Grid, Input, Loading, P, Row, Screen, Sheet, Stat } from '../src/ui';

interface Sal { _id: string; teacherId: { _id: string; name: string } | null; month: string; amount: number; paidAmount: number; dueDate: string; status: 'pending' | 'partial' | 'paid'; bonus?: number; deduction?: number; leaveDays?: number; leaveDeduction?: number }
interface Sheet_ { month: string; label: string; dueDate: string; items: Sal[]; summary: { count: number; total: number; paid: number; pending: number; paidCount: number }; overdue: { count: number; amount: number }; months: string[] }

/** Owner: monthly teacher salaries — see dues and record payments. */
export default function Salaries() {
  const [month, setMonth] = useState<string | undefined>();
  const { data, error, loading, refreshing, onRefresh, reload } = useFetch<Sheet_>('/salaries', { month });
  const [pay, setPay] = useState<Sal | null>(null);
  const page = useClientPage(data?.items, data?.month);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const d = data!;
  const today = new Date(new Date().toDateString()).getTime();
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: 'Teacher salaries' }} />
      {d.overdue.count > 0 && <Banner tone="red" icon="alert-circle">{inr(d.overdue.amount)} overdue across {d.overdue.count} salar{d.overdue.count === 1 ? 'y' : 'ies'}</Banner>}
      <Chips value={d.month} onChange={(m) => setMonth(m)} options={d.months.slice(0, 8).map((m) => ({ value: m, label: m }))} />
      <Grid>
        <Stat label={`Payroll · ${d.label}`} value={inr(d.summary.total)} icon="cash-outline" />
        <Stat label="Pending" value={inr(d.summary.pending)} icon="hourglass-outline" tone="amber" hint={`Pay day ${fmtDate(d.dueDate, false)}`} />
      </Grid>
      <View style={{ height: 12 }} />
      {d.items.length === 0 ? <P>No salary sheet for this month. Create it on the website (Salaries).</P> : page.items.map((x) => {
        const left = x.amount - x.paidAmount;
        const overdue = x.status !== 'paid' && new Date(x.dueDate).getTime() < today;
        return (
          <Card key={x._id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{x.teacherId?.name ?? 'Teacher'}</Text>
                <P small>{inr(x.amount)}{x.bonus ? ` · +${inr(x.bonus)} bonus` : ''}{x.deduction ? ` · −${inr(x.deduction)}` : ''}{x.leaveDeduction ? ` · leave ${x.leaveDays}d −${inr(x.leaveDeduction)}` : ''} · due {fmtDate(x.dueDate, false)}</P>
              </View>
              {x.status === 'paid' ? <Badge tone="green">Paid</Badge> : <Button small title={`Pay ${inr(left)}`} variant={overdue ? 'danger' : 'primary'} onPress={() => setPay(x)} />}
            </Row>
          </Card>
        );
      })}
      {d.items.length > 0 && <Pager {...page.pager} />}
      <PaySheet sal={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); reload(); }} />
    </Screen>
  );
}

function PaySheet({ sal, onClose, onDone }: { sal: Sal | null; onClose: () => void; onDone: () => void }) {
  const left = sal ? sal.amount - sal.paidAmount : 0;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bank' | 'upi' | 'cash' | 'cheque'>('bank');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!sal) return;
    const n = Number(amount || left);
    if (!n || n <= 0 || n > left) return Alert.alert('Check the amount', `Up to ${inr(left)}`);
    setBusy(true);
    try {
      await post(`/salaries/${sal._id}/pay`, { amount: n, method });
      setAmount('');
      Alert.alert('Saved ✓', 'The teacher is notified that the salary was paid.');
      onDone();
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!sal} onClose={onClose} title={`Pay ${sal?.teacherId?.name ?? ''}`}>
      <Input label={`Amount (left ${inr(left)})`} keyboardType="number-pad" value={amount || (sal ? String(left) : '')} onChangeText={setAmount} />
      <Chips value={method} onChange={setMethod} options={[{ value: 'bank', label: 'Bank' }, { value: 'upi', label: 'UPI' }, { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }]} />
      <Button title="Save payment" icon="checkmark-circle" variant="success" onPress={save} loading={busy} />
    </Sheet>
  );
}
