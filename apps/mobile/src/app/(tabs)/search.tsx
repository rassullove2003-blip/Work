import React, { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  cityName,
  countActiveProgramFilters,
  EMPTY_PROGRAM_FILTERS,
  EMPTY_UNIVERSITY_FILTERS,
  FIELD_LABELS,
  filterPrograms,
  filterUniversities,
  LANGUAGES,
  LEVELS,
  regionName,
  UNIVERSITY_TYPES,
  type ProgramFilters,
  type ProgramSort,
} from '@uniitalia/shared';
import { useCatalog } from '../../lib/catalog';
import { useFilters } from '../../lib/filters';
import { EmptyState, ErrorState, FilterChip, LoadingState, SearchInput, ui } from '../../components/ui';
import { ProgramCard, UniversityCard } from '../../components/cards';
import { colors, font, radius, spacing } from '../../theme';
import { t } from '../../i18n';

const SORTS: ProgramSort[] = ['relevance', 'name', 'duration_asc', 'university'];

/** Активные фильтры программ в виде снимаемых чипов. */
function activeProgramChips(f: ProgramFilters, universityName: (slug: string) => string) {
  const chips: { key: string; label: string; remove: (f: ProgramFilters) => ProgramFilters }[] = [];
  const without = <K extends keyof ProgramFilters>(k: K, v: unknown) => (x: ProgramFilters) => ({
    ...x,
    [k]: (x[k] as unknown[]).filter((y) => y !== v),
  });
  f.levels.forEach((v) => chips.push({ key: `l-${v}`, label: LEVELS[v].ru, remove: without('levels', v) }));
  f.fields.forEach((v) => chips.push({ key: `f-${v}`, label: FIELD_LABELS[v] ?? v, remove: without('fields', v) }));
  f.languages.forEach((v) => chips.push({ key: `g-${v}`, label: LANGUAGES[v], remove: without('languages', v) }));
  f.cities.forEach((v) => chips.push({ key: `c-${v}`, label: cityName(v), remove: without('cities', v) }));
  f.regions.forEach((v) => chips.push({ key: `r-${v}`, label: regionName(v), remove: without('regions', v) }));
  f.universityTypes.forEach((v) => chips.push({ key: `t-${v}`, label: UNIVERSITY_TYPES[v], remove: without('universityTypes', v) }));
  f.universities.forEach((v) => chips.push({ key: `u-${v}`, label: universityName(v), remove: without('universities', v) }));
  if (f.maxFeeEur != null) chips.push({ key: 'fee', label: t().filters.feeUpTo(f.maxFeeEur), remove: (x) => ({ ...x, maxFeeEur: null }) });
  return chips;
}

export default function SearchScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const catalog = useCatalog();
  const { tab, setTab, programFilters, setProgramFilters, universityFilters, setUniversityFilters } = useFilters();

  const programs = useMemo(() => filterPrograms(catalog.programs, programFilters), [catalog.programs, programFilters]);
  const universities = useMemo(() => filterUniversities(catalog.universities, universityFilters), [catalog.universities, universityFilters]);
  const programCount = useMemo(() => {
    const m = new Map<string, number>();
    catalog.programs.forEach((p) => m.set(p.university_id, (m.get(p.university_id) ?? 0) + 1));
    return m;
  }, [catalog.programs]);

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const isPrograms = tab === 'programs';
  const query = isPrograms ? programFilters.query : universityFilters.query;
  const setQuery = (q: string) =>
    isPrograms ? setProgramFilters((f) => ({ ...f, query: q })) : setUniversityFilters((f) => ({ ...f, query: q }));
  const activeCount = isPrograms
    ? countActiveProgramFilters(programFilters)
    : universityFilters.cities.length + universityFilters.regions.length + universityFilters.types.length;
  const uniName = (slug: string) => {
    const u = catalog.universityBySlug(slug);
    return u?.name_ru ?? u?.official_name ?? slug;
  };
  const chips = isPrograms
    ? activeProgramChips(programFilters, uniName).map((c) => ({ ...c, onRemove: () => setProgramFilters(c.remove) }))
    : [
        ...universityFilters.cities.map((v) => ({ key: `c-${v}`, label: cityName(v), onRemove: () => setUniversityFilters((f) => ({ ...f, cities: f.cities.filter((x) => x !== v) })) })),
        ...universityFilters.regions.map((v) => ({ key: `r-${v}`, label: regionName(v), onRemove: () => setUniversityFilters((f) => ({ ...f, regions: f.regions.filter((x) => x !== v) })) })),
        ...universityFilters.types.map((v) => ({ key: `t-${v}`, label: UNIVERSITY_TYPES[v], onRemove: () => setUniversityFilters((f) => ({ ...f, types: f.types.filter((x) => x !== v) })) })),
      ];
  const resetAll = () =>
    isPrograms
      ? setProgramFilters({ ...EMPTY_PROGRAM_FILTERS, sort: programFilters.sort })
      : setUniversityFilters(EMPTY_UNIVERSITY_FILTERS);

  const header = (
    <View>
      {chips.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chips.map((c) => (
            <FilterChip key={c.key} label={c.label} selected onRemove={c.onRemove} />
          ))}
          <FilterChip label={s.common.reset} onPress={resetAll} />
        </ScrollView>
      ) : null}
      <View style={styles.resultsRow}>
        <Text style={styles.results} accessibilityLiveRegion="polite" testID="results-count">
          {s.search.results(isPrograms ? programs.length : universities.length)}
        </Text>
      </View>
      {isPrograms ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipsRow, { paddingTop: 0 }]}>
          {SORTS.map((so) => (
            <FilterChip
              key={so}
              label={s.search.sort[so]}
              selected={programFilters.sort === so}
              onPress={() => setProgramFilters((f) => ({ ...f, sort: so }))}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const empty = (
    <EmptyState
      title={s.search.emptyTitle}
      text={s.search.emptyText}
      action={activeCount > 0 || query ? { title: s.search.resetFilters, onPress: () => { resetAll(); setQuery(''); } } : undefined}
    />
  );

  return (
    <View style={ui.screen}>
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={ui.h2} accessibilityRole="header">
          {s.search.title}
        </Text>
        <View style={styles.segment} accessibilityRole="tablist">
          {(['programs', 'universities'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              style={[styles.segmentItem, tab === k && styles.segmentActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              testID={`tab-${k}`}
            >
              <Text style={[styles.segmentText, tab === k && styles.segmentTextActive]}>
                {k === 'programs' ? s.search.programs : s.search.universities}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={ui.row}>
          <SearchInput
            testID="search-input"
            style={{ flex: 1 }}
            placeholder={isPrograms ? s.search.placeholderPrograms : s.search.placeholderUniversities}
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
          />
          <Pressable
            onPress={() => router.push('/filters')}
            style={[styles.filterBtn, activeCount > 0 && { backgroundColor: colors.success, borderColor: colors.success }]}
            accessibilityRole="button"
            accessibilityLabel={`${s.search.filters}${activeCount ? `, выбрано ${activeCount}` : ''}`}
            testID="open-filters"
          >
            <Ionicons name="options-outline" size={22} color={activeCount > 0 ? '#FFFFFF' : colors.text} />
            {activeCount > 0 ? <Text style={styles.filterCount}>{activeCount}</Text> : null}
          </Pressable>
        </View>
      </View>

      {isPrograms ? (
        <FlatList
          data={programs}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProgramCard program={item} />}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      ) : (
        <FlatList
          data={universities}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => <UniversityCard university={item} programCount={programCount.get(item.id)} />}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.text },
  segmentText: { ...font.bodyBold, color: colors.text },
  segmentTextActive: { color: '#FFFFFF' },
  filterBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.text,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 20,
    overflow: 'hidden',
  },
  chipsRow: { gap: spacing.sm, paddingVertical: spacing.md },
  resultsRow: { paddingVertical: spacing.sm },
  results: { ...font.bodyBold, color: colors.textMuted },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },
});
