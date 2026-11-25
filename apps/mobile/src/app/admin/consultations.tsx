import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useCatalog } from '../../lib/catalog';
import { notify } from '../../lib/links';
import { StaffGuard } from '../../components/admin/EditScreen';
import { Button, EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, ui } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

type Status = 'new' | 'in_progress' | 'closed';
interface Request {
  id: string;
  user_id: string | null;
  name: string;
  country: string | null;
  contact: string;
  education_level: string | null;
  field: string | null;
  comment: string | null;
  status: Status;
  staff_note: string | null;
  source: string | null;
  created_at: string;
}

const STATUS: { id: Status; ru: string }[] = [
  { id: 'new', ru: 'Новые' },
  { id: 'in_progress', ru: 'В работе' },
  { id: 'closed', ru: 'Закрытые' },
];

/** Ссылка для связи по контакту: телефон, email или Telegram. */
function contactLink(c: string): string | null {
  const v = c.trim();
  if (/^\S+@\S+\.\S+$/.test(v)) return `mailto:${v}`;
  if (/^@?[A-Za-z0-9_]{5,}$/.test(v) && !/^\d+$/.test(v)) return `https://t.me/${v.replace(/^@/, '')}`;
  const digits = v.replace(/[^\d+]/g, '');
  if (digits.replace('+', '').length >= 7) return `tel:${digits}`;
  return null;
}

function RequestCard({ r, onChanged }: { r: Request; onChanged: () => void }) {
  const catalog = useCatalog();
  const [note, setNote] = useState(r.staff_note ?? '');
  const [busy, setBusy] = useState(false);
  const program = r.source?.startsWith('program:') ? catalog.programBySlug(r.source.slice(8)) : undefined;
  const link = contactLink(r.contact);

  const save = async (patch: Partial<Request>) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from('consultation_requests').update(patch).eq('id', r.id);
    setBusy(false);
    if (error) notify('Не удалось сохранить', error.message);
    onChanged();
  };

  return (
    <View style={[ui.card, { gap: spacing.sm, marginBottom: spacing.md }]} testID="consultation-card">
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={ui.h3}>{r.name}</Text>
        <Text style={styles.small}>{new Date(r.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Text style={[ui.body, link && { color: colors.secondary, fontWeight: '600' }]} onPress={link ? () => Linking.openURL(link) : undefined} selectable>
        {r.contact}
      </Text>
      <Text style={ui.muted}>{[r.country, r.education_level, r.field].filter(Boolean).join(' · ') || 'Без подробностей'}</Text>
      {program ? (
        <Text style={styles.link} onPress={() => router.push({ pathname: '/program/[slug]', params: { slug: program.slug } })}>
          Программа: {program.title_original}
        </Text>
      ) : null}
      {r.comment ? (
        <View style={styles.comment}>
          <Text style={ui.body} selectable>
            {r.comment}
          </Text>
        </View>
      ) : null}
      {r.user_id ? (
        <Button title="Написать в чат" icon="chatbubbles-outline" variant="ghost" onPress={() => router.push({ pathname: '/admin/chat/[id]', params: { id: r.user_id! } } as never)} />
      ) : (
        <Text style={styles.small}>Гость без аккаунта — свяжитесь по контакту.</Text>
      )}
      <TextInput value={note} onChangeText={setNote} placeholder="Заметка для команды (студент её не видит)" placeholderTextColor={colors.textMuted} multiline maxLength={2000} style={styles.input} />
      <View style={ui.wrap}>
        {STATUS.map((s) => (
          <FilterChip key={s.id} label={s.ru} selected={r.status === s.id} onPress={() => save({ status: s.id, staff_note: note.trim() || null })} />
        ))}
        {note !== (r.staff_note ?? '') ? <Button title="Сохранить заметку" variant="outline" onPress={() => save({ staff_note: note.trim() || null })} loading={busy} /> : null}
      </View>
    </View>
  );
}

function Consultations() {
  const [rows, setRows] = useState<Request[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('new');

  const load = useCallback(() => {
    if (!supabase) return;
    supabase
      .from('consultation_requests')
      .select('id, user_id, name, country, contact, education_level, field, comment, status, staff_note, source, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error: e }) => {
        if (e) setError('Не удалось загрузить заявки');
        else setRows((data ?? []) as Request[]);
      });
  }, []);
  useFocusEffect(load);

  const list = useMemo(() => (rows ?? []).filter((r) => r.status === status), [rows, status]);
  const count = (s: Status) => (rows ?? []).filter((r) => r.status === s).length;

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Заявки на консультацию" back />
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
              <Notice text="Заявки из формы «Получить помощь с поступлением». Нажмите на контакт, чтобы позвонить, написать на почту или в Telegram. «В работе» отмечает вас ответственным." />
              <View style={ui.wrap}>
                {STATUS.map((s) => (
                  <FilterChip key={s.id} label={`${s.ru} (${count(s.id)})`} selected={status === s.id} onPress={() => setStatus(s.id)} />
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="mail-open-outline" title="Заявок нет" />}
          renderItem={({ item }) => <RequestCard key={`${item.id}-${item.status}`} r={item} onChanged={load} />}
        />
      )}
    </View>
  );
}

export default function ConsultationsRoute() {
  return (
    <StaffGuard title="Заявки на консультацию">
      <Consultations />
    </StaffGuard>
  );
}

const styles = StyleSheet.create({
  small: { fontSize: 12, color: colors.textMuted },
  link: { ...font.small, color: colors.secondary, fontWeight: '600' },
  comment: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  input: { ...font.body, color: colors.text, minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top' },
});
