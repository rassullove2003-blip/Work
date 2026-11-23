import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cityName, FIELD_LABELS, formatDuration, formatFee, LANGUAGES, LEVELS } from '@uniitalia/shared';
import { useCatalog } from '../../lib/catalog';
import { useFavorites } from '../../lib/favorites';
import { openOfficial } from '../../lib/links';
import { Button, EmptyState, ErrorState, InfoRow, LoadingState, Notice, ScreenHeader, Section, SourceNote, ui, VerificationBadge } from '../../components/ui';
import { FavoriteButton, ScholarshipCard, UniversityAvatar } from '../../components/cards';
import { DeadlineCard } from '../../components/DeadlineCard';
import { AddToApplications } from '../../components/AddToApplications';
import { RequirementsView } from '../../components/RequirementsView';
import { colors, spacing } from '../../theme';
import { t } from '../../i18n';

export default function ProgramScreen() {
  const s = t();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const catalog = useCatalog();
  const fav = useFavorites();

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const p = catalog.programBySlug(String(slug));
  if (!p) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title={s.common.notFound} back />
        <EmptyState icon="help-circle-outline" title={s.common.notFound} text={s.common.notFoundText} action={{ title: s.common.toHome, onPress: () => router.replace('/') }} />
      </View>
    );
  }

  const u = p.university;
  const uniName = u.name_ru ?? u.official_name;
  const scholarships = catalog.scholarshipsOfUniversity(u.id);
  const officialUrl = p.program_url ?? u.website;
  const isFav = fav.programIds.has(p.id);
  const fee = formatFee(p);
  const unknown = s.common.unknown;

  return (
    <View style={ui.screen}>
      <ScreenHeader title={LEVELS[p.level].ru} back right={<FavoriteButton kind="program" id={p.id} label={p.title_original} />} />
      <ScrollView contentContainerStyle={ui.content}>
        <View style={[ui.card, { gap: spacing.sm }]}>
          <Text style={ui.h2} accessibilityRole="header">
            {p.title_original}
          </Text>
          {p.title_ru ? <Text style={[ui.body, { color: colors.textMuted }]}>{p.title_ru}</Text> : null}
          <Pressable
            onPress={() => router.push({ pathname: '/university/[slug]', params: { slug: u.slug } })}
            style={[ui.row, { marginTop: spacing.sm, minHeight: 44 }]}
            accessibilityRole="link"
            accessibilityLabel={`${s.program.university}: ${uniName}`}
          >
            <UniversityAvatar university={u} size={36} />
            <Text style={[ui.body, { flex: 1, color: colors.secondary, fontWeight: '600' }]}>{uniName}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>
          <View style={ui.wrap}>
            {p.fields.map((f) => (
              <Text key={f} style={{ backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                {(FIELD_LABELS[f] ?? f).toUpperCase()}
              </Text>
            ))}
          </View>
          <VerificationBadge meta={p} />
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              title={isFav ? s.common.favoriteRemove : 'Сохранить в избранное'}
              icon={isFav ? 'heart' : 'heart-outline'}
              variant={isFav ? 'secondary' : 'outline'}
              onPress={() => fav.toggleProgram(p.id)}
              testID="program-fav-button"
            />
            <AddToApplications program={p} />
            {officialUrl ? <Button title={s.common.officialSite} icon="open-outline" onPress={() => openOfficial(officialUrl)} /> : null}
          </View>
          {fav.error ? <Text style={{ color: colors.danger }}>{fav.error}</Text> : null}
        </View>

        {p.is_demo ? (
          <View style={{ marginTop: spacing.lg }}>
            <Notice tone="warning" text="Демонстрационная запись: название программы и университет указаны по открытым данным, но не сверены с официальной страницей на текущий учебный год. Стоимость, требования и сроки уточняются." />
          </View>
        ) : null}

        <Section title="Основное">
          <View style={ui.card}>
            <InfoRow label={s.program.originalName} value={p.title_original} />
            <InfoRow label={s.program.level} value={`${LEVELS[p.level].ru} (${LEVELS[p.level].it})`} />
            <InfoRow label={s.program.duration} value={formatDuration(p)} />
            <InfoRow label={s.program.language} value={p.language ? LANGUAGES[p.language] : unknown} muted={!p.language} />
            <InfoRow label={s.program.city} value={cityName(u.city, u.city_ru)} />
            <InfoRow label={s.program.fee} value={p.academic_year && fee !== unknown ? `${fee} (${s.program.feeYear(p.academic_year)})` : fee} muted={fee === unknown} />
            {p.fee_notes_ru ? <InfoRow label="Стоимость: пояснение" value={p.fee_notes_ru} /> : null}
            <InfoRow label={s.program.curriculum} value={p.curriculum_url ? p.curriculum_url.replace(/^https?:\/\//, '') : unknown} muted={!p.curriculum_url} />
          </View>
          {p.curriculum_url ? (
            <Button title={s.program.openCurriculum} variant="outline" icon="document-text-outline" onPress={() => openOfficial(p.curriculum_url)} style={{ marginTop: spacing.md }} />
          ) : null}
        </Section>

        <Section title={s.program.requirements}>
          <RequirementsView requirements={catalog.requirementsOfProgram(p.id)} />
        </Section>

        <Section title={s.program.deadlines}>
          {catalog.deadlinesOfProgram(p.id).length ? (
            catalog.deadlinesOfProgram(p.id).map((d) => <DeadlineCard key={d.id} deadline={d} showTarget={false} />)
          ) : (
            <View style={ui.card}>
              <Text style={ui.muted}>{unknown}</Text>
            </View>
          )}
        </Section>

        <Section title={s.program.scholarships}>
          {scholarships.length ? (
            scholarships.map((sch) => <ScholarshipCard key={sch.id} scholarship={sch} />)
          ) : (
            <View style={ui.card}>
              <Text style={ui.muted}>{s.university.noScholarships}</Text>
            </View>
          )}
        </Section>

        <SourceNote meta={p} onOpen={openOfficial} />
      </ScrollView>
    </View>
  );
}
