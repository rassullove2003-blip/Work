import React, { useCallback, useState } from 'react';
import { Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { DOCUMENT_CATEGORIES, DOCUMENT_MIME_TYPES, type DocumentCategory } from '@uniitalia/shared';
import { useAuth } from '../lib/auth';
import { useStaff } from '../lib/staff';
import { addDocument, listDocuments, staffDocuments, type StudentDocument } from '../lib/documents';
import { pickFile, type PickSource } from '../lib/files';
import { notify } from '../lib/links';
import { DocumentCard } from '../components/DocumentCard';
import { Button, EmptyState, FilterChip, FormField, LoadingState, Notice, ScreenHeader, Section, ui } from '../components/ui';
import { spacing } from '../theme';

function UploadForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<PickSource | null>(null);

  const upload = async (source: PickSource) => {
    if (!category) return notify('Выберите тип документа');
    setBusy(source);
    try {
      const f = await pickFile(source, DOCUMENT_MIME_TYPES);
      if (!f) return;
      await addDocument(userId, category, title, f);
      setTitle('');
      setCategory(null);
      onDone();
    } catch (e) {
      notify('Не удалось загрузить', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[ui.card, { gap: spacing.md }]}>
      <Text style={ui.muted}>1. Выберите тип документа</Text>
      <View style={ui.wrap}>
        {DOCUMENT_CATEGORIES.map((c) => (
          <FilterChip key={c.id} label={c.ru} selected={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
        ))}
      </View>
      <FormField label="2. Название (необязательно)" value={title} onChangeText={setTitle} placeholder="Например: Аттестат с переводом" maxLength={200} testID="document-title" />
      <Text style={ui.muted}>3. Загрузите файл — PDF, JPG, PNG или HEIC, до 10 МБ</Text>
      <View style={{ gap: spacing.sm }}>
        {Platform.OS !== 'web' ? <Button title="Сфотографировать" icon="camera-outline" variant="secondary" onPress={() => upload('camera')} loading={busy === 'camera'} disabled={!category} /> : null}
        <Button title="Выбрать фото" icon="images-outline" variant="outline" onPress={() => upload('gallery')} loading={busy === 'gallery'} disabled={!category} />
        <Button title="Выбрать файл (PDF)" icon="document-outline" variant="outline" onPress={() => upload('file')} loading={busy === 'file'} disabled={!category} testID="document-upload-file" />
      </View>
    </View>
  );
}

export default function DocumentsScreen() {
  const { student } = useLocalSearchParams<{ student?: string }>();
  const auth = useAuth();
  const staff = useStaff();
  const staffMode = !!student && student !== auth.userId && staff.isStaff;
  const ownerId = staffMode ? String(student) : auth.userId;
  const [docs, setDocs] = useState<StudentDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!ownerId) return;
    (staffMode ? staffDocuments(ownerId) : listDocuments(ownerId))
      .then((d) => {
        setDocs(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [ownerId, staffMode]);
  useFocusEffect(load);

  if (!auth.userId) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title="Мои документы" back />
        <EmptyState icon="lock-closed-outline" title="Войдите в аккаунт" text="Документы хранятся в защищённом хранилище и видны только вам и вашему куратору." action={{ title: 'Войти', onPress: () => router.push('/auth') }} />
      </View>
    );
  }
  if (staff.loading) return <LoadingState />;

  const studentName = staffMode && docs?.[0] ? docs[0].full_name || docs[0].email : null;

  return (
    <View style={ui.screen}>
      <ScreenHeader title={staffMode ? 'Документы студента' : 'Мои документы'} back />
      <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {staffMode ? (
          <Notice text={`${studentName ? `${studentName}. ` : ''}Откройте файл, выберите результат проверки и при необходимости напишите, что исправить. Студент получит уведомление.`} />
        ) : (
          <>
            <Notice text="Файлы хранятся в защищённом хранилище. Их видите только вы и кураторы UniItalia. После проверки здесь появится статус и комментарий." />
            <Section title="Загрузить документ">
              <UploadForm userId={auth.userId} onDone={load} />
            </Section>
          </>
        )}

        <Section title={docs ? `Загружено: ${docs.length}` : 'Документы'}>
          {error ? (
            <Notice tone="warning" text={error} />
          ) : !docs ? (
            <Text style={ui.muted}>Загрузка…</Text>
          ) : docs.length === 0 ? (
            <View style={ui.card}>
              <Text style={ui.muted}>{staffMode ? 'Студент ещё не загрузил документы.' : 'Вы ещё не загрузили ни одного документа.'}</Text>
            </View>
          ) : (
            docs.map((d) => <DocumentCard key={`${d.id}-${d.updated_at}`} doc={d} staff={staffMode} onChanged={load} />)
          )}
        </Section>
      </ScrollView>
    </View>
  );
}
