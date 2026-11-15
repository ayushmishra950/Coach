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
      salary: 'notifications',
      staff: 'notifications',
      lead: 'notifications',
      leave: 'leave',
      material: 'materials',
      report: 'notifications',
    }[type];
    return `/portal${id ? `?student=${encodeURIComponent(id)}` : ''}#${section}`;
  }

  if (id && type === 'attendance') return `/app/students/${encodeURIComponent(id)}`;
  if (type === 'attendance') return '/app/attendance?tab=alerts';
  if (type === 'fee' || type === 'payment') return '/app/fees';
  if (type === 'test') return '/app/tests';
  if (type === 'announcement') return '/app/announcements';
  if (type === 'lead') return '/app/leads';
  if (type === 'leave') return '/app/leaves';
  if (type === 'material') return '/app/materials';
  if (type === 'salary') return role === 'owner' ? '/app/salaries' : '/app/my-attendance?tab=salary';
  if (type === 'report') return role === 'owner' ? '/app/work-reports' : '/app/daily-report';
  if (type === 'staff') return role === 'owner' ? '/app/staff' : '/app/my-attendance';
  return '/app/notifications';
}
