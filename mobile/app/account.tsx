import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { errMsg, getServer, put, setToken } from '../src/api';
import { useAuth } from '../src/auth';
import { Button, Card, H2, Input, P, Screen } from '../src/ui';

export default function Account() {
  const { session, logout } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (next.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    setBusy(true);
    try {
      const r = await put<{ token: string }>('/auth/password', { current: cur, next });
      await setToken(r.token); // this phone stays signed in; other devices are signed out
      setCur('');
      setNext('');
      Alert.alert('Password changed ✓', 'Other devices have been signed out.');
    } catch (e) {
      Alert.alert('Could not change', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const signOut = () => Alert.alert('Sign out?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
  ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'My account' }} />
      <Card>
        <P bold>{session?.user.name}</P>
        <P>{session?.user.email}</P>
        <P small muted style={{ textTransform: 'capitalize' }}>{session?.user.role} · {session?.institute?.name}</P>
      </Card>
      <H2>Change password</H2>
      <Card>
        <Input label="Current password" secureTextEntry value={cur} onChangeText={setCur} />
        <Input label="New password" secureTextEntry value={next} onChangeText={setNext} hint="At least 8 characters" />
        <Button title="Change password" icon="key" onPress={change} loading={busy} disabled={!cur || !next} />
      </Card>
      {session?.institute?.phone ? <Button title={`Call ${session.institute.name}`} icon="call" variant="secondary" onPress={() => Linking.openURL(`tel:${session.institute!.phone}`)} style={{ marginBottom: 12 }} /> : null}
      <Button title="Sign out" icon="log-out-outline" variant="danger" onPress={signOut} />
      <P small muted style={{ textAlign: 'center', marginTop: 16 }}>Server: {getServer()}</P>
    </Screen>
  );
}
