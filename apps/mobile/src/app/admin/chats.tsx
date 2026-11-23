import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalize } from '@uniitalia/shared';
import { staffChats, type StaffChatRow } from '../../lib/chat';
import { supabase } from '../../lib/supabase';
import { StaffGuard } from '../../components/admin/EditScreen';
import { EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, SearchInput, ui } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function StaffChats() {
  const [rows, setRows] = useState<StaffChatRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(() => {
    staffChats()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  // Новые сообщения обновляют список сразу.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const ch = client
      .channel(`staff-chats-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, load)
      .subscribe();
    return () => {
      client.removeChannel(ch);
    };
  }, [load]);

  const list = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !onlyUnread || r.unread)
        .filter((r) => !q || normalize(`${r.full_name ?? ''} ${r.email}`).includes(normalize(q))),
    [rows, q, onlyUnread],
  );
  const unreadCount = (rows ?? []).filter((r) => r.unread).length;

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Чаты со студентами" back />
      {error ? (
        <EmptyState icon="alert-circle-outline" title={error} />
      ) : !rows ? (
        <LoadingState />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.student_id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              <Notice text="Каждый студент пишет в общий чат кураторов. Ответить может любой куратор — студент увидит ответ сразу." />
              <SearchInput placeholder="Имя или почта" value={q} onChangeText={setQ} onClear={() => setQ('')} />
              <View style={ui.row}>
                <FilterChip label="Все" selected={!onlyUnread} onPress={() => setOnlyUnread(false)} />
                <FilterChip label={`Без ответа (${unreadCount})`} selected={onlyUnread} onPress={() => setOnlyUnread(true)} />
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="Сообщений пока нет" text="Чаты появятся, когда студенты напишут куратору." />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/admin/chat/[id]', params: { id: item.student_id } } as never)}
              style={({ pressed }) => [styles.row, item.unread && styles.unread, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              testID="staff-chat-row"
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={ui.row}>
                  <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                    {item.full_name || item.email}
                  </Text>
                  <Text style={styles.time}>{when(item.last_message_at)}</Text>
                </View>
                {item.full_name ? <Text style={styles.time}>{item.email}</Text> : null}
                <Text style={ui.muted} numberOfLines={2}>
                  {item.last_from_staff ? 'Вы: ' : ''}
                  {item.last_message_preview}
                </Text>
              </View>
              {item.unread ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

export default function StaffChatsRoute() {
  return (
    <StaffGuard title="Чаты со студентами">
      <StaffChats />
    </StaffGuard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  unread: { borderColor: colors.secondary, backgroundColor: colors.secondarySoft },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { ...font.bodyBold, color: colors.text },
  time: { fontSize: 12, color: colors.textMuted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary },
});
