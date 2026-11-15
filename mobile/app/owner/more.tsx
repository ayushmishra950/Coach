import { getServer } from '../../src/api';
import { MenuScreen } from '../../src/Menu';
import { useFetch } from '../../src/useFetch';

export default function OwnerMore() {
  const site = useFetch<{ website: { enabled?: boolean; slug?: string } }>('/website');
  const url = site.data?.website.enabled && site.data.website.slug ? `${getServer()}/site/${site.data.website.slug}` : undefined;
  return (
    <MenuScreen sections={[
      { title: 'Daily work', items: [
        { icon: 'checkbox-outline', title: 'Attendance', subtitle: 'Mark or check any batch', href: '/attendance' },
        { icon: 'clipboard-outline', title: 'Tests & marks', href: '/tests' },
        { icon: 'calendar-outline', title: 'Leave requests', subtitle: 'Approve parents’ leave applications', href: '/leaves' },
        { icon: 'megaphone-outline', title: 'Announcements & notices', href: '/announcements' },
        { icon: 'time-outline', title: 'Timetable & syllabus', href: '/timetable' },
      ] },
      { title: 'Staff', items: [
        { icon: 'finger-print-outline', title: 'Staff check-in', subtitle: 'Who is in today, late arrivals', href: '/staff' },
        { icon: 'clipboard-outline', title: 'Teacher work reports', subtitle: 'Daily reports — read & mark seen', href: '/work-reports' },
        { icon: 'cash-outline', title: 'Teacher salaries', href: '/salaries' },
      ] },
      { title: 'Account', items: [
        { icon: 'notifications-outline', title: 'Notifications', href: '/notifications' },
        ...(url ? [{ icon: 'globe-outline' as const, title: 'Open admissions website', subtitle: url, url }] : []),
        { icon: 'person-circle-outline', title: 'My account', subtitle: 'Password, sign out', href: '/account' },
      ] },
    ]} />
  );
}
