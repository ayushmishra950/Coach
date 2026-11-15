import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, RefreshControl, Text, View } from 'react-native';
import { errMsg, post } from '../../src/api';
import { CollectSheet, type Invoice } from '../../src/CollectSheet';
import { fmtDate, inr, inrShort, waUrl } from '../../src/format';
import { Pager } from '../../src/Pager';
import { useFetch, usePaged } from '../../src/useFetch';
import { Badge, Button, C, Card, Chips, Empty, ErrorView, Grid, ListItem, Loading, Row, Stat, s } from '../../src/ui';

interface Summary { total: number; collected: number; pending: number; overdue: number; overdueStudents: number; collectedThisMonth: number; paymentsThisMonth: number }
type Inv = Invoice & { studentId: { _id: string; name: string; studentCode: string; parentPhone?: string } | null; reminderCount?: number };
type Filter = 'overdue' | 'unpaid' | 'paid';

export default function OwnerFees() {
  const sum = useFetch<Summary>('/fees/summary');
  const [filter, setFilter] = useState<Filter>('overdue');
  const list = usePaged<Inv>('/fees/invoices', { status: filter });
  const [collect, setCollect] = useState<Inv | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const remind = async (inv: Inv) => {
    setBusy(inv._id);
    try {
      await post(`/fees/invoices/${inv._id}/remind`);
      Alert.alert('Reminder sent', `${inv.studentId?.name ?? 'Parent'} has been reminded.`);
      list.reload();
    } catch (e) {
      Alert.alert('Could not send', errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const remindAll = () => Alert.alert('Send reminders now?', 'Parents with installments due soon or overdue get a reminder (by your reminder settings).', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Send', onPress: async () => {
        try {
          const r = await post<{ sent: number }>('/fees/reminders/run');
          Alert.alert('Done', r.sent ? `${r.sent} reminder${r.sent === 1 ? '' : 's'} sent` : 'Nothing to remind about today');
        } catch (e) {
          Alert.alert('Could not send', errMsg(e));
        }
      },
    },
  ]);

  const header = (
    <View>
      {sum.data ? (
        <Grid>
          <Stat label="Collected this month" value={inrShort(sum.data.collectedThisMonth)} icon="trending-up" tone="green" hint={`${sum.data.paymentsThisMonth} payments`} />
          <Stat label="Overdue" value={inrShort(sum.data.overdue)} icon="alert-circle" tone="red" hint={`${sum.data.overdueStudents} students`} />
          <Stat label="Total pending" value={inrShort(sum.data.pending)} icon="hourglass" tone="amber" />
          <Stat label="Collected so far" value={inrShort(sum.data.collected)} icon="wallet" tone="brand" hint={`of ${inrShort(sum.data.total)}`} />
        </Grid>
      ) : sum.loading ? <ActivityIndicator color={C.brand} /> : null}
      <Button title="Send fee reminders now" icon="notifications" variant="secondary" onPress={remindAll} style={{ marginVertical: 12 }} />
      <Chips value={filter} onChange={setFilter} options={[{ value: 'overdue', label: 'Overdue' }, { value: 'unpaid', label: 'All unpaid' }, { value: 'paid', label: 'Paid' }]} />
    </View>
  );

  return (
    <View style={s.screen}>
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => { list.onRefresh(); sum.reload(); }} tintColor={C.brand} />}
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="checkmark-done-circle-outline" title={filter === 'overdue' ? 'No overdue fees 🎉' : 'Nothing here'} />}
          ListFooterComponent={<Pager {...list.pager} />}
          renderItem={({ item: inv }) => {
            const due = inv.amount - inv.paidAmount;
            return (
              <Card>
                <ListItem title={inv.studentId?.name ?? 'Student'} subtitle={`${inv.title} · due ${fmtDate(inv.dueDate)}${inv.reminderCount ? ` · reminded ${inv.reminderCount}×` : ''}`}
                  right={inv.status === 'paid' ? <Badge tone="green">Paid</Badge> : <Text style={{ fontWeight: '800', color: C.red }}>{inr(due)}</Text>}
                  onPress={inv.studentId ? () => router.push({ pathname: '/student/[id]', params: { id: inv.studentId!._id } }) : undefined} />
                {inv.status !== 'paid' && (
                  <Row>
                    <Button small title="Collect" icon="cash" onPress={() => setCollect(inv)} style={{ flex: 1 }} />
                    <Button small title="Remind" icon="notifications-outline" variant="secondary" loading={busy === inv._id} onPress={() => remind(inv)} style={{ flex: 1 }} />
                    {inv.studentId?.parentPhone ? (
                      <Button small title="" icon="logo-whatsapp" variant="success"
                        onPress={() => Linking.openURL(waUrl(inv.studentId!.parentPhone!, `Namaste, ${inv.studentId!.name}'s fee of ${inr(due)} (${inv.title}) was due on ${fmtDate(inv.dueDate)}. Kindly pay at the earliest.`))} />
                    ) : null}
                  </Row>
                )}
              </Card>
            );
          }}
        />
      )}
      <CollectSheet invoice={collect} onClose={() => setCollect(null)} onDone={() => { setCollect(null); list.reload(); sum.reload(); }} />
    </View>
  );
}
