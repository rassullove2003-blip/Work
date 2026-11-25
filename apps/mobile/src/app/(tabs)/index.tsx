import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buildSuggestions, cityName, FIELDS, HOME_CITIES, type StudyLevel } from '@uniitalia/shared';
import { useCatalog } from '../../lib/catalog';
import { useFilters } from '../../lib/filters';
import { EmptyState, ErrorState, FilterChip, LoadingState, Logo, Notice, SearchInput, Section, ui, type IconName } from '../../components/ui';
import { ScholarshipCard, UniversityCard } from '../../components/cards';
import { DeadlineCard, upcoming } from '../../components/DeadlineCard';
import { RulesHome } from '../../components/RulesHome';
import { HelpHomeCard, VisaHomeCard } from '../../components/VisaHomeCard';
import { colors, font, radius, spacing } from '../../theme';
import { t } from '../../i18n';

const POPULAR_FIELDS = ['economics', 'business', 'computer_science', 'ai', 'data_science', 'engineering', 'medicine', 'architecture', 'law', 'political_science'];

export default function HomeScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const catalog = useCatalog();
  const { setTab, setProgramFilters, setUniversityFilters } = useFilters();
  const [query, setQuery] = useState('');

  const suggestions = useMemo(
    () => buildSuggestions(query, catalog.universities, catalog.programs),
    [query, catalog.universities, catalog.programs],
  );

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const featured = catalog.universities.filter((u) => u.featured);
  const cityCounts = HOME_CITIES.map((id) => ({ id, n: catalog.universities.filter((u) => u.city === id).length })).filter((c) => c.n > 0);

  /** Переход в поиск программ с заданными фильтрами (остальные фильтры сбрасываются). */
  const searchPrograms = (patch: { levels?: StudyLevel[]; languages?: ('en' | 'it')[]; fields?: string[]; query?: string }) => {
    setProgramFilters((prev) => ({
      ...prev,
      query: patch.query ?? '',
      levels: patch.levels ?? [],
      languages: patch.languages ?? [],
      fields: patch.fields ?? [],
      cities: [],
      regions: [],
      universityTypes: [],
      universities: [],
      maxFeeEur: null,
    }));
    setTab('programs');
    router.navigate('/search');
  };

  const searchUniversitiesInCity = (city: string) => {
    setUniversityFilters({ query: '', cities: [city], regions: [], types: [] });
    setTab('universities');
    router.navigate('/search');
  };

  const quick: { label: string; icon: IconName; onPress: () => void }[] = [
    { label: s.home.quick.bachelor, icon: 'school-outline', onPress: () => searchPrograms({ levels: ['bachelor'] }) },
    { label: s.home.quick.master, icon: 'library-outline', onPress: () => searchPrograms({ levels: ['master'] }) },
    { label: s.home.quick.foundation, icon: 'construct-outline', onPress: () => searchPrograms({ levels: ['foundation'] }) },
    { label: s.home.quick.scholarships, icon: 'ribbon-outline', onPress: () => router.navigate('/scholarships') },
    { label: s.home.quick.english, icon: 'language-outline', onPress: () => searchPrograms({ languages: ['en'] }) },
    { label: s.home.quick.deadlines, icon: 'calendar-outline', onPress: () => router.push('/deadlines') },
    { label: 'Правила поступления', icon: 'book-outline', onPress: () => router.push('/rules' as never) },
    { label: 'Виза', icon: 'airplane-outline', onPress: () => router.push('/visa' as never) },
    { label: 'Сравнение вузов', icon: 'git-compare-outline', onPress: () => router.push('/compare' as never) },
  ];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: spacing.xxl * 2 }} keyboardShouldPersistTaps="handled">
      <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <Logo onPrimary />
        <View style={styles.sticker}>
          <Text style={styles.stickerText}>{s.slogan}</Text>
        </View>
        <Text style={styles.heroSubtitle}>{s.home.subtitle}</Text>
        <SearchInput
          testID="home-search"
          placeholder={s.home.searchPlaceholder}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          onSubmitEditing={() => query.trim() && searchPrograms({ query: query.trim() })}
        />
        {suggestions.length > 0 ? (
          <View style={styles.suggestions} accessibilityRole="list">
            {suggestions.map((sg) => (
              <Pressable
                key={`${sg.kind}-${sg.id}`}
                style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surface }]}
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  if (sg.kind === 'university') router.push({ pathname: '/university/[slug]', params: { slug: sg.id } });
                  else if (sg.kind === 'program') router.push({ pathname: '/program/[slug]', params: { slug: sg.id } });
                  else searchUniversitiesInCity(sg.id);
                }}
              >
                <Ionicons
                  name={sg.kind === 'city' ? 'location-outline' : sg.kind === 'university' ? 'business-outline' : 'book-outline'}
                  size={20}
                  color={colors.primaryDark}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sgTitle} numberOfLines={1}>
                    {sg.title}
                  </Text>
                  <Text style={styles.sgSub} numberOfLines={1}>
                    {sg.subtitle}
                  </Text>
                </View>
              </Pressable>
            ))}
            <Pressable style={styles.suggestion} onPress={() => searchPrograms({ query: query.trim() })} accessibilityRole="button">
              <Ionicons name="search" size={20} color={colors.secondary} />
              <Text style={[styles.sgTitle, { color: colors.secondary }]}>Все результаты по запросу «{query.trim()}»</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        {catalog.hasDemoData ? (
          <View style={{ marginTop: spacing.lg }}>
            <Notice tone="warning" text={s.common.demoBanner} />
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.lg }} contentContainerStyle={{ gap: spacing.sm }}>
          {quick.map((q) => (
            <FilterChip key={q.label} label={q.label} icon={q.icon} onPress={q.onPress} />
          ))}
        </ScrollView>

        <RulesHome />

        <VisaHomeCard />
        <HelpHomeCard />

        <Section title={s.home.popularUniversities} action={{ title: s.common.showAll, onPress: () => { setUniversityFilters({ query: '', cities: [], regions: [], types: [] }); setTab('universities'); router.navigate('/search'); } }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedContent}>
            {featured.map((u) => (
              <UniversityCard key={u.id} university={u} variant="tile" />
            ))}
          </ScrollView>
        </Section>

        <Section title={s.home.byCity}>
          <View style={styles.cityGrid}>
            {cityCounts.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => searchUniversitiesInCity(c.id)}
                style={({ pressed }) => [styles.city, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={`${cityName(c.id)}, ${s.home.universitiesCount(c.n)}`}
                testID={`city-${c.id}`}
              >
                <Text style={styles.cityName}>{cityName(c.id)}</Text>
                <Text style={styles.cityCount}>{s.home.universitiesCount(c.n)}</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title={s.home.popularFields}>
          <View style={ui.wrap}>
            {POPULAR_FIELDS.map((id) => (
              <FilterChip key={id} label={FIELDS.find((f) => f.id === id)!.ru} onPress={() => searchPrograms({ fields: [id] })} />
            ))}
          </View>
        </Section>

        <Section title={s.home.scholarships} action={{ title: s.common.showAll, onPress: () => router.navigate('/scholarships') }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedContent}>
            {catalog.scholarships.slice(0, 6).map((sch) => (
              <ScholarshipCard key={sch.id} scholarship={sch} variant="tile" />
            ))}
          </ScrollView>
        </Section>

        <Section title={s.home.deadlines} action={{ title: s.common.showAll, onPress: () => router.push('/deadlines') }}>
          {upcoming(catalog.deadlines, true, 3).length ? (
            upcoming(catalog.deadlines, true, 3).map((d) => <DeadlineCard key={d.id} deadline={d} />)
          ) : (
            <View style={ui.card}>
              <EmptyState icon="calendar-outline" title={s.home.noDeadlinesTitle} text={s.home.noDeadlinesText} />
            </View>
          )}
        </Section>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    gap: spacing.md,
  },
  sticker: {
    alignSelf: 'flex-start',
    backgroundColor: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    transform: [{ rotate: '-1.5deg' }],
    marginTop: spacing.md,
  },
  stickerText: { ...font.h2, color: '#FFFFFF' },
  heroSubtitle: { ...font.bodyBold, color: colors.text },
  suggestions: { backgroundColor: colors.background, borderRadius: radius.lg, paddingVertical: spacing.xs, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 48 },
  sgTitle: { ...font.bodyBold, color: colors.text, flexShrink: 1 },
  sgSub: { ...font.small, color: colors.textMuted },
  bleed: { marginHorizontal: -spacing.lg },
  bleedContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  city: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 64,
  },
  cityName: { ...font.bodyBold, color: colors.text },
  cityCount: { ...font.small, color: colors.textMuted },
});
