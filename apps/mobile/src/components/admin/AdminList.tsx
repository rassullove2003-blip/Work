import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalize, VERIFICATION_LABELS, type VerificationStatus } from '@uniitalia/shared';
import { supabase } from '../../lib/supabase';
import { Button, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchInput, ui } from '../ui';
import { colors, font, radius, spacing } from '../../theme';
import { dbErrorRu } from './EditScreen';

export type Row = { id: string; status?: string; verification_status?: VerificationStatus; [k: string]: unknown };

const STATUS_RU: Record<string, string> = { draft: 'Черновик', published: 'Опубликовано', archived: 'В архиве' };

export function StatusPills({ row }: { row: Row }) {
  return (
    <View style={ui.wrap}>
      {row.status ? (
        <Text style={[styles.pill, row.status === 'published' ? styles.pillGreen : styles.pillYellow]}>{STATUS_RU[row.status] ?? row.status}</Text>
      ) : null}
      {row.verification_status ? (
        <Text style={[styles.pill, row.verification_status === 'verified' ? styles.pillGreen : styles.pillGrey]}>
          {VERIFICATION_LABELS[row.verification_status]}
        </Text>
      ) : null}
    </View>
  );
}

/** Список записей таблицы для админки: все статусы (RLS отдаёт персоналу и черновики). */
export function AdminList({
  title,
  table,
  select,
  order,
  searchText,
  renderTitle,
  renderSubtitle,
  itemPath,
  newLabel,
}: {
  title: string;
  table: string;
  select: string;
  order: string;
  searchText: (r: Row) => string;
  renderTitle: (r: Row) => string;
  renderSubtitle?: (r: Row) => string;
  itemPath: string; // например '/admin/university/[id]'
  newLabel: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from(table).select(select).order(order).limit(1000);
    if (error) setError(dbErrorRu(error.message));
    else {
      setError(null);
      setRows((data ?? []) as unknown as Row[]);
    }
  }, [table, select, order]);

  // Обновляем список при каждом возврате на экран (после сохранения/удаления).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const list = useMemo(() => (rows ?? []).filter((r) => !q || normalize(searchText(r)).includes(normalize(q))), [rows, q, searchText]);

  const open = (id: string) => router.push({ pathname: itemPath, params: { id } } as never);

  return (
    <View style={ui.screen}>
      <ScreenHeader title={title} back />
      {error && !rows ? (
        <ErrorState onRetry={load} details={error} />
      ) : !rows ? (
        <LoadingState />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <Button title={newLabel} icon="add" onPress={() => open('new')} testID="admin-new" />
              <SearchInput placeholder="Поиск" value={q} onChangeText={setQ} onClear={() => setQ('')} />
              <Text style={ui.muted}>Всего: {list.length}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState title="Ничего не найдено" text={q ? 'Измените запрос.' : 'Добавьте первую запись.'} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} accessibilityRole="button">
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{renderTitle(item)}</Text>
                {renderSubtitle ? <Text style={ui.muted} numberOfLines={2}>{renderSubtitle(item)}</Text> : null}
                <StatusPills row={item} />
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { ...font.bodyBold, color: colors.text },
  pill: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  pillGreen: { backgroundColor: colors.successSoft, color: '#00805F' },
  pillYellow: { backgroundColor: colors.warningSoft, color: '#7A5200' },
  pillGrey: { backgroundColor: colors.surface, color: colors.textMuted },
});
