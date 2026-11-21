import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { APPLICANT_CATEGORIES, type Deadline } from '@uniitalia/shared';
import { useCatalog } from '../lib/catalog';
import { DeadlineBadge, VerificationBadge } from './ui';
import { colors, font, radius, spacing } from '../theme';

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
      <DeadlineBadge date={deadline.ends_at} verified={deadline.verification_status === 'verified'} />
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
  muted: { ...font.small, color: colors.textMuted },
});
