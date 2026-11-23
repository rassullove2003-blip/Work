import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DOCUMENT_REVIEW_STATUSES, normalize, type DocumentStatus } from '@uniitalia/shared';
import { staffDocuments, type StudentDocument } from '../../lib/documents';
import { StaffGuard } from '../../components/admin/EditScreen';
import { DocumentCard } from '../../components/DocumentCard';
import { EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, SearchInput, ui } from '../../components/ui';
import { spacing } from '../../theme';

function StaffDocuments() {
  const [docs, setDocs] = useState<StudentDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DocumentStatus | null>('uploaded');

  const load = useCallback(() => {
    staffDocuments()
      .then((d) => {
        setDocs(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const list = useMemo(
    () =>
      (docs ?? [])
        .filter((d) => !status || d.status === status)
        .filter((d) => !q || normalize(`${d.full_name ?? ''} ${d.email ?? ''} ${d.title ?? ''} ${d.file_name ?? ''}`).includes(normalize(q))),
    [docs, q, status],
  );

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Документы студентов" back />
      {error ? (
        <EmptyState icon="alert-circle-outline" title={error} />
      ) : !docs ? (
        <LoadingState />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(d) => `${d.id}-${d.updated_at}`}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <Notice text="По умолчанию показаны документы, которые ждут проверки. Откройте файл, выберите результат и сохраните — студент получит уведомление." />
              <SearchInput placeholder="Студент или название" value={q} onChangeText={setQ} onClear={() => setQ('')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                <FilterChip label="Все" selected={!status} onPress={() => setStatus(null)} />
                {DOCUMENT_REVIEW_STATUSES.map((s) => (
                  <FilterChip key={s.id} label={s.ru} selected={status === s.id} onPress={() => setStatus(status === s.id ? null : s.id)} />
                ))}
              </ScrollView>
              <Text style={ui.muted}>Документов: {list.length}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="document-text-outline" title="Документов нет" text={status === 'uploaded' ? 'Все документы проверены.' : undefined} />}
          renderItem={({ item }) => <DocumentCard doc={item} staff showStudent onChanged={load} />}
        />
      )}
    </View>
  );
}

export default function StaffDocumentsRoute() {
  return (
    <StaffGuard title="Документы студентов">
      <StaffDocuments />
    </StaffGuard>
  );
}
