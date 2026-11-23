import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalize, type VerificationMeta } from '@uniitalia/shared';
import { supabase } from '../lib/supabase';
import { openOfficial } from '../lib/links';
import { EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, SearchInput, ui, VerificationBadge } from '../components/ui';
import { colors, font, spacing } from '../theme';

interface Rule extends VerificationMeta {
  id: string;
  sort_order: number;
  section: string;
  body_ru: string;
  extra_urls: string[];
}

/** Группа правила по ключевым словам раздела (новые разделы из админки попадут в «Другое»). */
const GROUPS: { label: string; words: string[] }[] = [
  { label: 'Образование и документы', words: ['образован', 'документ', 'магистратура'] },
  { label: 'Язык и тесты', words: ['язык', 'тест', 'cent', 'творческ'] },
  { label: 'Сроки и виза', words: ['дедлайн', 'дата', 'даты', 'виза', 'срок'] },
  { label: 'Стоимость и стипендии', words: ['стоимост', 'сбор', 'стипенд', 'плат'] },
];
const topicOf = (section: string) => {
  const s = section.toLowerCase();
  return GROUPS.find((g) => g.words.some((w) => s.includes(w)))?.label ?? 'Другое';
};
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
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    if (!supabase) return;
    supabase
      .from('admission_rules')
      .select('id, sort_order, section, body_ru, source_url, extra_urls, academic_year, verification_status, verified_at')
      .eq('status', 'published')
      .order('sort_order')
      .then(({ data, error: e }) => {
        if (e) setError('Не удалось загрузить правила. Проверьте интернет.');
        else {
          setRules((data ?? []) as Rule[]);
          setError(null);
        }
      });
  }, []);
  useEffect(load, [load]);

  const present = new Set((rules ?? []).map((r) => topicOf(r.section)));
  const topics = [...GROUPS.map((g) => g.label), 'Другое'].filter((t) => present.has(t));
  const list = (rules ?? [])
    .filter((r) => !topic || topicOf(r.section) === topic)
    .filter((r) => !q || normalize(`${r.section} ${r.body_ru}`).includes(normalize(q)));

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Правила поступления" back />
      {!supabase ? (
        <EmptyState icon="cloud-offline-outline" title="Правила доступны при подключении к серверу." />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title={error} action={{ title: 'Повторить', onPress: load }} />
      ) : !rules ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
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
