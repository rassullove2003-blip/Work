import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalize } from '@uniitalia/shared';
import { supabase } from '../lib/supabase';
import { openOfficial } from '../lib/links';
import { loadRules, OTHER_GROUP, RULE_GROUPS, ruleGroup, type Rule } from '../lib/rules';
import { EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, SearchInput, ui, VerificationBadge } from '../components/ui';
import { colors, font, spacing } from '../theme';

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

function RuleCard({ rule }: { rule: Rule }) {
  const urls = [rule.source_url, ...rule.extra_urls].filter(Boolean) as string[];
  return (
    <View style={[ui.card, { gap: spacing.sm, marginBottom: spacing.md }]} testID="rule-card">
      <Text style={ui.h3}>{rule.section}</Text>
      <Text style={ui.body} selectable>
        {rule.body_ru}
      </Text>
      {urls.map((u) => (
        <Pressable key={u} onPress={() => openOfficial(u)} style={styles.link} accessibilityRole="link" hitSlop={6}>
          <Ionicons name="open-outline" size={16} color={colors.secondary} />
          <Text style={styles.linkText} numberOfLines={1}>
            Источник: {host(u)}
          </Text>
        </Pressable>
      ))}
      <VerificationBadge meta={rule} compact />
    </View>
  );
}

export default function RulesScreen() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(params.topic ? String(params.topic) : null);
  const [q, setQ] = useState('');

  const load = useCallback((force = false) => {
    if (!supabase) return;
    loadRules(force)
      .then((r) => {
        setRules(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => load(), [load]);

  const present = new Set((rules ?? []).map((r) => ruleGroup(r.section)));
  const topics = [...RULE_GROUPS.map((g) => g.label), OTHER_GROUP].filter((t) => present.has(t));
  const list = (rules ?? [])
    .filter((r) => !topic || ruleGroup(r.section) === topic)
    .filter((r) => !q || normalize(`${r.section} ${r.body_ru}`).includes(normalize(q)));

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Правила поступления" back />
      {!supabase ? (
        <EmptyState icon="cloud-offline-outline" title="Правила доступны при подключении к серверу." />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title={error} action={{ title: 'Повторить', onPress: () => load(true) }} />
      ) : !rules ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(true)} />}>
          <Notice tone="warning" text="Это общие ориентиры по циклу 2027/28. Решающее значение всегда имеет официальный call конкретного курса — сверяйте требования на странице программы." />
          <View style={{ gap: spacing.md, marginVertical: spacing.lg }}>
            <SearchInput placeholder="Поиск: IELTS, виза, CIMEA…" value={q} onChangeText={setQ} onClear={() => setQ('')} />
            <View style={ui.wrap}>
              <FilterChip label="Все" selected={!topic} onPress={() => setTopic(null)} />
              {topics.map((t) => (
                <FilterChip key={t} label={t} selected={topic === t} onPress={() => setTopic(topic === t ? null : t)} />
              ))}
            </View>
          </View>
          {list.length ? list.map((r) => <RuleCard key={r.id} rule={r} />) : <EmptyState icon="search-outline" title="Ничего не найдено" />}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  linkText: { ...font.small, color: colors.secondary, fontWeight: '600', flexShrink: 1 },
});
