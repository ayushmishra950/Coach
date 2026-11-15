import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { errMsg, post } from '../../src/api';
import { fmtDate, fmtDateTime } from '../../src/format';
import { Pager, useClientPage } from '../../src/Pager';
import { ChildPicker, useParent } from '../../src/parent';
import { useFetch } from '../../src/useFetch';
import { Badge, Card, Chips, Empty, ErrorView, H1, ListItem, Loading, P, Screen, type IconName, type Tone } from '../../src/ui';

interface OnlineTest {
  _id: string; subject: string; topic?: string; date: string; maxMarks: number; durationMins?: number; opensAt?: string; closesAt?: string;
  batch?: string; questionCount: number; window: 'upcoming' | 'open' | 'closed'; published: boolean;
  attempt: { startedAt: string; deadline: string; submittedAt?: string; score?: number } | null;
}
interface Material {
  _id: string; title: string; description?: string; subject?: string; kind: string; fileId?: string; fileName?: string; fileSize?: number; mime?: string; url?: string;
  dueDate?: string; uploadedByName?: string; createdAt: string; batchIds: { name: string }[];
}

const KIND_ICON: Record<string, IconName> = { notes: 'document-text-outline', assignment: 'create-outline', video: 'play-circle-outline', link: 'link-outline', dpp: 'list-outline' };

function testState(t: OnlineTest): { label: string; tone: Tone; canOpen: boolean } {
  if (t.attempt?.submittedAt) return t.published ? { label: `Score ${t.attempt.score ?? 0}/${t.maxMarks}`, tone: 'violet', canOpen: true } : { label: 'Submitted', tone: 'green', canOpen: false };
  if (t.attempt && t.window !== 'closed') return { label: 'Resume', tone: 'amber', canOpen: true };
  if (t.window === 'open') return { label: 'Start', tone: 'brand', canOpen: true };
  if (t.window === 'upcoming') return { label: 'Upcoming', tone: 'blue', canOpen: false };
  return { label: t.attempt ? 'Closed' : 'Missed', tone: 'gray', canOpen: false };
}

export default function ParentLearn() {
  const p = useParent();
  const [tab, setTab] = useState<'tests' | 'material'>('tests');
  const sid = p.child?.student._id;
  const tests = useFetch<OnlineTest[]>(sid && tab === 'tests' ? '/parent/online-tests' : null, { studentId: sid });
  const mats = useFetch<Material[]>(sid && tab === 'material' ? '/parent/materials' : null, { studentId: sid });
  const [opening, setOpening] = useState<string | null>(null);
  const testPage = useClientPage(tests.data, sid);
  const matPage = useClientPage(mats.data, sid);

  if (p.loading && !p.data) return <Loading />;
  if (p.error && !p.data) return <ErrorView message={p.error} onRetry={p.onRefresh} />;
  if (!p.child) return <Screen><Empty title="No student linked" /></Screen>;
  const cur = tab === 'tests' ? tests : mats;

  const open = async (m: Material) => {
    setOpening(m._id);
    try {
      if (m.fileId) {
        const { url } = await post<{ url: string }>(`/files/${m.fileId}/link`);
        await WebBrowser.openBrowserAsync(url);
      } else if (m.url) {
        await WebBrowser.openBrowserAsync(m.url);
      }
    } catch (e) {
      Alert.alert('Could not open', errMsg(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Screen refreshing={cur.refreshing} onRefresh={cur.onRefresh}>
      <H1>Study</H1>
      <P style={{ marginBottom: 12 }}>{p.child.student.name}</P>
      <ChildPicker children={p.children} value={sid} onChange={p.setChildId} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <Chips value={tab} onChange={setTab} options={[{ value: 'tests', label: 'Online tests' }, { value: 'material', label: 'Study material' }]} />
      </ScrollView>

      {cur.loading && !cur.data ? <Loading /> : cur.error && !cur.data ? <ErrorView message={cur.error} onRetry={cur.onRefresh} /> : tab === 'tests' ? (
        !tests.data?.length ? <Empty icon="clipboard-outline" title="No online tests" text="Tests from the teacher show up here." /> : (
          <Card>
            {testPage.items.map((t) => {
              const st = testState(t);
              return (
                <ListItem key={t._id} icon="clipboard-outline" title={`${t.subject}${t.topic ? ` · ${t.topic}` : ''}`}
                  subtitle={`${t.questionCount} Qs · ${t.maxMarks} marks${t.durationMins ? ` · ${t.durationMins} min` : ''}\n${t.window === 'upcoming' && t.opensAt ? `Opens ${fmtDateTime(t.opensAt)}` : t.closesAt ? `Closes ${fmtDateTime(t.closesAt)}` : fmtDate(t.date)}`}
                  right={<Badge tone={st.tone}>{st.label}</Badge>}
                  onPress={st.canOpen ? () => router.push({ pathname: '/take-test/[id]', params: { id: t._id, studentId: sid!, review: t.attempt?.submittedAt ? '1' : '' } }) : undefined} />
              );
            })}
            <Pager {...testPage.pager} />
          </Card>
        )
      ) : !mats.data?.length ? <Empty icon="book-outline" title="No study material yet" text="Notes, assignments and links from teachers show up here." /> : (
        <Card>
          {matPage.items.map((m) => (
            <ListItem key={m._id} icon={KIND_ICON[m.kind] ?? 'document-outline'} title={m.title}
              subtitle={[m.subject, m.batchIds?.map((b) => b.name).join(', '), m.dueDate ? `due ${fmtDate(m.dueDate, false)}` : fmtDate(m.createdAt, false), m.uploadedByName].filter(Boolean).join(' · ')}
              right={opening === m._id ? <Badge tone="blue">Opening…</Badge> : (m.fileId || m.url) ? <Badge tone="brand">{m.fileId ? 'Open' : 'Link'}</Badge> : undefined}
              onPress={(m.fileId || m.url) && !opening ? () => open(m) : undefined} />
          ))}
          <Pager {...matPage.pager} />
        </Card>
      )}
    </Screen>
  );
}
