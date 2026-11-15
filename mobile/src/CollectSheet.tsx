import { useState } from 'react';
import { Alert } from 'react-native';
import { errMsg, post } from './api';
import { inr } from './format';
import { Button, Chips, Input, Sheet } from './ui';

export interface Invoice { _id: string; title: string; amount: number; paidAmount: number; dueDate: string; status: 'pending' | 'partial' | 'paid' }

/** Owner records a fee payment (cash / UPI / bank / card) against one installment → receipt. */
export function CollectSheet({ invoice, onClose, onDone }: { invoice: Invoice | null; onClose: () => void; onDone: () => void }) {
  const due = invoice ? invoice.amount - invoice.paidAmount : 0;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank' | 'card'>('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = invoice ? (amount || String(due)) : '';

  const save = async () => {
    if (!invoice) return;
    const n = Number(shown);
    if (!n || n <= 0 || n > due) return Alert.alert('Check the amount', `Enter between ₹1 and ${inr(due)}.`);
    setBusy(true);
    try {
      const p = await post<{ receiptNo: string }>('/fees/payments', { invoiceId: invoice._id, amount: n, method, reference: reference || undefined });
      Alert.alert('Payment saved ✓', `Receipt ${p.receiptNo}. The parent gets the receipt in their app.`);
      setAmount('');
      setReference('');
      onDone();
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!invoice} onClose={onClose} title={`Collect · ${invoice?.title ?? ''}`}>
      <Input label={`Amount (due ${inr(due)})`} keyboardType="number-pad" value={shown} onChangeText={setAmount} />
      <Chips value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank' }, { value: 'card', label: 'Card' }]} />
      {method !== 'cash' && <Input label="Reference / UTR (optional)" value={reference} onChangeText={setReference} />}
      <Button title="Save payment" icon="checkmark-circle" variant="success" onPress={save} loading={busy} />
    </Sheet>
  );
}
