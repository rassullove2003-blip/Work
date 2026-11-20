import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCatalog } from '../../lib/catalog';
import { useFavorites } from '../../lib/favorites';
import { Button, EmptyState, ErrorState, LoadingState, Notice, Section, ui } from '../../components/ui';
import { ProgramCard, UniversityCard } from '../../components/cards';
import { spacing } from '../../theme';
import { t } from '../../i18n';

export default function ApplicationsScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const catalog = useCatalog();
  const fav = useFavorites();

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const universities = catalog.universities.filter((u) => fav.universityIds.has(u.id));
  const programs = catalog.programs.filter((p) => fav.programIds.has(p.id));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={ui.h2} accessibilityRole="header">
        {s.applications.title}
      </Text>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Notice icon="construct-outline" text={`${s.applications.trackerSoonTitle}. ${s.applications.trackerSoonText}`} />
        {fav.mode === 'local' ? <Notice tone="warning" text={s.applications.localMode} /> : null}
      </View>

      {fav.mode === 'login_required' ? (
        <View style={[ui.card, { marginTop: spacing.xl }]}>
          <EmptyState icon="lock-closed-outline" title={s.applications.loginTitle} text={s.applications.loginText} />
          <Button title={s.profile.login} onPress={() => router.push('/auth')} testID="applications-login" />
        </View>
      ) : (
        <>
          <Section title={`${s.applications.favUniversities} (${universities.length})`}>
            {universities.length ? (
              universities.map((u) => <UniversityCard key={u.id} university={u} />)
            ) : (
              <View style={ui.card}>
                <EmptyState icon="heart-outline" title={s.applications.emptyUniversities} action={{ title: s.search.universities, onPress: () => router.navigate('/search') }} />
              </View>
            )}
          </Section>
          <Section title={`${s.applications.favPrograms} (${programs.length})`}>
            {programs.length ? (
              programs.map((p) => <ProgramCard key={p.id} program={p} />)
            ) : (
              <View style={ui.card}>
                <EmptyState icon="heart-outline" title={s.applications.emptyPrograms} action={{ title: s.search.programs, onPress: () => router.navigate('/search') }} />
              </View>
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}
