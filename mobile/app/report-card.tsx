import { Stack, useLocalSearchParams } from 'expo-router';
import { Share, View } from 'react-native';
import { useAuth } from '../src/auth';
import { fmtDate } from '../src/format';
import { useFetch } from '../src/useFetch';
import { Badge, Button, C, Card, ErrorView, Grid, H2, ListItem, Loading, P, Progress, Screen, Stat, pctColor } from '../src/ui';

interface ReportCard {
  student: { name: string; studentCode?: string; course?: string; parentName?: string };
  institute: { name: string; phone?: string; address?: string; city?: string; brandColor?: string };
  overall: number | null;
  attendance: { total: number; present: number; pct: number | null };
  subjects: { subject: string; tests: number; avg: number; best: number }[];
  tests: { _id: string; subject: string; topic?: string; date: string; maxMarks: number; marks: number | null; absent: boolean; pct: number | null; classAvgPct: number | null; highest: number | null; rank: number | null; outOf: number; passPercent: number }[];
  generatedAt: string;
}

export default function ReportCardScreen() {
  const params = useLocalSearchParams<{ studentId?: string }>();
  const { session, childId } = useAuth();
  const studentId = params.studentId || childId || session?.user.studentIds[0];
  const { data, error, loading, onRefresh } = useFetch<ReportCard>(studentId ? '/parent/report-card' : null, { studentId });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  if (!data) return <Loading />;
  const r = data;
  const share = () => Share.share({
    message: `${r.institute.name} — Report card\n${r.student.name}${r.student.course ? ` (${r.student.course})` : ''}\nOverall: ${r.overall ?? '—'}%\nAttendance: ${r.attendance.pct ?? '—'}%\n\n${r.subjects.map((x) => `${x.subject}: avg ${x.avg}% (best ${x.best}%)`).join('\n')}`,
  });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Report card' }} />
      <Card>
        <P bold style={{ fontSize: 18, color: r.institute.brandColor || C.brand }}>{r.institute.name}</P>
        <P>{r.student.name}{r.student.studentCode ? ` · ${r.student.studentCode}` : ''}</P>
        <P small muted>{[r.student.course, r.student.parentName && `Parent: ${r.student.parentName}`].filter(Boolean).join(' · ')}</P>
        <P small muted>Generated {fmtDate(r.generatedAt)}</P>
      </Card>
      <View style={{ height: 12 }} />
      <Grid>
        <Stat label="Overall" value={r.overall != null ? `${r.overall}%` : '—'} icon="ribbon-outline" tone="violet" />
        <Stat label="Attendance" value={r.attendance.pct != null ? `${r.attendance.pct}%` : '—'} icon="checkbox-outline" tone="green" hint={`${r.attendance.present}/${r.attendance.total}`} />
      </Grid>

      <H2>Subjects</H2>
      <Card>
        {r.subjects.length === 0 ? <P>No published results yet.</P> : r.subjects.map((x) => (
          <View key={x.subject} style={{ paddingVertical: 8 }}>
            <P bold>{x.subject} <P small muted>· {x.tests} test{x.tests > 1 ? 's' : ''} · best {x.best}%</P></P>
            <Progress value={x.avg} color={pctColor(x.avg)} />
            <P small>Average {x.avg}%</P>
          </View>
        ))}
      </Card>

      <H2>All tests</H2>
      <Card>
        {r.tests.map((t) => (
          <ListItem key={t._id} title={`${t.subject}${t.topic ? ` · ${t.topic}` : ''}`}
            subtitle={`${fmtDate(t.date)}${t.rank ? ` · rank ${t.rank}/${t.outOf}` : ''}${t.classAvgPct != null ? ` · class avg ${t.classAvgPct}%` : ''}${t.highest != null ? ` · top ${t.highest}` : ''}`}
            right={t.absent ? <Badge>Absent</Badge> : <Badge tone={t.pct != null && t.pct >= t.passPercent ? 'green' : 'red'}>{t.marks ?? '—'}/{t.maxMarks}</Badge>} />
        ))}
      </Card>
      <Button title="Share" icon="share-social-outline" variant="secondary" onPress={share} style={{ marginTop: 12 }} />
    </Screen>
  );
}
