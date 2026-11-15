import { router } from 'expo-router';
import { View } from 'react-native';
import { fmtDate } from '../../src/format';
import { Pager, useClientPage } from '../../src/Pager';
import { ChildPicker, useParent } from '../../src/parent';
import { Badge, Button, C, Card, Empty, ErrorView, H1, Loading, P, Progress, Row, Screen, pctColor } from '../../src/ui';

export default function ParentResults() {
  const { data, child, children, setChildId, error, loading, refreshing, onRefresh } = useParent();
  const page = useClientPage(child?.results, child?.student._id);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  if (!child) return <Screen><Empty title="No student linked" /></Screen>;
  const scored = child.results.filter((r) => r.pct != null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.pct as number), 0) / scored.length) : null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <H1>Results</H1>
      <P style={{ marginBottom: 12 }}>{child.student.name}{avg != null ? ` · average ${avg}%` : ''}</P>
      <ChildPicker children={children} value={child.student._id} onChange={setChildId} />
      <Button title="Full report card" icon="document-text-outline" variant="secondary"
        onPress={() => router.push({ pathname: '/report-card', params: { studentId: child.student._id } })} style={{ marginBottom: 12 }} />
      {child.results.length === 0 ? <Empty icon="trophy-outline" title="No results yet" text="Marks show up here once the teacher publishes them." /> : page.items.map((r) => {
        const pass = r.pct != null && r.pct >= r.passPercent;
        return (
          <Card key={r._id} style={{ marginBottom: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <P bold>{r.subject}{r.topic ? ` · ${r.topic}` : ''}</P>
                <P small muted>{fmtDate(r.date)}</P>
              </View>
              {r.absent ? <Badge tone="gray">Absent</Badge> : r.pct == null ? <Badge tone="gray">—</Badge> : (
                <View style={{ alignItems: 'flex-end' }}>
                  <P bold style={{ fontSize: 18, color: pctColor(r.pct) }}>{r.marks}/{r.maxMarks}</P>
                  <Badge tone={pass ? 'green' : 'red'}>{r.pct}% · {pass ? 'Pass' : 'Below pass'}</Badge>
                </View>
              )}
            </Row>
            {r.pct != null && (
              <View style={{ marginTop: 10 }}>
                <Progress value={r.pct} color={pctColor(r.pct)} />
                <P small style={{ marginTop: 4 }}>
                  {r.rank ? `Rank ${r.rank} of ${r.outOf}` : ''}{r.classAvgPct != null ? `${r.rank ? ' · ' : ''}Class average ${r.classAvgPct}%` : ''}
                </P>
              </View>
            )}
            {r.remark ? <P small style={{ marginTop: 6, color: C.violet }}>Teacher: {r.remark}</P> : null}
          </Card>
        );
      })}
      {child.results.length > 0 && <Pager {...page.pager} />}
    </Screen>
  );
}
