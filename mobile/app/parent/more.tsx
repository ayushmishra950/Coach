import { Linking } from 'react-native';
import { MenuScreen } from '../../src/Menu';
import { telUrl, waUrl } from '../../src/format';
import { useParent } from '../../src/parent';

export default function ParentMore() {
  const { data } = useParent();
  const phone = data?.institute.phone;
  return (
    <MenuScreen sections={[
      { title: 'My child', items: [
        { icon: 'calendar-outline', title: 'Leave requests', subtitle: 'Apply for leave, see status', href: '/parent-leaves' },
        { icon: 'document-text-outline', title: 'Report card', href: '/report-card' },
        { icon: 'notifications-outline', title: 'Notifications', href: '/notifications' },
      ] },
      ...(phone ? [{ title: data!.institute.name, items: [
        { icon: 'call-outline' as const, title: 'Call institute', subtitle: phone, onPress: () => void Linking.openURL(telUrl(phone)) },
        { icon: 'logo-whatsapp' as const, title: 'WhatsApp institute', onPress: () => void Linking.openURL(waUrl(phone)) },
      ] }] : []),
      { title: 'Account', items: [
        { icon: 'person-circle-outline', title: 'My account', subtitle: 'Password, sign out', href: '/account' },
      ] },
    ]} />
  );
}
