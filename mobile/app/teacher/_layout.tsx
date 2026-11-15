import { RoleTabs } from '../../src/RoleTabs';

export default function TeacherTabs() {
  return <RoleTabs role="teacher" tabs={[
    { name: 'index', title: 'Today', icon: 'today-outline' },
    { name: 'attendance', title: 'Attendance', icon: 'checkbox-outline' },
    { name: 'tests', title: 'Tests', icon: 'clipboard-outline' },
    { name: 'more', title: 'More', icon: 'menu-outline' },
  ]} />;
}
