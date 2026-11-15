import { Stack } from 'expo-router';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { errMsg, put } from '../src/api';
import { timeAgo } from '../src/format';
import { Pager } from '../src/Pager';
import { usePaged, usePoll } from '../src/useFetch';
import { Button, C, Empty, ErrorView, Icon, Loading, P, s, type IconName } from '../src/ui';

interface Notif { _id: string; type: string; title: string; message: string; read?: boolean; createdAt: string }
const ICON: Record<string, IconName> = {
  attendance: 'checkbox-outline', fee: 'wallet-outline', payment: 'card-outline', test: 'clipboard-outline', announcement: 'megaphone-outline', system: 'information-circle-outline',
  salary: 'cash-outline', staff: 'finger-print-outline', lead: 'person-add-outline', leave: 'calendar-outline', material: 'folder-outline',
};

export default function Notifications() {
  const list = usePaged<Notif>('/notifications');
  usePoll(() => list.reload());
  const readAll = async () => {
    try {
      await put('/notifications/read-all');
      list.reload();
    } catch (e) {
      Alert.alert('Error', errMsg(e));
    }
  };
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Notifications', headerRight: () => <Button small title="Mark all read" variant="ghost" onPress={readAll} /> }} />
      {list.error && !list.items.length ? <ErrorView message={list.error} onRetry={list.reload} /> : (
        <FlatList
          key={list.page}
          data={list.items}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={C.brand} />}
          ListFooterComponent={<Pager {...list.pager} />}
          ListEmptyComponent={list.loading ? <Loading /> : <Empty icon="notifications-off-outline" title="You're all caught up 🎉" />}
          ItemSeparatorComponent={() => <View style={s.divider} />}
          renderItem={({ item: n }) => (
            <View style={[s.item, { alignItems: 'flex-start' }]}>
              <View style={[s.itemIcon, !n.read && { backgroundColor: C.brand }]}><Icon name={ICON[n.type] ?? 'notifications-outline'} size={18} color={n.read ? C.brand : '#fff'} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.itemTitle, n.read && { fontWeight: '600', color: C.sub }]}>{n.title}</Text>
                <P>{n.message}</P>
                <P small muted>{timeAgo(n.createdAt)}</P>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
