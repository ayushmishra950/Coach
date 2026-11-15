import { router, type Href } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { useAuth } from './auth';
import { Avatar, C, Card, ListItem, P, Screen, s, type IconName } from './ui';

export interface MenuItem { icon: IconName; title: string; subtitle?: string; href?: Href; url?: string; onPress?: () => void }

/** The "More" tab: profile card + list of screens. */
export function MenuScreen({ sections }: { sections: { title: string; items: MenuItem[] }[] }) {
  const { session } = useAuth();
  return (
    <Screen>
      <Card onPress={() => router.push('/account')}>
        <View style={s.row}>
          <Avatar name={session?.user.name ?? '?'} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle}>{session?.user.name}</Text>
            <P small>{session?.user.email}</P>
            <P small style={{ color: C.brand, fontWeight: '700', textTransform: 'capitalize' }}>{session?.user.role} · {session?.institute?.name}</P>
          </View>
        </View>
      </Card>
      {sections.map((sec) => (
        <View key={sec.title}>
          <Text style={[s.label, { marginTop: 10 }]}>{sec.title}</Text>
          <Card style={{ paddingVertical: 4 }}>
            {sec.items.map((it, i) => (
              <View key={it.title}>
                {i > 0 && <View style={s.divider} />}
                <ListItem icon={it.icon} title={it.title} subtitle={it.subtitle}
                  onPress={it.onPress ?? (it.href ? () => router.push(it.href!) : it.url ? () => Linking.openURL(it.url!) : undefined)} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
