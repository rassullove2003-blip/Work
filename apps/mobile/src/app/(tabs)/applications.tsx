import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCatalog } from '../../lib/catalog';
import { useFavorites } from '../../lib/favorites';
import { useAuth } from '../../lib/auth';
import { listMyApplications, nextDueTask, type Application, type ApplicationTask } from '../../lib/applications';
import { Button, EmptyState, ErrorState, LoadingState, Notice, Section, ui } from '../../components/ui';
import { ProgramCard, UniversityCard } from '../../components/cards';
import { ApplicationCard } from '../../components/ApplicationCard';
import { CabinetLinks } from '../../components/CabinetLinks';
import { useCompare } from '../../lib/compare';
import { spacing } from '../../theme';
import { t } from '../../i18n';

function MyApplications({ userId }: { userId: string }) {
  const catalog = useCatalog();
  const [data, setData] = useState<{ apps: Application[]; tasks: ApplicationTask[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyApplications(userId)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [userId]);
  useFocusEffect(load);

  if (error) return <Notice tone="warning" text={error} />;
  if (!data) return <Text style={ui.muted}>Загрузка…</Text>;
  if (data.apps.length === 0) {
    return (
      <View style={ui.card}>
        <EmptyState
          icon="school-outline"
          title="Вы ещё не добавили ни одной программы"
          text="Найдите программу и нажмите «Добавить в мои поступления» — появятся этапы, чек-лист и сроки."
          action={{ title: 'Найти программу', onPress: () => router.navigate('/search') }}
        />
      </View>
    );
  }
  return (
    <View>
      {data.apps.map((a) => {
        const p = catalog.programs.find((x) => x.id === a.program_id);
        const tasks = data.tasks.filter((x) => x.application_id === a.id);
        const next = nextDueTask(tasks);
        return (
          <ApplicationCard
            key={a.id}
            id={a.id}
            title={p?.title_original ?? 'Программа недоступна'}
            subtitle={p ? p.university.name_ru ?? p.university.official_name : 'снята с публикации'}
            year={a.academic_year}
            status={a.status}
            nextDue={next ? { title: next.title, date: next.due_date! } : null}
            openTasks={tasks.filter((x) => !x.done).length}
          />
        );
      })}
      <Button title="Добавить программу" variant="outline" icon="add" onPress={() => router.navigate('/search')} />
    </View>
  );
}

export default function ApplicationsScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const catalog = useCatalog();
  const fav = useFavorites();
  const auth = useAuth();
  const compare = useCompare();
  const [refreshKey, setRefreshKey] = useState(0);

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const universities = catalog.universities.filter((u) => fav.universityIds.has(u.id));
  const programs = catalog.programs.filter((p) => fav.programIds.has(p.id));

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefreshKey((k) => k + 1)} />}
    >
      <Text style={ui.h2} accessibilityRole="header">
        {s.applications.title}
      </Text>

      {!auth.enabled ? (
        <View style={{ marginTop: spacing.md }}>
          <Notice tone="warning" text={s.applications.localMode} />
        </View>
      ) : !auth.userId ? (
        <View style={[ui.card, { marginTop: spacing.xl }]}>
          <EmptyState icon="lock-closed-outline" title="Войдите, чтобы вести поступления" text="Каталог доступен без регистрации. Аккаунт нужен, чтобы отслеживать заявки, задачи и сроки, а также сохранять избранное." />
          <Button title={s.profile.login} onPress={() => router.push('/auth')} testID="applications-login" />
        </View>
      ) : (
        <>
          <Section title="Мои заявки">
            <MyApplications key={refreshKey} userId={auth.userId} />
          </Section>
          <Section title="Кабинет">
            <CabinetLinks />
          </Section>
        </>
      )}

      {fav.mode !== 'login_required' ? (
        <>
          <Section title={`${s.applications.favUniversities} (${universities.length})`}>
            {universities.length ? (
              universities.map((u) => <UniversityCard key={u.id} university={u} />)
            ) : (
              <View style={ui.card}>
                <Text style={ui.muted}>{s.applications.emptyUniversities}</Text>
              </View>
            )}
            {universities.length >= 2 ? (
              <Button
                title={universities.length > 4 ? 'Сравнить первые 4 избранных вуза' : 'Сравнить избранные вузы'}
                icon="git-compare-outline"
                variant="outline"
                onPress={() => {
                  compare.setAll(universities.map((u) => u.id));
                  router.push('/compare' as never);
                }}
                testID="compare-favorites"
              />
            ) : null}
          </Section>
          <Section title={`${s.applications.favPrograms} (${programs.length})`}>
            {programs.length ? (
              programs.map((p) => <ProgramCard key={p.id} program={p} />)
            ) : (
              <View style={ui.card}>
                <Text style={ui.muted}>{s.applications.emptyPrograms}</Text>
              </View>
            )}
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}
