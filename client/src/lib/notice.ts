/** Notice-board categories for announcements (holiday, PTM, extra class…). */
export const NOTICE_CATEGORIES: { value: string; label: string; emoji: string }[] = [
  { value: 'general', label: 'General notice', emoji: '📢' },
  { value: 'holiday', label: 'Holiday', emoji: '🏖️' },
  { value: 'ptm', label: 'Parent-Teacher Meeting', emoji: '🤝' },
  { value: 'extra_class', label: 'Extra class', emoji: '➕' },
  { value: 'exam', label: 'Exam / test', emoji: '📝' },
  { value: 'event', label: 'Event', emoji: '🎉' },
];
export const noticeCategory = (v?: string | null) => NOTICE_CATEGORIES.find((c) => c.value === v);
