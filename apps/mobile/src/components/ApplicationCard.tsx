import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { APPLICATION_STATUS_LABELS, applicationProgress, type ApplicationStatus } from '@uniitalia/shared';
import { colors, font, radius, spacing } from '../theme';

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: value }}>
      <View style={[styles.fill, { width: `${Math.max(4, value)}%` }]} />
    </View>
  );
}

/** Карточка поступления: программа, вуз, этап, прогресс, ближайший срок и число открытых задач. */
export function ApplicationCard({
  id,
  title,
  subtitle,
  year,
  status,
  nextDue,
  openTasks,
  person,
}: {
  id: string;
  title: string;
  subtitle: string;
  year: string | null;
  status: ApplicationStatus;
  nextDue?: { title: string; date: string } | null;
  openTasks: number;
  person?: string;
}) {
  const progress = applicationProgress(status);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/application/[id]', params: { id } } as never)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${APPLICATION_STATUS_LABELS[status]}, ${progress}%`}
      testID={`application-${id}`}
    >
      {person ? <Text style={styles.person}>{person}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted} numberOfLines={1}>
        {subtitle}
        {year ? ` · ${year}` : ''}
      </Text>
      <View style={styles.row}>
        <Text style={styles.status}>{APPLICATION_STATUS_LABELS[status]}</Text>
        <Text style={styles.percent}>{progress}%</Text>
      </View>
      <ProgressBar value={progress} />
      <View style={[styles.row, { marginTop: spacing.sm }]}>
        <Text style={styles.muted} numberOfLines={1}>
          {nextDue ? `Ближайший срок: ${new Date(nextDue.date).toLocaleDateString('ru-RU')}` : 'Ближайших сроков нет'}
        </Text>
        <View style={styles.tasks}>
          <Ionicons name="checkbox-outline" size={14} color={colors.textMuted} />
          <Text style={styles.muted}>{openTasks}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.background, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, gap: 4 },
  person: { ...font.caption, color: colors.primaryDark },
  title: { ...font.bodyBold, fontSize: 17, color: colors.text },
  muted: { ...font.small, color: colors.textMuted, flexShrink: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  status: { ...font.small, fontWeight: '700', color: colors.secondary },
  percent: { ...font.small, fontWeight: '700', color: colors.text },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
  tasks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
