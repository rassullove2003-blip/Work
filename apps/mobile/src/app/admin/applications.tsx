import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { APPLICATION_STATUSES, normalize, type ApplicationStatus } from '@uniitalia/shared';
import { staffApplications, type StaffApplicationRow } from '../../lib/applications';
import { StaffGuard } from '../../components/admin/EditScreen';
import { ApplicationCard } from '../../components/ApplicationCard';
import { EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, SearchInput, ui } from '../../components/ui';
import { spacing } from '../../theme';

function StaffApplications() {
  const [rows, setRows] = useState<StaffApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | null>(null);

  const load = useCallback(() => {
    staffApplications()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const list = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !status || r.status === status)
        .filter((r) => !q || normalize(`${r.full_name ?? ''} ${r.email} ${r.program_title} ${r.university_name}`).includes(normalize(q))),
    [rows, q, status],
  );

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Заявки студентов" back />
      {error ? (
        <EmptyState icon="alert-circle-outline" title={error} />
      ) : !rows ? (
        <LoadingState />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <Notice text="Здесь видны все поступления студентов. Откройте заявку, чтобы сменить этап, оставить комментарий или добавить задачу." />
              <SearchInput placeholder="Имя, почта или программа" value={q} onChangeText={setQ} onClear={() => setQ('')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                <FilterChip label="Все" selected={!status} onPress={() => setStatus(null)} />
                {APPLICATION_STATUSES.map((s) => (
                  <FilterChip key={s.id} label={s.ru} selected={status === s.id} onPress={() => setStatus(status === s.id ? null : s.id)} />
                ))}
              </ScrollView>
              <Text style={ui.muted}>Заявок: {list.length}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="school-outline" title="Заявок пока нет" text="Они появятся, когда студенты добавят программы в «Мои поступления»." />}
          renderItem={({ item }) => (
            <ApplicationCard
              id={item.id}
              person={`${item.full_name || 'Без имени'} · ${item.email}`}
              title={item.program_title}
              subtitle={item.university_name}
              year={item.academic_year}
              status={item.status}
              openTasks={Number(item.open_tasks)}
            />
          )}
        />
      )}
    </View>
  );
}

export default function StaffApplicationsRoute() {
  return (
    <StaffGuard title="Заявки студентов">
      <StaffApplications />
    </StaffGuard>
  );
}
