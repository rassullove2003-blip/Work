import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../lib/auth';
import { useReminders } from '../lib/reminders';
import { notify } from '../lib/links';
import { APPLICANT_CATEGORIES, type Deadline } from '@uniitalia/shared';
import { useCatalog } from '../lib/catalog';
import { DeadlineBadge, VerificationBadge } from './ui';
import { colors, font, radius, spacing } from '../theme';

/** Колокольчик «Напомнить»: подписка на напоминания о сроке. */
export function ReminderBell({ deadline }: { deadline: Deadline }) {
  const auth = useAuth();
  const reminders = useReminders();
  const [busy, setBusy] = useState(false);
  if (!auth.enabled || new Date(deadline.ends_at) < new Date()) return null;
  const on = reminders.isOn(deadline.id);
  const press = async () => {
    if (!auth.userId) {
      router.push('/auth');
      return;
    }
    setBusy(true);
    try {
      const now = await reminders.toggle(deadline.id);
      if (now) notify('Напоминание включено', 'Мы напомним о сроке заранее. Настроить, за сколько дней, можно в «Профиль» → «Напоминания о сроках».');
    } catch (e) {
      notify('Ошибка', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      onPress={press}
      hitSlop={8}
      style={[styles.bell, on && styles.bellOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={on ? 'Напоминание включено' : 'Напомнить о сроке'}
      testID={`remind-${deadline.id}`}
    >
      {busy ? <ActivityIndicator size="small" color={colors.secondary} /> : <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={18} color={on ? '#fff' : colors.secondary} />}
      <Text style={[styles.bellText, on && { color: '#fff' }]}>{on ? 'Напомню' : 'Напомнить'}</Text>
    </Pressable>
  );
}

/** Карточка срока: дата, к чему относится, для кого, статус проверки. */
export function DeadlineCard({ deadline, showTarget = true }: { deadline: Deadline; showTarget?: boolean }) {
  const catalog = useCatalog();
  const program = deadline.program_id ? catalog.programs.find((p) => p.id === deadline.program_id) : undefined;
  const scholarship = deadline.scholarship_id ? catalog.scholarships.find((s) => s.id === deadline.scholarship_id) : undefined;
  const target = program
    ? `${program.title_original} · ${program.university.name_ru ?? program.university.official_name}`
    : scholarship?.name_ru;
  const open = () => {
    if (program) router.push({ pathname: '/program/[slug]', params: { slug: program.slug } });
    else if (scholarship) router.push({ pathname: '/scholarship/[slug]', params: { slug: scholarship.slug } });
  };
  return (
    <Pressable onPress={open} disabled={!program && !scholarship} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={styles.top}>
        <DeadlineBadge date={deadline.ends_at} verified={deadline.verification_status === 'verified'} />
        <ReminderBell deadline={deadline} />
      </View>
      <Text style={styles.title}>{deadline.title_ru}</Text>
      {showTarget && target ? <Text style={styles.muted} numberOfLines={2}>{target}</Text> : null}
      <Text style={styles.muted}>
        {APPLICANT_CATEGORIES[deadline.applicant_category]} · {deadline.academic_year}
        {deadline.starts_at ? ` · с ${new Date(deadline.starts_at).toLocaleDateString('ru-RU')}` : ''}
      </Text>
      <VerificationBadge meta={{ ...deadline, academic_year: deadline.academic_year }} compact />
    </Pressable>
  );
}

/** Ближайшие будущие сроки (по умолчанию только проверенные). */
export function upcoming(deadlines: Deadline[], onlyVerified: boolean, limit = 50): Deadline[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadlines
    .filter((d) => new Date(d.ends_at) >= today && (!onlyVerified || d.verification_status === 'verified'))
    .sort((a, b) => a.ends_at.localeCompare(b.ends_at))
    .slice(0, limit);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: 6,
  },
  title: { ...font.bodyBold, color: colors.text },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bell: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: colors.secondary, borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 34 },
  bellOn: { backgroundColor: colors.secondary },
  bellText: { ...font.small, fontWeight: '700', color: colors.secondary },
  muted: { ...font.small, color: colors.textMuted },
});
