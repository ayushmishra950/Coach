import { MenuScreen } from '../../src/Menu';

export default function TeacherMore() {
  return (
    <MenuScreen sections={[
      { title: 'Teaching', items: [
        { icon: 'clipboard-outline', title: 'Daily work report', subtitle: 'Tell the owner what you did today', href: '/daily-report' },
        { icon: 'people-outline', title: 'My students', href: '/students' },
        { icon: 'time-outline', title: 'Timetable & syllabus', subtitle: 'Tick topics as you finish them', href: '/timetable' },
        { icon: 'calendar-outline', title: 'Leave requests', subtitle: 'From parents of your students', href: '/leaves' },
        { icon: 'megaphone-outline', title: 'Announcements', href: '/announcements' },
      ] },
      { title: 'Me', items: [
        { icon: 'wallet-outline', title: 'My attendance & salary', href: '/my-salary' },
        { icon: 'notifications-outline', title: 'Notifications', href: '/notifications' },
        { icon: 'person-circle-outline', title: 'My account', subtitle: 'Password, sign out', href: '/account' },
      ] },
    ]} />
  );
}
