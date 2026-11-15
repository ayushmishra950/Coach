import { RoleTabs } from '../../src/RoleTabs';

export default function ParentTabs() {
  return <RoleTabs role="parent" tabs={[
    { name: 'index', title: 'Home', icon: 'home-outline' },
    { name: 'results', title: 'Results', icon: 'trophy-outline' },
    { name: 'fees', title: 'Fees', icon: 'wallet-outline' },
    { name: 'learn', title: 'Study', icon: 'book-outline' },
    { name: 'more', title: 'More', icon: 'menu-outline' },
  ]} />;
}
