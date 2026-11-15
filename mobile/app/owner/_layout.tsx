import { RoleTabs } from '../../src/RoleTabs';

export default function OwnerTabs() {
  return <RoleTabs role="owner" tabs={[
    { name: 'index', title: 'Dashboard', icon: 'grid-outline' },
    { name: 'students', title: 'Students', icon: 'people-outline' },
    { name: 'fees', title: 'Fees', icon: 'wallet-outline' },
    { name: 'leads', title: 'Enquiries', icon: 'person-add-outline' },
    { name: 'more', title: 'More', icon: 'menu-outline' },
  ]} />;
}
