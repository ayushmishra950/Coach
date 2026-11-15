import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { errMsg, post } from './api';
import { fmtClock, fmtMins, fmtTime } from './format';
import { useFetch } from './useFetch';
import { Badge, Banner, Button, C, Card, Icon, P, Row } from './ui';

interface Today {
  date: string;
  row: { checkIn?: string; checkOut?: string; minutes?: number; late?: boolean; lateBy?: number; earlyLeave?: boolean; status: string } | null;
  missedCheckout: { date: string } | null;
  settings: { startTime: string; endTime: string; graceMins: number; captureLocation: boolean };
  serverTime: string;
}

async function currentGeo() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? undefined };
  } catch {
    return null;
  }
}

/** Teacher's one-tap check-in / check-out (time comes from the server clock). */
export function CheckInCard() {
  const { data, setData, error, reload } = useFetch<Today>('/staff-attendance/me/today');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useMemo(() => (data ? new Date(data.serverTime).getTime() - Date.now() : 0), [data]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (error) return <Banner tone="red" icon="alert-circle">{error}</Banner>;
  if (!data) return null;
  const r = data.row;
  const inside = !!r?.checkIn && !r.checkOut;
  const live = inside ? Math.max(0, Math.round((now + offset - new Date(r!.checkIn!).getTime()) / 60000)) : r?.minutes ?? 0;

  const act = async (kind: 'in' | 'out') => {
    setBusy(true);
    try {
      const geo = data.settings.captureLocation ? await currentGeo() : null;
      const row = await post<Today['row']>(kind === 'in' ? '/staff-attendance/check-in' : '/staff-attendance/check-out', geo ? { geo } : {});
      setData({ ...data, row, serverTime: new Date().toISOString() });
      setNow(Date.now());
      if (kind === 'in' && row?.late) Alert.alert('Checked in', `${fmtClock(row.checkIn)} — ${row.lateBy} min late`);
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ backgroundColor: !r?.checkIn ? C.brand : inside ? C.greenSoft : '#fff', borderColor: 'transparent' }}>
      <Row>
        <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: !r?.checkIn ? 'rgba(255,255,255,0.2)' : '#fff' }}>
          <Icon name={!r?.checkIn ? 'log-in-outline' : inside ? 'timer-outline' : 'checkmark-done'} size={24} color={!r?.checkIn ? '#fff' : inside ? C.green : C.sub} />
        </View>
        <View style={{ flex: 1 }}>
          {!r?.checkIn ? (
            <>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{r?.status === 'leave' ? 'Marked on leave today' : 'Not checked in yet'}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5 }}>Work starts {fmtTime(data.settings.startTime)}{data.settings.graceMins ? ` (+${data.settings.graceMins} min grace)` : ''}</Text>
            </>
          ) : inside ? (
            <>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>Working · {fmtMins(live)}</Text>
              <P small>In at {fmtClock(r.checkIn)} · day ends {fmtTime(data.settings.endTime)}</P>
            </>
          ) : (
            <>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>Done for today · {fmtMins(r.minutes)}</Text>
              <P small>{fmtClock(r.checkIn)} → {fmtClock(r.checkOut)}</P>
            </>
          )}
        </View>
      </Row>
      {(r?.late || r?.earlyLeave) && (
        <Row style={{ marginTop: 8 }}>
          {r?.late ? <Badge tone="amber">Late by {r.lateBy} min</Badge> : null}
          {r?.earlyLeave ? <Badge tone="amber">Left early</Badge> : null}
        </Row>
      )}
      {!r?.checkOut && (
        <Button title={inside ? 'Check out' : 'Check in'} icon={inside ? 'log-out-outline' : 'log-in-outline'} variant={inside ? 'danger' : 'secondary'} onPress={() => act(inside ? 'out' : 'in')} loading={busy} style={{ marginTop: 12 }} />
      )}
      {data.settings.captureLocation && !r?.checkOut ? <P small style={{ marginTop: 6, color: !r?.checkIn ? 'rgba(255,255,255,0.8)' : C.sub }}>📍 Your location is recorded with check-in / check-out.</P> : null}
      {data.missedCheckout ? <P small style={{ marginTop: 6, color: !r?.checkIn ? '#fde68a' : C.amber }}>You didn't check out on {data.missedCheckout.date}. Ask the owner to correct it.</P> : null}
    </Card>
  );
}
