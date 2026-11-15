import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, Icon } from './ui';

/** Previous / Next bar under every list — 20 items per page ("21–40 of 134 · Page 2 of 7"). */
export function Pager({ page, pages, total, limit = 20, onChange, loading }: { page: number; pages: number; total: number; limit?: number; onChange: (p: number) => void; loading?: boolean }) {
  if (!total || pages <= 1) return total ? <Text style={{ textAlign: 'center', color: C.muted, fontSize: 12, marginVertical: 12 }}>{total} item{total === 1 ? '' : 's'}</Text> : null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const btn = (label: string, p: number, disabled: boolean, left: boolean) => (
    <Pressable onPress={() => !disabled && !loading && onChange(p)} disabled={disabled || loading}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', opacity: disabled ? 0.4 : 1 }}>
      {left && <Icon name="chevron-back" size={16} color={C.text} />}
      <Text style={{ fontWeight: '700', color: C.text }}>{label}</Text>
      {!left && <Icon name="chevron-forward" size={16} color={C.text} />}
    </Pressable>
  );
  return (
    <View style={{ marginVertical: 12, gap: 8 }}>
      <Text style={{ textAlign: 'center', color: C.sub, fontSize: 12 }}>Showing {from}–{to} of {total} · Page {page} of {pages}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {btn('Previous', page - 1, page <= 1, true)}
        {btn('Next', page + 1, page >= pages, false)}
      </View>
    </View>
  );
}

/** 20-at-a-time paging for a list that is already loaded (results, receipts, material…). */
export function useClientPage<T>(items: T[] | null | undefined, resetKey?: unknown, size = 20) {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const list = items ?? [];
  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(state.key === resetKey ? state.page : 1, pages);
  return {
    items: list.slice((page - 1) * size, page * size),
    pager: { page, pages, total: list.length, limit: size, onChange: (p: number) => setState({ key: resetKey, page: p }) },
  };
}
