import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Modal as RNModal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initials } from './format';

export const C = {
  brand: '#4f46e5', brandDark: '#3730a3', brandSoft: '#eef2ff', violet: '#7c3aed',
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', text: '#0f172a', sub: '#475569', muted: '#94a3b8',
  green: '#059669', greenSoft: '#ecfdf5', amber: '#d97706', amberSoft: '#fffbeb', red: '#e11d48', redSoft: '#fff1f2', sky: '#0284c7', skySoft: '#f0f9ff',
};

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = ({ name, size = 20, color = C.sub }: { name: IconName; size?: number; color?: string }) => <Ionicons name={name} size={size} color={color} />;

/** Page wrapper: safe area + optional scroll with pull-to-refresh. */
export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, edges }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges ?? []}>
      {scroll ? (
        <ScrollView contentContainerStyle={[padded && s.pad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.brand} /> : undefined}>
          {children}
        </ScrollView>
      ) : <View style={[{ flex: 1 }, padded && s.pad]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style, right }: { children: ReactNode; style?: StyleProp<TextStyle>; right?: ReactNode }) {
  return (
    <View style={s.h2Row}>
      <Text style={[s.h2, style]}>{children}</Text>
      {right}
    </View>
  );
}
export function P({ children, style, muted, small, bold, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; small?: boolean; bold?: boolean; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[s.p, muted && { color: C.muted }, small && { fontSize: 12 }, bold && { fontWeight: '700', color: C.text }, style]}>{children}</Text>;
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }: {
  title: string; onPress?: () => void; variant?: BtnVariant; icon?: IconName; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.brand, secondary: '#fff', danger: C.red, success: C.green, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? C.text : '#fff';
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, small && s.btnSm, { backgroundColor: bg }, variant === 'secondary' && { borderWidth: 1, borderColor: C.border }, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

const TONES = {
  gray: ['#f1f5f9', '#475569'], green: [C.greenSoft, C.green], red: [C.redSoft, C.red], amber: [C.amberSoft, C.amber],
  blue: [C.skySoft, C.sky], brand: [C.brandSoft, C.brand], violet: ['#f5f3ff', C.violet],
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  return <View style={[s.badge, { backgroundColor: TONES[tone][0] }]}><Text style={[s.badgeText, { color: TONES[tone][1] }]}>{children}</Text></View>;
}

export function Stat({ label, value, icon, tone = 'brand', hint, onPress }: { label: string; value: ReactNode; icon: IconName; tone?: Tone; hint?: string; onPress?: () => void }) {
  return (
    <Card style={s.stat} onPress={onPress}>
      <View style={[s.statIcon, { backgroundColor: TONES[tone][0] }]}><Ionicons name={icon} size={18} color={TONES[tone][1]} /></View>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
      {hint ? <Text style={[s.statLabel, { color: TONES[tone][1], marginTop: 2 }]} numberOfLines={1}>{hint}</Text> : null}
    </Card>
  );
}
export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.row, style]}>{children}</View>;
export const Grid = ({ children }: { children: ReactNode }) => <View style={s.grid}>{children}</View>;

export function Avatar({ name, size = 40, color = C.brand }: { name: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>{initials(name) || '?'}</Text>
    </View>
  );
}

export function ListItem({ title, subtitle, right, left, onPress, icon }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; left?: ReactNode; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.item, pressed && { backgroundColor: '#f8fafc' }]}>
      {left ?? (icon ? <View style={s.itemIcon}><Ionicons name={icon} size={18} color={C.brand} /></View> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <Text style={s.itemTitle} numberOfLines={1}>{title}</Text> : title}
        {subtitle ? (typeof subtitle === 'string' ? <Text style={s.itemSub} numberOfLines={2}>{subtitle}</Text> : subtitle) : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={C.muted} /> : null}
    </Pressable>
  );
}

export function Input({ label, hint, style, ...rest }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.muted} style={[s.input, rest.multiline && { minHeight: 80, textAlignVertical: 'top' }, style]} {...rest} />
      {hint ? <Text style={[s.itemSub, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

/** Horizontal pill selector. */
export function Chips<T extends string>({ value, onChange, options, style }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0, marginBottom: 12 }, style]} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && { backgroundColor: C.brand, borderColor: C.brand }]}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}{o.count != null ? ` · ${o.count}` : ''}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Loading() {
  return <View style={s.center}><ActivityIndicator size="large" color={C.brand} /></View>;
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={C.muted} />
      <Text style={[s.p, { textAlign: 'center', marginVertical: 12 }]}>{message}</Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <View style={[s.center, { paddingVertical: 32 }]}>
      <Ionicons name={icon} size={36} color={C.muted} />
      <Text style={[s.itemTitle, { marginTop: 8, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[s.itemSub, { textAlign: 'center', marginTop: 4 }]}>{text}</Text> : null}
    </View>
  );
}

export function Banner({ tone = 'brand', icon = 'information-circle', children, onPress }: { tone?: Tone; icon?: IconName; children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[s.banner, { backgroundColor: TONES[tone][0] }]}>
      <Ionicons name={icon} size={20} color={TONES[tone][1]} />
      <Text style={[s.p, { flex: 1, color: TONES[tone][1], fontWeight: '600' }]}>{children}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={TONES[tone][1]} /> : null}
    </Pressable>
  );
}

/** Bottom sheet style modal. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <RNModal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <Row style={{ marginBottom: 12 }}>
          <Text style={[s.h2, { flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={24} color={C.sub} /></Pressable>
        </Row>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </RNModal>
  );
}

export function Progress({ value, color = C.brand }: { value: number; color?: string }) {
  return <View style={s.track}><View style={[s.fill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} /></View>;
}

export const pctColor = (p?: number | null) => (p == null ? C.muted : p >= 85 ? C.green : p >= 70 ? C.amber : C.red);

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#eef2f7', marginBottom: 12, shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  h1: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 4 },
  h2Row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
  h2: { fontSize: 17, fontWeight: '800', color: C.text },
  p: { fontSize: 14, color: C.sub, lineHeight: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 18 },
  btnSm: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  stat: { width: '47.5%', marginBottom: 0 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 12, color: C.sub, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  itemSub: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', color: C.sub, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text },
  chip: { borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '700', color: C.sub },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#eef2f7', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  divider: { height: 1, backgroundColor: '#f1f5f9' },
});
