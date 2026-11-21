import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { ROLE_LABELS, type StaffRole } from '@uniitalia/shared';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { confirmAction, notify } from '../../lib/links';
import { dbErrorRu, StaffGuard } from '../../components/admin/EditScreen';
import { EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, SearchInput, ui } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

type UserRow = { user_id: string; email: string; full_name: string | null; role: StaffRole | null; created_at: string };
type RoleChoice = StaffRole | 'student';

function StaffList() {
  const { userId } = useAuth();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_list_users', { search: search || null });
    if (error) setError(dbErrorRu(error.message));
    else {
      setError(null);
      setRows((data ?? []) as UserRow[]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const setRole = async (u: UserRow, choice: RoleChoice) => {
    const current: RoleChoice = u.role ?? 'student';
    if (choice === current || !supabase) return;
    const ok = await confirmAction(
      'Изменить роль?',
      `${u.email}: ${ROLE_LABELS[current]} → ${ROLE_LABELS[choice]}`,
      'Изменить',
    );
    if (!ok) return;
    const res =
      choice === 'student'
        ? await supabase.from('admin_users').delete().eq('user_id', u.user_id)
        : await supabase.from('admin_users').upsert({ user_id: u.user_id, role: choice, created_by: userId });
    if (res.error) return notify('Не удалось изменить роль', dbErrorRu(res.error.message));
    load(q.trim());
  };

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Сотрудники" back />
      {!rows ? (
        error ? <EmptyState icon="alert-circle-outline" title={error} /> : <LoadingState />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <Notice text="Куратор редактирует каталог и (скоро) отвечает студентам в чатах. Администратор дополнительно удаляет записи и управляет сотрудниками. Чтобы назначить сотрудника, он сначала регистрируется в приложении." />
              <SearchInput placeholder="Email или имя" value={q} onChangeText={setQ} onClear={() => setQ('')} autoCapitalize="none" />
            </View>
          }
          ListEmptyComponent={<EmptyState title="Пользователи не найдены" />}
          renderItem={({ item }) => {
            const me = item.user_id === userId;
            const current: RoleChoice = item.role ?? 'student';
            return (
              <View style={styles.card}>
                <Text style={styles.email}>{item.email}</Text>
                {item.full_name ? <Text style={ui.muted}>{item.full_name}</Text> : null}
                <View style={[ui.wrap, { marginTop: spacing.sm }]}>
                  {(['student', 'curator', 'admin'] as RoleChoice[]).map((r) => (
                    <FilterChip key={r} label={ROLE_LABELS[r]} selected={current === r} onPress={me ? undefined : () => setRole(item, r)} />
                  ))}
                </View>
                {me ? <Text style={[ui.muted, { marginTop: spacing.xs }]}>Это вы — свою роль изменить нельзя.</Text> : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

export default function StaffScreen() {
  return (
    <StaffGuard title="Сотрудники" adminOnly>
      <StaffList />
    </StaffGuard>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  email: { ...font.bodyBold, color: colors.text },
});
