import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_MIME_TYPES, DOCUMENT_REVIEW_STATUSES, documentStatusInfo, formatBytes, type DocumentStatus } from '@uniitalia/shared';
import { deleteDocument, replaceDocumentFile, reviewDocument, type StudentDocument } from '../lib/documents';
import { openStoredFile, pickFile } from '../lib/files';
import { confirmAction, notify } from '../lib/links';
import { Button, ui } from './ui';
import { colors, font, radius, spacing } from '../theme';

const TONES = {
  info: { bg: colors.secondarySoft, fg: colors.secondary },
  warning: { bg: colors.warningSoft, fg: '#9A6200' },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  success: { bg: colors.successSoft, fg: '#007A5C' },
};

export function StatusPill({ status }: { status: string }) {
  const info = documentStatusInfo(status);
  const tone = TONES[info.tone];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{info.ru}</Text>
    </View>
  );
}

/** Карточка документа. staff — режим куратора: смена статуса и комментарий. */
export function DocumentCard({ doc, staff = false, showStudent = false, onChanged }: { doc: StudentDocument; staff?: boolean; showStudent?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<DocumentStatus>(doc.status);
  const [comment, setComment] = useState(doc.staff_comment ?? '');

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) notify(ok);
      onChanged();
    } catch (e) {
      notify('Ошибка', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const open = () => run('open', () => openStoredFile('student-documents', doc.storage_path!));
  const replace = () =>
    run('replace', async () => {
      const f = await pickFile('file', DOCUMENT_MIME_TYPES);
      if (f) await replaceDocumentFile(doc, f);
    });
  const remove = async () => {
    if (await confirmAction('Удалить документ?', 'Файл будет удалён без возможности восстановления.', 'Удалить')) run('delete', () => deleteDocument(doc));
  };
  const save = () => run('save', () => reviewDocument(doc.id, status, comment), 'Проверка сохранена, студент получит уведомление');

  return (
    <View style={[ui.card, { gap: spacing.sm, marginBottom: spacing.md }]} testID={`document-${doc.id}`}>
      {showStudent ? <Text style={styles.student}>{`${doc.full_name || 'Без имени'} · ${doc.email ?? ''}`}</Text> : null}
      <View style={[ui.row, { alignItems: 'flex-start' }]}>
        <Ionicons name={doc.mime_type?.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={26} color={colors.primaryDark} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ui.h3}>{doc.title || DOCUMENT_CATEGORY_LABELS[doc.category] || 'Документ'}</Text>
          {doc.title ? <Text style={ui.muted}>{DOCUMENT_CATEGORY_LABELS[doc.category]}</Text> : null}
          <Text style={ui.muted} numberOfLines={1}>
            {doc.file_name} {doc.size_bytes ? `· ${formatBytes(doc.size_bytes)}` : ''}
          </Text>
        </View>
        <StatusPill status={doc.status} />
      </View>

      {doc.staff_comment && !staff ? (
        <View style={styles.comment} testID="document-comment">
          <Text style={styles.commentLabel}>КОММЕНТАРИЙ КУРАТОРА</Text>
          <Text style={ui.body}>{doc.staff_comment}</Text>
        </View>
      ) : null}

      <View style={ui.wrap}>
        {doc.storage_path ? <Button title="Открыть" icon="eye-outline" variant="outline" onPress={open} loading={busy === 'open'} /> : null}
        {!staff ? (
          <>
            <Button title="Заменить файл" icon="refresh-outline" variant="ghost" onPress={replace} loading={busy === 'replace'} />
            <Button title="Удалить" icon="trash-outline" variant="ghost" onPress={remove} loading={busy === 'delete'} />
          </>
        ) : null}
      </View>

      {staff ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={styles.commentLabel}>ПРОВЕРКА</Text>
          <View style={ui.wrap}>
            {DOCUMENT_REVIEW_STATUSES.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setStatus(s.id)}
                style={[styles.choice, status === s.id && { backgroundColor: TONES[s.tone].bg, borderColor: TONES[s.tone].fg }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: status === s.id }}
                testID={`review-${s.id}`}
              >
                <Text style={[styles.choiceText, status === s.id && { color: TONES[s.tone].fg }]}>{s.ru}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Комментарий для студента (что исправить)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            style={styles.input}
            testID="review-comment"
          />
          <Button title="Сохранить проверку" icon="checkmark-circle-outline" onPress={save} loading={busy === 'save'} testID="review-save" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  student: { ...font.small, fontWeight: '700', color: colors.primaryDark },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  comment: { backgroundColor: colors.secondarySoft, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  commentLabel: { ...font.caption, color: colors.primaryDark },
  choice: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center' },
  choiceText: { ...font.small, fontWeight: '600', color: colors.text },
  input: { ...font.body, color: colors.text, minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top' },
});
