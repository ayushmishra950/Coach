import type { Notification, Role } from './types';

export function notificationHref(notification: Pick<Notification, 'href' | 'type' | 'studentId'>, role: Role) {
  const { href, type, studentId } = notification;
  if (href?.startsWith('/') && !href.startsWith('//')) return href;

  const id = typeof studentId === 'string' ? studentId : studentId?._id;
  if (role === 'parent') {
    const section = {
      attendance: 'attendance',
      fee: 'fees',
      payment: 'fees',
      test: 'results',
      announcement: 'announcements',
      system: 'notifications',
    }[type];
    return `/portal${id ? `?student=${encodeURIComponent(id)}` : ''}#${section}`;
  }

  if (id && type === 'attendance') return `/app/students/${encodeURIComponent(id)}`;
  if (type === 'attendance') return '/app/attendance?tab=alerts';
  if (type === 'fee' || type === 'payment') return '/app/fees';
  if (type === 'test') return '/app/tests';
  if (type === 'announcement') return '/app/announcements';
  return '/app/notifications';
}
