import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errMsg, get, getServer, setServer } from '../src/api';
import { useAuth } from '../src/auth';
import { Banner, Button, C, Icon, Input, s } from '../src/ui';

export default function Login() {
  const { login, session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serverOpen, setServerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(getServer());
  const [check, setCheck] = useState<'idle' | 'ok' | 'fail' | 'checking'>('idle');

  useEffect(() => {
    if (session) router.replace('/');
  }, [session]);

  const testServer = async () => {
    setCheck('checking');
    await setServer(serverUrl);
    setServerUrl(getServer());
    try {
      await get('/health');
      setCheck('ok');
    } catch {
      setCheck('fail');
    }
  };

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) return setError('Enter your email and password');
    setBusy(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: C.brand }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ padding: 28, paddingTop: 40 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="school" size={30} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 16 }}>CoachFlow</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, marginTop: 4 }}>Owner · Teacher · Parent — sign in with the login your institute gave you.</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }}>
            {error ? <Banner tone="red" icon="alert-circle">{error}</Banner> : null}
            <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
            <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" onSubmitEditing={submit} returnKeyType="go" />
            <Button title="Sign in" onPress={submit} loading={busy} style={{ marginTop: 4 }} />

            <Pressable onPress={() => setServerOpen(!serverOpen)} style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="server-outline" size={16} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>Server: {getServer()}</Text>
              <Icon name={serverOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
            </Pressable>
            {serverOpen && (
              <View style={{ marginTop: 12 }}>
                <Input label="Server address" value={serverUrl} onChangeText={(t) => { setServerUrl(t); setCheck('idle'); }} autoCapitalize="none" keyboardType="url"
                  hint="Your institute's CoachFlow address, e.g. https://app.mycoaching.in — or http://<your PC's Wi-Fi IP>:4600 while testing." />
                <Button title={check === 'checking' ? 'Checking…' : 'Save & test connection'} variant="secondary" icon="wifi" onPress={testServer} loading={check === 'checking'} />
                {check === 'ok' && <Banner tone="green" icon="checkmark-circle">Connected to the server ✓</Banner>}
                {check === 'fail' && <Banner tone="red" icon="close-circle">Can't reach this address. Phone and PC must be on the same Wi-Fi, and the server must be running.</Banner>}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
