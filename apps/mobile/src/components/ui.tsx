import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VerificationMeta } from '@uniitalia/shared';
import { colors, font, HIT, radius, spacing } from '../theme';
import { t } from '../i18n';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ Logo -- */
export function Logo({ size = 36, onPrimary = false }: { size?: number; onPrimary?: boolean }) {
  return (
    <View style={styles.logoRow} accessible accessibilityLabel="UniItalia">
      <View style={[styles.logoMark, { width: size, height: size, borderRadius: size * 0.3 }, onPrimary && { backgroundColor: colors.text }]}>
        <Text style={[styles.logoLetter, { fontSize: size * 0.5 }]}>U</Text>
        <View style={[styles.logoDot, { width: size * 0.22, height: size * 0.22, borderRadius: size }]} />
      </View>
      <Text style={styles.logoText}>
        Uni<Text style={{ color: onPrimary ? '#FFFFFF' : colors.primary }}>Italia</Text>
      </Text>
    </View>
  );
}

/* --------------------------------------------------------- ScreenHeader -- */
export function ScreenHeader({
  title,
  back = false,
  right,
}: {
  title: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t().common.back}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={colors.secondary} />
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.headerRight}>{right ?? <View style={styles.headerSpacer} />}</View>
    </View>
  );
}

/* --------------------------------------------------------------- Button -- */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={v.fg} />}
          <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.secondary, fg: '#FFFFFF', border: colors.secondary },
  secondary: { bg: colors.success, fg: '#FFFFFF', border: colors.success },
  outline: { bg: 'transparent', fg: colors.secondary, border: colors.secondary },
  ghost: { bg: 'transparent', fg: colors.secondary, border: 'transparent' },
  danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
};

/* ----------------------------------------------------------- FilterChip -- */
export function FilterChip({
  label,
  selected = false,
  onPress,
  icon,
  onRemove,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  onRemove?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onRemove ?? onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={onRemove ? `${label}, убрать фильтр` : label}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.8 }]}
    >
      {icon && <Ionicons name={icon} size={16} color={selected ? '#FFFFFF' : colors.text} />}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      {onRemove && <Ionicons name="close" size={16} color={selected ? '#FFFFFF' : colors.text} />}
    </Pressable>
  );
}

/* ----------------------------------------------------------- EmptyState -- */
export function EmptyState({
  icon = 'search-outline',
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: { title: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty} accessible accessibilityLabel={`${title}. ${text ?? ''}`}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.primaryDark} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action ? <Button title={action.title} onPress={action.onPress} variant="outline" style={{ marginTop: spacing.md }} /> : null}
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.center} accessibilityLabel={t().common.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.emptyText, { marginTop: spacing.md }]}>{t().common.loading}</Text>
    </View>
  );
}

export function ErrorState({ onRetry, details }: { onRetry: () => void; details?: string | null }) {
  return (
    <View style={styles.center}>
      <EmptyState
        icon="cloud-offline-outline"
        title={t().common.errorTitle}
        text={t().common.errorText + (details ? `\n(${details})` : '')}
        action={{ title: t().common.retry, onPress: onRetry }}
      />
    </View>
  );
}

/* --------------------------------------------------------- DeadlineBadge -- */
export function DeadlineBadge({ date, verified }: { date: string | null; verified: boolean }) {
  if (!date) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.surface }]}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>Срок уточняется</Text>
      </View>
    );
  }
  const d = new Date(date);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const urgent = days >= 0 && days <= 14;
  return (
    <View style={[styles.badge, { backgroundColor: urgent ? colors.warningSoft : colors.successSoft }]}>
      <Ionicons name="calendar" size={14} color={urgent ? '#9A6700' : '#00805F'} />
      <Text style={[styles.badgeText, { color: urgent ? '#9A6700' : '#00805F' }]}>
        до {d.toLocaleDateString('ru-RU')}
        {verified ? '' : ' · не проверено'}
      </Text>
    </View>
  );
}

/* ----------------------------------------------------- VerificationBadge -- */
export function VerificationBadge({ meta, compact = false }: { meta: VerificationMeta; compact?: boolean }) {
  const s = meta.verification_status;
  const palette =
    s === 'verified'
      ? { bg: colors.successSoft, fg: '#00805F', icon: 'checkmark-circle' as IconName }
      : s === 'outdated'
        ? { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as IconName }
        : { bg: colors.warningSoft, fg: '#9A6700', icon: 'time-outline' as IconName };
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Ionicons name={palette.icon} size={14} color={palette.fg} />
      <Text style={[styles.badgeText, { color: palette.fg }]}>
        {t().verification[s]}
        {!compact && meta.verified_at ? ` · ${new Date(meta.verified_at).toLocaleDateString('ru-RU')}` : ''}
      </Text>
    </View>
  );
}

/** Подвал карточки: источник и дата проверки. */
export function SourceNote({ meta, onOpen }: { meta: VerificationMeta; onOpen?: (url: string) => void }) {
  return (
    <View style={styles.sourceNote}>
      <VerificationBadge meta={meta} />
      <Text style={styles.sourceText}>
        {meta.academic_year ? `Учебный год: ${meta.academic_year}. ` : ''}
        {meta.verified_at ? t().verification.checkedAt(new Date(meta.verified_at).toLocaleDateString('ru-RU')) : t().verification.notChecked}
      </Text>
      {meta.source_url ? (
        <Text
          style={styles.link}
          onPress={() => onOpen?.(meta.source_url!)}
          accessibilityRole="link"
          numberOfLines={1}
        >
          {t().common.source}: {meta.source_url.replace(/^https?:\/\//, '')}
        </Text>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------- Section/Info -- */
export function Section({
  title,
  action,
  children,
  style,
}: {
  title: string;
  action?: { title: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
            <Text style={styles.sectionAction}>{action.title}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function InfoRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.infoRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, muted && { color: colors.textMuted, fontStyle: 'italic' }]}>{value}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'warning'; icon?: IconName }) {
  const bg = tone === 'warning' ? colors.warningSoft : colors.primarySoft;
  const fg = tone === 'warning' ? '#7A5200' : '#005F70';
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="text">
      <Ionicons name={icon ?? (tone === 'warning' ? 'information-circle' : 'sparkles-outline')} size={18} color={fg} />
      <Text style={[styles.noticeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/* ---------------------------------------------------------- SearchInput -- */
export function SearchInput(props: TextInputProps & { onClear?: () => void }) {
  const { onClear, value, style, ...rest } = props;
  return (
    <View style={[styles.search, style as StyleProp<ViewStyle>]}>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <TextInput
        {...rest}
        value={value}
        style={styles.searchInput}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel={rest.placeholder}
      />
      {value && onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Очистить поиск">
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------- FormField -- */
export function FormField({ label, error, ...input }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.field, error ? { borderColor: colors.danger } : null]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  h1: { ...font.h1, color: colors.text },
  h2: { ...font.h2, color: colors.text },
  h3: { ...font.h3, color: colors.text },
  body: { ...font.body, color: colors.text },
  muted: { ...font.small, color: colors.textMuted },
  card: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: '#FFFFFF', fontWeight: '900' },
  logoDot: { position: 'absolute', top: '14%', right: '14%', backgroundColor: colors.warning },
  logoText: { ...font.h3, fontSize: 22, fontWeight: '900', color: colors.text },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: HIT, height: HIT },
  headerRight: { minWidth: HIT, alignItems: 'flex-end' },
  headerTitle: { ...font.h3, color: colors.text, flex: 1, textAlign: 'center' },
  button: {
    minHeight: HIT + 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonText: { ...font.bodyBold },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.text,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...font.small, fontWeight: '600', color: colors.text },
  chipTextSelected: { color: '#FFFFFF' },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...font.h3, color: colors.text, textAlign: 'center' },
  emptyText: { ...font.small, color: colors.textMuted, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.surface },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sourceNote: { gap: spacing.xs, marginTop: spacing.lg },
  sourceText: { ...font.small, color: colors.textMuted },
  link: { ...font.small, color: colors.secondary, textDecorationLine: 'underline' },
  section: { marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.md },
  sectionTitle: { ...font.h3, fontSize: 20, fontWeight: '800', color: colors.text, flexShrink: 1 },
  sectionAction: { ...font.small, fontWeight: '700', color: colors.secondary },
  infoRow: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  infoLabel: { ...font.caption, color: colors.textMuted, textTransform: 'uppercase' },
  infoValue: { ...font.body, color: colors.text },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  noticeText: { ...font.small, flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  searchInput: { flex: 1, ...font.body, color: colors.text, paddingVertical: spacing.sm, outlineStyle: 'none' } as object,
  fieldLabel: { ...font.small, fontWeight: '600', color: colors.text, marginBottom: 6 },
  field: {
    ...font.body,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    backgroundColor: colors.background,
  },
  fieldError: { ...font.small, color: colors.danger, marginTop: 4 },
});
