import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { fmtDate, fmtDateTime, fmtDay, greeting, inr, telUrl, timeAgo } from '../../src/format';
import { ChildPicker, useParent } from '../../src/parent';
import { Badge, Banner, C, Card, Empty, ErrorView, Grid, H1, H2, ListItem, Loading, P, Progress, Screen, Stat, pctColor } from '../../src/ui';

export default function ParentHome() {
  const { session } = useAuth();
  const { data, child, children, setChildId, error, loading, refreshing, onRefresh } = useParent();
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorView message={error} onRetry={onRefresh} />;
  const x = data!;
  if (!child) return <Screen><Empty icon="person-outline" title="No student linked" text="Ask the institute to link your child to this account." /></Screen>;
  const notices = [
    ...x.holidays.map((h) => ({ key: `h${h.date}`, date: h.date, title: h.name, tag: 'Holiday', tone: 'green' as const })),
    ...x.events.map((e) => ({ key: e._id, date: e.eventDate, title: e.title, tag: e.category ?? 'Event', tone: 'blue' as const })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <P muted>{greeting()}, {session?.user.name.split(' ')[0]}</P>
      <H1>{child.student.name}</H1>
      <P style={{ marginBottom: 12 }}>{[child.student.course, x.institute.name].filter(Boolean).join(' · ')}</P>
      <ChildPicker children={children} value={child.student._id} onChange={setChildId} />

      {child.fees.pending > 0 && (
        <Banner tone="amber" icon="wallet" onPress={() => router.push('/parent/fees')}>
          {inr(child.fees.pending)} fee pending{x.institute.onlinePay ? ' — tap to pay online' : ''}
        </Banner>
      )}
      {child.attendance.recent[0]?.status === 'absent' && (
        <Banner tone="red" icon="alert-circle">Marked absent on {fmtDay(child.attendance.recent[0].date)}{child.attendance.recent[0].batch ? ` (${child.attendance.recent[0].batch})` : ''}</Banner>
      )}

      <Grid>
        <Stat label="Attendance" value={child.attendance.total ? `${child.attendance.pct}%` : '—'} icon="checkbox-outline" tone={child.attendance.pct >= 75 ? 'green' : 'red'} hint={`${child.attendance.present}/${child.attendance.total} classes`} />
        <Stat label="Latest result" value={child.latestResult?.pct != null ? `${child.latestResult.pct}%` : child.latestResult?.absent ? 'Absent' : '—'} icon="trophy-outline" tone="violet"
          hint={child.latestResult ? child.latestResult.subject : undefined} onPress={() => router.push('/parent/results')} />
        <Stat label="Fees paid" value={inr(child.fees.paid)} icon="wallet-outline" tone="brand" hint={`of ${inr(child.fees.total)}`} onPress={() => router.push('/parent/fees')} />
        <Stat label="Next class" value={child.nextClass ? fmtDateTime(child.nextClass.at).split(',')[1]?.trim() ?? '—' : '—'} icon="time-outline" tone="amber"
          hint={child.nextClass ? `${child.nextClass.batch} · ${fmtDate(child.nextClass.at, false)}` : 'No upcoming class'} />
      </Grid>

      <H2>Recent attendance</H2>
      <Card>
        {child.attendance.recent.length === 0 ? <P>No attendance marked yet.</P> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {child.attendance.recent.slice(0, 21).map((r, i) => (
              <View key={i} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                backgroundColor: r.status === 'absent' ? C.redSoft : r.status === 'late' ? C.amberSoft : C.greenSoft }}>
                <P small bold style={{ color: r.status === 'absent' ? C.red : r.status === 'late' ? C.amber : C.green }}>{r.date.slice(8)}</P>
              </View>
            ))}
          </View>
        )}
      </Card>

      {notices.length > 0 && (
        <>
          <H2>Notice board</H2>
          <Card>
            {notices.map((n) => (
              <ListItem key={n.key} icon={n.tag === 'Holiday' ? 'sunny-outline' : 'calendar-outline'} title={n.title} subtitle={fmtDay(n.date)} right={<Badge tone={n.tone}>{n.tag}</Badge>} />
            ))}
          </Card>
        </>
      )}

      <H2>Batches & syllabus</H2>
      {child.batches.map((b) => (
        <Card key={b._id} style={{ marginBottom: 10 }}>
          <P bold>{b.name}</P>
          <P small>{[b.subject, b.days.join(', '), b.teacher].filter(Boolean).join(' · ')}</P>
          {b.syllabus ? (
            <View style={{ marginTop: 8 }}>
              <Progress value={Math.round((b.syllabus.done / b.syllabus.total) * 100)} color={pctColor(Math.round((b.syllabus.done / b.syllabus.total) * 100) + 20)} />
              <P small style={{ marginTop: 4 }}>{b.syllabus.done}/{b.syllabus.total} topics done{b.syllabus.next ? ` · next: ${b.syllabus.next}` : ''}</P>
            </View>
          ) : null}
        </Card>
      ))}

      <H2>Announcements</H2>
      <Card>
        {x.announcements.length === 0 ? <P>No announcements yet.</P> : x.announcements.map((a) => (
          <View key={a._id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <P bold>{a.pinned ? '📌 ' : ''}{a.title}</P>
            <P small>{a.body}</P>
            <P small muted>{timeAgo(a.createdAt)}</P>
          </View>
        ))}
      </Card>

      {x.institute.phone ? (
        <Card onPress={() => Linking.openURL(telUrl(x.institute.phone!))} style={{ marginTop: 12 }}>
          <ListItem icon="call-outline" title={`Call ${x.institute.name}`} subtitle={x.institute.phone} />
        </Card>
      ) : null}
    </Screen>
  );
}
