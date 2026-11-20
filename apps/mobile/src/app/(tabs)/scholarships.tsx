import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DSU_FAQ, DSU_GLOSSARY, filterScholarships, regionName } from '@uniitalia/shared';
import { useCatalog } from '../../lib/catalog';
import { EmptyState, ErrorState, FilterChip, LoadingState, Notice, SearchInput, Section, ui } from '../../components/ui';
import { ScholarshipCard } from '../../components/cards';
import { colors, font, radius, spacing } from '../../theme';
import { t } from '../../i18n';

function Expandable({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.exp}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.expHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.expTitle}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? <Text style={styles.expText}>{text}</Text> : null}
    </View>
  );
}

export default function ScholarshipsScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const catalog = useCatalog();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);

  const list = useMemo(() => filterScholarships(catalog.scholarships, query, region), [catalog.scholarships, query, region]);
  const regions = useMemo(() => [...new Set(catalog.scholarships.map((x) => x.region))].sort((a, b) => regionName(a).localeCompare(regionName(b), 'ru')), [catalog.scholarships]);

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const footer = (
    <View>
      <Section title={s.scholarships.glossary}>
        {DSU_GLOSSARY.map((g) => (
          <Expandable key={g.term} title={g.term} text={g.ru} />
        ))}
      </Section>
      <Section title={s.scholarships.faq}>
        {DSU_FAQ.map((f) => (
          <Expandable key={f.q} title={f.q} text={f.a} />
        ))}
      </Section>
    </View>
  );

  return (
    <View style={ui.screen}>
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={ui.h2} accessibilityRole="header">
          {s.scholarships.title}
        </Text>
        <Text style={ui.muted}>{s.scholarships.subtitle}</Text>
        <SearchInput placeholder={s.scholarships.searchPlaceholder} value={query} onChangeText={setQuery} onClear={() => setQuery('')} testID="scholarship-search" />
      </View>
      <FlatList
        data={list}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => <ScholarshipCard scholarship={item} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              <FilterChip label={s.common.all} selected={region === null} onPress={() => setRegion(null)} />
              {regions.map((r) => (
                <FilterChip key={r} label={regionName(r)} selected={region === r} onPress={() => setRegion(region === r ? null : r)} />
              ))}
            </ScrollView>
            <Notice tone="warning" text={s.scholarships.disclaimer} />
          </View>
        }
        ListEmptyComponent={<EmptyState title={s.scholarships.emptyTitle} text={s.search.emptyText} />}
        ListFooterComponent={footer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  exp: { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  expHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, minHeight: 52, gap: spacing.sm },
  expTitle: { ...font.bodyBold, color: colors.text, flex: 1 },
  expText: { ...font.small, color: colors.text, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
