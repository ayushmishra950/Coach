import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';
import { Loading } from '../src/ui';

/** Sends each user to their own home: owner, teacher or parent. */
export default function Index() {
  const { ready, session } = useAuth();
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  const role = session.user.role;
  return <Redirect href={role === 'owner' ? '/owner' : role === 'teacher' ? '/teacher' : '/parent'} />;
}
