import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { cityName, regionName, UNIVERSITY_TYPES } from '@uniitalia/shared';
import { useCatalog } from '../../lib/catalog';
import { useFavorites } from '../../lib/favorites';
import { notify, openOfficial } from '../../lib/links';
import { useCompare } from '../../lib/compare';
import { Button, EmptyState, ErrorState, InfoRow, LoadingState, Notice, ScreenHeader, Section, SourceNote, ui, VerificationBadge } from '../../components/ui';
import { FavoriteButton, ProgramCard, ScholarshipCard, UniversityAvatar } from '../../components/cards';
import { colors, font, spacing } from '../../theme';
import { t } from '../../i18n';

export default function UniversityScreen() {
  const s = t();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const catalog = useCatalog();
  const fav = useFavorites();
  const compare = useCompare();

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const u = catalog.universityBySlug(String(slug));
  if (!u) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title={s.common.notFound} back />
        <EmptyState icon="help-circle-outline" title={s.common.notFound} text={s.common.notFoundText} action={{ title: s.common.toHome, onPress: () => router.replace('/') }} />
      </View>
    );
  }

  const title = u.name_ru ?? u.official_name;
  const programs = catalog.programsOfUniversity(u.id);
  const scholarships = catalog.scholarshipsOfUniversity(u.id);
  const isFav = fav.universityIds.has(u.id);

  return (
    <View style={ui.screen}>
      <ScreenHeader title={title} back right={<FavoriteButton kind="university" id={u.id} label={title} />} />
      <ScrollView contentContainerStyle={ui.content}>
        {u.image_url ? (
          <Image source={{ uri: u.image_url }} style={styles.photo} resizeMode="cover" accessibilityLabel={`Фото: ${title}`} />
        ) : null}
        <View style={[ui.card, { gap: spacing.sm }]}>
          <View style={[ui.row, { gap: spacing.md, alignItems: 'flex-start' }]}>
            <UniversityAvatar university={u} size={72} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.h2} accessibilityRole="header">
                {title}
              </Text>
              <Text style={ui.muted}>{u.official_name}</Text>
            </View>
          </View>
          <View style={ui.wrap}>
            <Text style={styles.meta}>
              {cityName(u.city, u.city_ru)}, {regionName(u.region)} · {UNIVERSITY_TYPES[u.public_private]}
            </Text>
          </View>
          <VerificationBadge meta={u} />
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              title={isFav ? s.common.favoriteRemove : s.common.favoriteAdd}
              icon={isFav ? 'heart' : 'heart-outline'}
              variant={isFav ? 'secondary' : 'outline'}
              onPress={() => fav.toggleUniversity(u.id)}
              testID="uni-fav-button"
            />
            <Button
              title={compare.has(u.id) ? 'В сравнении — открыть' : 'Сравнить с другими'}
              icon="git-compare-outline"
              variant={compare.has(u.id) ? 'secondary' : 'outline'}
              onPress={() => {
                if (compare.has(u.id)) return router.push('/compare' as never);
                if (!compare.toggle(u.id)) notify('Можно сравнить до 4 вузов', 'Уберите один из вузов на экране сравнения.');
              }}
              testID="uni-compare-button"
            />
            {u.latitude != null ? (
              <Button title="Показать на карте" icon="map-outline" variant="outline" onPress={() => router.push({ pathname: '/map', params: { focus: u.slug } } as never)} testID="uni-map-button" />
            ) : null}
            {u.website ? <Button title={s.common.officialSite} icon="open-outline" onPress={() => openOfficial(u.website)} /> : null}
          </View>
          {fav.error ? <Text style={{ color: colors.danger }}>{fav.error}</Text> : null}
        </View>

        {u.is_demo ? (
          <View style={{ marginTop: spacing.lg }}>
            <Notice tone="warning" text={s.common.demoBanner} />
          </View>
        ) : null}

        <Section title={s.university.about}>
          <Text style={ui.body}>{u.description_ru ?? s.common.unknown}</Text>
        </Section>

        <Section title={`${s.university.programs} (${programs.length})`}>
          {programs.length ? (
            programs.map((p) => <ProgramCard key={p.id} program={p} showUniversity={false} />)
          ) : (
            <View style={ui.card}>
              <Text style={ui.muted}>{s.university.noPrograms}</Text>
            </View>
          )}
        </Section>

        <Section title={s.university.admission}>
          <View style={ui.card}>
            <Text style={ui.body}>{s.university.admissionText}</Text>
          </View>
        </Section>

        <Section title={s.university.cost}>
          <View style={ui.card}>
            <InfoRow label="Стоимость обучения" value={s.common.unknown} muted />
            <InfoRow label={s.university.housing} value={s.common.unknown} muted />
          </View>
        </Section>

        <Section title={s.university.scholarships}>
          {scholarships.length ? (
            scholarships.map((sch) => <ScholarshipCard key={sch.id} scholarship={sch} />)
          ) : (
            <View style={ui.card}>
              <Text style={ui.muted}>{s.university.noScholarships}</Text>
            </View>
          )}
        </Section>

        <Section title={s.university.contacts}>
          <View style={ui.card}>
            <InfoRow label={s.university.website} value={u.website ?? s.common.unknown} muted={!u.website} />
            <InfoRow label={s.university.address} value={u.address ?? s.common.unknown} muted={!u.address} />
          </View>
          <SourceNote meta={u} onOpen={openOfficial} />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { ...font.bodyBold, color: colors.text },
  photo: { width: '100%', height: 200, borderRadius: 16, marginBottom: spacing.md, backgroundColor: colors.border },
});
