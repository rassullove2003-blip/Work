import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cityName,
  FIELDS,
  filterPrograms,
  filterUniversities,
  LANGUAGES,
  LEVELS,
  REGIONS,
  UNIVERSITY_TYPES,
  type ProgramFilters,
  type PublicPrivate,
  type StudyLevel,
  type TeachingLanguage,
  type UniversityFilters,
} from '@uniitalia/shared';
import { useCatalog } from '../lib/catalog';
import { useFilters } from '../lib/filters';
import { Button, FilterChip, Notice, ScreenHeader, ui } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { t } from '../i18n';

const FEE_STEPS = [1000, 3000, 5000, 10000, 20000];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={ui.wrap}>{children}</View>
    </View>
  );
}

/** Модальный экран фильтров. Изменения применяются по кнопке «Показать». */
export default function FiltersScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const catalog = useCatalog();
  const filters = useFilters();
  const [p, setP] = useState<ProgramFilters>(filters.programFilters);
  const [u, setU] = useState<UniversityFilters>(filters.universityFilters);
  const isPrograms = filters.tab === 'programs';

  const cities = useMemo(() => [...new Set(catalog.universities.map((x) => x.city))].sort((a, b) => cityName(a).localeCompare(cityName(b), 'ru')), [catalog.universities]);
  const regions = useMemo(() => [...new Set(catalog.universities.map((x) => x.region))], [catalog.universities]);
  const universitiesWithPrograms = useMemo(
    () => catalog.universities.filter((x) => catalog.programs.some((pr) => pr.university_id === x.id)),
    [catalog.universities, catalog.programs],
  );
  const count = isPrograms ? filterPrograms(catalog.programs, p).length : filterUniversities(catalog.universities, u).length;

  const apply = () => {
    if (isPrograms) filters.setProgramFilters(p);
    else filters.setUniversityFilters(u);
    router.back();
  };
  const reset = () => {
    if (isPrograms) setP({ ...p, levels: [], fields: [], languages: [], cities: [], regions: [], universityTypes: [], universities: [], maxFeeEur: null });
    else setU({ ...u, cities: [], regions: [], types: [] });
  };

  return (
    <View style={[ui.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={s.filters.title} back right={<Button title={s.common.reset} variant="ghost" onPress={reset} style={{ paddingHorizontal: spacing.sm }} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {isPrograms ? (
          <>
            <Group title={s.filters.level}>
              {(Object.keys(LEVELS) as StudyLevel[]).map((k) => (
                <FilterChip key={k} label={LEVELS[k].ru} selected={p.levels.includes(k)} onPress={() => setP({ ...p, levels: toggle(p.levels, k) })} testID={`f-level-${k}`} />
              ))}
            </Group>
            <Group title={s.filters.field}>
              {FIELDS.map((f) => (
                <FilterChip key={f.id} label={f.ru} selected={p.fields.includes(f.id)} onPress={() => setP({ ...p, fields: toggle(p.fields, f.id) })} />
              ))}
            </Group>
            <Group title={s.filters.language}>
              {(['en', 'it'] as TeachingLanguage[]).map((k) => (
                <FilterChip key={k} label={LANGUAGES[k]} selected={p.languages.includes(k)} onPress={() => setP({ ...p, languages: toggle(p.languages, k) })} testID={`f-lang-${k}`} />
              ))}
            </Group>
            <Group title={s.filters.city}>
              {cities.map((c) => (
                <FilterChip key={c} label={cityName(c)} selected={p.cities.includes(c)} onPress={() => setP({ ...p, cities: toggle(p.cities, c) })} />
              ))}
            </Group>
            <Group title={s.filters.region}>
              {regions.map((r) => (
                <FilterChip key={r} label={REGIONS[r]?.ru ?? r} selected={p.regions.includes(r)} onPress={() => setP({ ...p, regions: toggle(p.regions, r) })} />
              ))}
            </Group>
            <Group title={s.filters.universityType}>
              {(Object.keys(UNIVERSITY_TYPES) as PublicPrivate[]).map((k) => (
                <FilterChip key={k} label={UNIVERSITY_TYPES[k]} selected={p.universityTypes.includes(k)} onPress={() => setP({ ...p, universityTypes: toggle(p.universityTypes, k) })} />
              ))}
            </Group>
            <Group title={s.filters.university}>
              {universitiesWithPrograms.map((x) => (
                <FilterChip key={x.slug} label={x.name_ru ?? x.official_name} selected={p.universities.includes(x.slug)} onPress={() => setP({ ...p, universities: toggle(p.universities, x.slug) })} />
              ))}
            </Group>
            <Group title={s.filters.fee}>
              <FilterChip label={s.filters.feeAny} selected={p.maxFeeEur == null} onPress={() => setP({ ...p, maxFeeEur: null })} />
              {FEE_STEPS.map((n) => (
                <FilterChip key={n} label={s.filters.feeUpTo(n)} selected={p.maxFeeEur === n} onPress={() => setP({ ...p, maxFeeEur: n })} />
              ))}
            </Group>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Notice text={s.filters.feeNote} />
              <Notice text={s.filters.pendingNote} />
            </View>
          </>
        ) : (
          <>
            <Group title={s.filters.city}>
              {cities.map((c) => (
                <FilterChip key={c} label={cityName(c)} selected={u.cities.includes(c)} onPress={() => setU({ ...u, cities: toggle(u.cities, c) })} testID={`f-city-${c}`} />
              ))}
            </Group>
            <Group title={s.filters.region}>
              {regions.map((r) => (
                <FilterChip key={r} label={REGIONS[r]?.ru ?? r} selected={u.regions.includes(r)} onPress={() => setU({ ...u, regions: toggle(u.regions, r) })} />
              ))}
            </Group>
            <Group title={s.filters.universityType}>
              {(Object.keys(UNIVERSITY_TYPES) as PublicPrivate[]).map((k) => (
                <FilterChip key={k} label={UNIVERSITY_TYPES[k]} selected={u.types.includes(k)} onPress={() => setU({ ...u, types: toggle(u.types, k) })} testID={`f-type-${k}`} />
              ))}
            </Group>
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={s.filters.show(count)} variant="secondary" onPress={apply} testID="apply-filters" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: spacing.xl },
  groupTitle: { ...font.h3, color: colors.text, marginBottom: spacing.md },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
