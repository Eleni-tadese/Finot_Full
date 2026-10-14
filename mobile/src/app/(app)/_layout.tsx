import AppTabs from '@/components/app-tabs';

// Everything inside the (app) folder is shown inside these tabs (Home, Explore).
// The folder name in brackets is only a group: it does not appear in the address.
export default function AppLayout() {
  return <AppTabs />;
}
