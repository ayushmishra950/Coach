import { Stack, router } from 'expo-router';
import { Text } from 'react-native';
import { fmtTime } from '../../src/format';
import { useFetch } from '../../src/useFetch';
import { Card, Empty, ErrorView, ListItem, Loading, P, Screen, s } from '../../src/ui';

interface BatchOpt { _id: string; name: string; subject?: string; days: string[]; startTime: string; endTime: string; color?: string; active: boolean }
const TODAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

/** Pick a batch to mark attendance (today's batches first). */
export default function AttendanceBatches() {
  const { data, error, loading, refreshing, onRefresh } = useFetch<BatchOpt[]>('/batches/options', { active: 'true' });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const list = [...(data ?? [])].sort((a, b) => Number(b.days.includes(TODAY)) - Number(a.days.includes(TODAY)) || a.startTime.localeCompare(b.startTime));
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <P style={{ marginBottom: 12 }}>Tap a batch to mark today's attendance. Parents of absent students are informed automatically.</P>
      <Card style={{ paddingVertical: 4 }}>
        {list.length === 0 ? <Empty icon="checkbox-outline" title="No active batches" /> : list.map((b) => (
          <ListItem key={b._id} icon="people-outline" title={b.name}
            subtitle={`${b.days.join(', ')} · ${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`}
            right={b.days.includes(TODAY) ? <Text style={[s.badgeText, { color: '#059669' }]}>TODAY</Text> : undefined}
            onPress={() => router.push({ pathname: '/attendance/[batchId]', params: { batchId: b._id, name: b.name } })} />
        ))}
      </Card>
    </Screen>
  );
}
