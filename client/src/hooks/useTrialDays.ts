import { useApi } from './useApi';

/** Free-trial length set by the Super Admin (shown on the landing and sign-up pages). */
export function useTrialDays() {
  const { data } = useApi<{ trialDays?: number }>('/public/meta');
  return data?.trialDays ?? 30;
}

/** "30-day" / "2-month" style label; 0 → null (no trial). */
export const trialLabel = (d: number) => (d <= 0 ? null : d % 30 === 0 && d >= 60 ? `${d / 30}-month` : `${d}-day`);
