import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RULE_GROUPS, ruleGroup, useRules } from '../lib/rules';
import { Section } from './ui';
import { colors, font, radius, spacing } from '../theme';

const TINTS = [
  { bg: colors.primarySoft, fg: colors.primaryDark },
  { bg: colors.secondarySoft, fg: colors.secondary },
  { bg: colors.warningSoft, fg: '#9A6200' },
  { bg: colors.successSoft, fg: '#007A5C' },
];

/** Блок на главной: «Основные правила поступления» — 4 темы с названиями правил. */
export function RulesHome() {
  const rules = useRules();
  if (rules && rules.length === 0) return null; // сервер недоступен или правил нет — блок не показываем

  return (
    <Section title="Основные правила поступления" action={{ title: 'Все правила', onPress: () => router.push('/rules' as never) }}>
      <View style={styles.grid}>
        {RULE_GROUPS.map((g, i) => {
          const items = (rules ?? []).filter((r) => ruleGroup(r.section) === g.label);
          const tint = TINTS[i % TINTS.length];
          return (
            <Pressable
              key={g.label}
              onPress={() => router.push({ pathname: '/rules', params: { topic: g.label } } as never)}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={`${g.label}: правил ${items.length}`}
              testID="home-rules-group"
            >
              <View style={[styles.icon, { backgroundColor: tint.bg }]}>
                <Ionicons name={g.icon} size={22} color={tint.fg} />
              </View>
              <Text style={styles.title}>{g.label}</Text>
              {rules ? (
                items.slice(0, 3).map((r) => (
                  <Text key={r.id} style={styles.item} numberOfLines={1}>
                    • {r.section}
                  </Text>
                ))
              ) : (
                <Text style={styles.item}>Загрузка…</Text>
              )}
              {items.length > 3 ? <Text style={[styles.more, { color: tint.fg }]}>ещё {items.length - 3}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Общие ориентиры на 2027/28 — точные требования смотрите в call программы.</Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    minHeight: 150,
  },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { ...font.bodyBold, color: colors.text, marginBottom: 2 },
  item: { ...font.small, fontSize: 13, color: colors.textMuted },
  more: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  note: { ...font.small, color: colors.textMuted, marginTop: spacing.sm },
});
