import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Protected, Shell } from './components/Layout';
import { PageLoader } from './components/ui';
import { homeFor, useAuth } from './context/AuthContext';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Students = lazy(() => import('./pages/app/Students'));
const StudentProfile = lazy(() => import('./pages/app/StudentProfile'));
const Teachers = lazy(() => import('./pages/app/Teachers'));
const Batches = lazy(() => import('./pages/app/Batches'));
const BatchDetail = lazy(() => import('./pages/app/BatchDetail'));
const Attendance = lazy(() => import('./pages/app/Attendance'));
const Fees = lazy(() => import('./pages/app/Fees'));
const Receipt = lazy(() => import('./pages/app/Receipt'));
const Tests = lazy(() => import('./pages/app/Tests'));
const TestDetail = lazy(() => import('./pages/app/TestDetail'));
const Reports = lazy(() => import('./pages/app/Reports'));
const Insights = lazy(() => import('./pages/app/Insights'));
const Announcements = lazy(() => import('./pages/app/Announcements'));
const Notifications = lazy(() => import('./pages/app/Notifications'));
const Subscription = lazy(() => import('./pages/app/Subscription'));
const Settings = lazy(() => import('./pages/app/Settings'));

const ParentPortal = lazy(() => import('./pages/parent/ParentPortal'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminInstitutes = lazy(() => import('./pages/admin/AdminInstitutes'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminTickets = lazy(() => import('./pages/admin/AdminTickets'));
const AdminPlans = lazy(() => import('./pages/admin/AdminPlans'));

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <PageLoader />;
  const ownerOnly = (el: JSX.Element) => <Protected roles={['owner']}>{el}</Protected>;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={session ? <AfterLogin role={session.user.role} /> : <Login />} />
        <Route path="/register" element={session ? <Navigate to={homeFor(session.user.role)} replace /> : <Register />} />

        <Route path="/app" element={<Protected roles={['owner', 'teacher']}><Shell variant="app" /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="teachers" element={ownerOnly(<Teachers />)} />
          <Route path="batches" element={<Batches />} />
          <Route path="batches/:id" element={<BatchDetail />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="fees" element={ownerOnly(<Fees />)} />
          <Route path="fees/receipt/:id" element={ownerOnly(<Receipt />)} />
          <Route path="tests" element={<Tests />} />
          <Route path="tests/:id" element={<TestDetail />} />
          <Route path="reports" element={ownerOnly(<Reports />)} />
          <Route path="insights" element={ownerOnly(<Insights />)} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="subscription" element={ownerOnly(<Subscription />)} />
          <Route path="settings" element={ownerOnly(<Settings />)} />
        </Route>

        <Route path="/portal" element={<Protected roles={['parent']}><ParentPortal /></Protected>} />
        <Route path="/portal/receipt/:id" element={<Protected roles={['parent']}><Receipt /></Protected>} />

        <Route path="/admin" element={<Protected roles={['superadmin']}><Shell variant="admin" /></Protected>}>
          <Route index element={<AdminDashboard />} />
          <Route path="institutes" element={<AdminInstitutes />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="plans" element={<AdminPlans />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/** Honours ?next= after login, but only for same-app paths. */
function AfterLogin({ role }: { role: string }) {
  const [params] = useSearchParams();
  const next = params.get('next');
  const home = homeFor(role);
  const ok = next && next.startsWith('/') && !next.startsWith('//') && next.startsWith(home);
  return <Navigate to={ok ? next : home} replace />;
}
