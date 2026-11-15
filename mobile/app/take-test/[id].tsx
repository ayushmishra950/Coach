import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { errMsg, get, post, put } from '../../src/api';
import { Badge, Button, C, Card, ErrorView, Loading, P, Row, Screen } from '../../src/ui';

interface Started {
  test: { _id: string; subject: string; topic?: string; maxMarks: number; wrongPenalty: number };
  questions: { _id: string; text: string; options: string[]; marks: number }[];
  answers: (number | null)[];
  deadline: string;
  serverTime: string;
}
interface Review {
  test: { subject: string; topic?: string; maxMarks: number };
  score: number; correct: number; wrong: number;
  questions: { text: string; options: string[]; marks: number; yourAnswer: number | null; correct?: number; explanation?: string }[];
}

const LETTER = 'ABCDEFGH';

export default function TakeTest() {
  const { id, studentId, review } = useLocalSearchParams<{ id: string; studentId: string; review?: string }>();
  return review ? <ReviewView id={id} studentId={studentId} /> : <Attempt id={id} studentId={studentId} />;
}

function Attempt({ id, studentId }: { id: string; studentId: string }) {
  const [data, setData] = useState<Started | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const done = useRef(false);
  const dirty = useRef(false);
  const offset = useRef(0);
  const answersRef = useRef<(number | null)[]>([]);
  answersRef.current = answers;

  useEffect(() => {
    post<Started>(`/parent/online-tests/${id}/start`, { studentId })
      .then((r) => {
        offset.current = new Date(r.serverTime).getTime() - Date.now();
        setData(r);
        setAnswers(r.answers.length ? r.answers : r.questions.map(() => null));
      })
      .catch((e) => setError(errMsg(e)));
  }, [id, studentId]);

  const submit = useCallback(async (auto = false) => {
    if (done.current) return;
    done.current = true;
    setSubmitting(true);
    try {
      const r = await post<{ answered: number; total: number }>(`/parent/online-tests/${id}/submit`, { studentId, answers: answersRef.current });
      Alert.alert(auto ? "Time's up — submitted" : 'Submitted ✓', `${r.answered} of ${r.total} questions answered. Results appear after the teacher publishes them.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      done.current = false;
      Alert.alert('Could not submit', errMsg(e), [{ text: 'OK', onPress: () => { if (auto) router.back(); } }]);
    } finally {
      setSubmitting(false);
    }
  }, [id, studentId]);

  // Countdown on the server clock; auto-submit at zero.
  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const ms = new Date(data.deadline).getTime() - (Date.now() + offset.current);
      setLeft(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0) void submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data, submit]);

  // Autosave every 10 s when something changed.
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => {
      if (!dirty.current || done.current) return;
      dirty.current = false;
      put(`/parent/online-tests/${id}/answers`, { studentId, answers: answersRef.current }).catch(() => { dirty.current = true; });
    }, 10_000);
    return () => clearInterval(t);
  }, [data, id, studentId]);

  if (error) return <ErrorView message={error} onRetry={() => router.back()} />;
  if (!data) return <Loading />;
  const q = data.questions[i];
  const answered = answers.filter((a) => a !== null).length;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const choose = (k: number) => {
    setAnswers((a) => a.map((x, j) => (j === i ? (x === k ? null : k) : x)));
    dirty.current = true;
  };
  const confirmSubmit = () => Alert.alert('Submit test?', `${answered} of ${data.questions.length} answered. You can't change answers after submitting.`, [
    { text: 'Keep going', style: 'cancel' },
    { text: 'Submit', onPress: () => void submit() },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: data.test.subject, headerBackVisible: false, gestureEnabled: false }} />
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Badge tone={left < 60 ? 'red' : left < 300 ? 'amber' : 'brand'}>⏱ {mm}:{ss}</Badge>
        <P small bold>{answered}/{data.questions.length} answered</P>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {data.questions.map((_, j) => (
          <Pressable key={j} onPress={() => setI(j)} style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
            borderWidth: j === i ? 2 : 1, borderColor: j === i ? C.brand : C.border, backgroundColor: answers[j] !== null ? C.brandSoft : '#fff' }}>
            <Text style={{ fontWeight: '700', color: answers[j] !== null ? C.brand : C.sub }}>{j + 1}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <P small muted>Question {i + 1} · {q.marks} mark{q.marks > 1 ? 's' : ''}{data.test.wrongPenalty ? ` · −${data.test.wrongPenalty} for wrong` : ''}</P>
        <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginVertical: 10 }}>{q.text}</Text>
        {q.options.map((o, k) => {
          const on = answers[i] === k;
          return (
            <Pressable key={k} onPress={() => choose(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, marginBottom: 8,
              borderWidth: 1.5, borderColor: on ? C.brand : C.border, backgroundColor: on ? C.brandSoft : '#fff' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.brand : C.bg }}>
                <Text style={{ fontWeight: '800', color: on ? '#fff' : C.sub }}>{LETTER[k]}</Text>
              </View>
              <Text style={{ flex: 1, color: C.text }}>{o}</Text>
            </Pressable>
          );
        })}
        <P small muted>Tap a selected option again to clear it.</P>
      </Card>
      <Row style={{ marginTop: 12 }}>
        <Button title="Previous" variant="secondary" icon="chevron-back" onPress={() => setI(i - 1)} disabled={i === 0} style={{ flex: 1 }} />
        {i < data.questions.length - 1
          ? <Button title="Next" icon="chevron-forward" onPress={() => setI(i + 1)} style={{ flex: 1 }} />
          : <Button title="Submit" variant="success" icon="checkmark-done" onPress={confirmSubmit} loading={submitting} style={{ flex: 1 }} />}
      </Row>
      {i < data.questions.length - 1 && <Button title="Submit test" variant="ghost" onPress={confirmSubmit} loading={submitting} style={{ marginTop: 8 }} />}
    </Screen>
  );
}

function ReviewView({ id, studentId }: { id: string; studentId: string }) {
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Review>(`/parent/online-tests/${id}/review`, { studentId }).then(setData).catch((e) => setError(errMsg(e)));
  }, [id, studentId]);
  if (error) return <ErrorView message={error} onRetry={() => router.back()} />;
  if (!data) return <Loading />;
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: `${data.test.subject} — result` }} />
      <Card style={{ alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 30, fontWeight: '800', color: C.brand }}>{data.score}/{data.test.maxMarks}</Text>
        <P>{data.correct} correct · {data.wrong} wrong</P>
      </Card>
      {data.questions.map((q, j) => {
        const right = q.correct != null && q.yourAnswer === q.correct;
        return (
          <Card key={j} style={{ marginBottom: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <P small muted>Q{j + 1} · {q.marks} mark{q.marks > 1 ? 's' : ''}</P>
              {q.yourAnswer == null ? <Badge>Skipped</Badge> : q.correct == null ? null : <Badge tone={right ? 'green' : 'red'}>{right ? 'Correct' : 'Wrong'}</Badge>}
            </Row>
            <Text style={{ fontWeight: '600', color: C.text, marginVertical: 8 }}>{q.text}</Text>
            {q.options.map((o, k) => (
              <P key={k} small style={{ paddingVertical: 3, color: k === q.correct ? C.green : k === q.yourAnswer ? C.red : C.sub, fontWeight: k === q.correct || k === q.yourAnswer ? '700' : '400' }}>
                {LETTER[k]}. {o}{k === q.correct ? '  ✓' : k === q.yourAnswer ? '  (your answer)' : ''}
              </P>
            ))}
            {q.explanation ? <P small style={{ marginTop: 6, color: C.violet }}>💡 {q.explanation}</P> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
