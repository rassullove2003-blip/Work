import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { regionName } from '@uniitalia/shared';
import { useCatalog } from '../../lib/catalog';
import { openOfficial } from '../../lib/links';
import { Button, EmptyState, ErrorState, InfoRow, LoadingState, Notice, ScreenHeader, Section, SourceNote, ui, VerificationBadge } from '../../components/ui';
import { UniversityCard } from '../../components/cards';
import { spacing } from '../../theme';
import { t } from '../../i18n';

export default function ScholarshipScreen() {
  const s = t();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const catalog = useCatalog();

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const sch = catalog.scholarshipBySlug(String(slug));
  if (!sch) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title={s.common.notFound} back />
        <EmptyState icon="help-circle-outline" title={s.common.notFound} text={s.common.notFoundText} action={{ title: s.common.toHome, onPress: () => router.replace('/') }} />
      </View>
    );
  }
  const universities = catalog.universities.filter((u) => sch.university_ids.includes(u.id));
  const unknown = s.common.unknown;

  return (
    <View style={ui.screen}>
      <ScreenHeader title={s.tabs.scholarships} back />
      <ScrollView contentContainerStyle={ui.content}>
        <View style={[ui.card, { gap: spacing.sm }]}>
          <Text style={ui.h2} accessibilityRole="header">
            {sch.name_ru}
          </Text>
          <InfoRow label={s.scholarships.organization} value={sch.organization} />
          <InfoRow label={s.scholarships.region} value={regionName(sch.region)} />
          <VerificationBadge meta={sch} />
          {sch.website ? (
            <Button title={s.common.officialSite} icon="open-outline" onPress={() => openOfficial(sch.website)} style={{ marginTop: spacing.sm }} />
          ) : null}
        </View>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Notice tone="warning" text={s.scholarships.disclaimer} />
        </View>

        <Section title="Описание">
          <Text style={ui.body}>{sch.description_ru ?? unknown}</Text>
        </Section>

        <Section title="Подробности">
          <View style={ui.card}>
            <InfoRow label="Учебный год" value={sch.academic_year ?? unknown} muted={!sch.academic_year} />
            <InfoRow label="Категория студентов" value={unknown} muted />
            <InfoRow label={s.scholarships.conditions} value={unknown} muted />
            <InfoRow label={s.scholarships.support} value={unknown} muted />
            <InfoRow label={s.scholarships.documents} value={unknown} muted />
            <InfoRow label={s.scholarships.deadlines} value={unknown} muted />
            <InfoRow label={s.scholarships.process} value="Заявка подаётся на сайте организации по правилам актуального bando." />
            <InfoRow label="Проверка результатов" value="Списки idonei и vincitori публикуются на сайте организации." />
          </View>
        </Section>

        <Section title={`${s.scholarships.universities} (${universities.length})`}>
          {universities.map((u) => (
            <UniversityCard key={u.id} university={u} />
          ))}
        </Section>

        <SourceNote meta={sch} onOpen={openOfficial} />
      </ScrollView>
    </View>
  );
}
