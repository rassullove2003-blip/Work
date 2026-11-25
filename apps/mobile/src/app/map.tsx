import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LANGUAGES, type PublicPrivate, type TeachingLanguage } from '@uniitalia/shared';
import { useCatalog } from '../lib/catalog';
import { UniversityMap } from '../components/map/UniversityMap';
import type { MapPoint } from '../components/map/types';
import { ErrorState, FilterChip, LoadingState, ScreenHeader, ui } from '../components/ui';
import { colors, spacing } from '../theme';

export default function MapScreen() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const catalog = useCatalog();
  const [type, setType] = useState<PublicPrivate | null>(null);
  const [lang, setLang] = useState<TeachingLanguage | null>(null);

  const points = useMemo<MapPoint[]>(() => {
    const count = new Map<string, number>();
    const langs = new Map<string, Set<string>>();
    for (const p of catalog.programs) {
      count.set(p.university_id, (count.get(p.university_id) ?? 0) + 1);
      if (p.language) langs.set(p.university_id, (langs.get(p.university_id) ?? new Set<string>()).add(p.language));
    }
    return catalog.universities
      .filter((u): u is MapPoint['university'] => typeof u.latitude === 'number' && typeof u.longitude === 'number')
      .filter((u) => !type || u.public_private === type)
      .filter((u) => !lang || !!langs.get(u.id)?.has(lang))
      .map((u) => ({ university: u, programs: count.get(u.id) ?? 0 }));
  }, [catalog.universities, catalog.programs, type, lang]);

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const focusId = focus ? catalog.universityBySlug(String(focus))?.id : null;

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Карта университетов" back />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          <FilterChip
            label="Все"
            selected={!type && !lang}
            onPress={() => {
              setType(null);
              setLang(null);
            }}
          />
          <FilterChip label="Государственные" selected={type === 'public'} onPress={() => setType(type === 'public' ? null : 'public')} />
          <FilterChip label="Частные" selected={type === 'private'} onPress={() => setType(type === 'private' ? null : 'private')} />
          {(Object.keys(LANGUAGES) as TeachingLanguage[]).map((l) => (
            <FilterChip key={l} label={`Программы: ${LANGUAGES[l]}`} selected={lang === l} onPress={() => setLang(lang === l ? null : l)} />
          ))}
        </ScrollView>
        <Text style={styles.count} testID="map-count">
          Вузов на карте: {points.length}. Синие — государственные, жёлтые — частные. Координаты: © OpenStreetMap.
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <UniversityMap points={points} focusId={focusId} onOpen={(slug) => router.push({ pathname: '/university/[slug]', params: { slug } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { backgroundColor: colors.background, paddingVertical: spacing.sm, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  count: { fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.lg },
});
