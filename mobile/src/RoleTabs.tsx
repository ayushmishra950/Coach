import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useAuth, type Role } from './auth';
import { C, Loading, type IconName } from './ui';

/** Bottom tabs for one role; anyone else is sent back to their own home. */
export function RoleTabs({ role, tabs }: { role: Role; tabs: { name: string; title: string; icon: IconName }[] }) {
  const { ready, session } = useAuth();
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (session.user.role !== role) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '800', color: C.text },
        headerShadowVisible: false,
      }}>
      {tabs.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{
          title: t.title,
          tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color} size={size} />,
        }} />
      ))}
    </Tabs>
  );
}
