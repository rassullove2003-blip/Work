import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNotifications, type AppNotification } from '../lib/notifications';
import { useAuth } from '../lib/auth';
import { EmptyState, LoadingState, Notice, ScreenHeader, ui, type IconName } from '../components/ui';
import { colors, font, radius, spacing } from '../theme';

const ICONS: Record<AppNotification['kind'], IconName> = {
  chat: 'chatbubble-ellipses-outline',
  status: 'school-outline',
  comment: 'create-outline',
  document: 'document-text-outline',
  deadline: 'calendar-outline',
  task: 'checkbox-outline',
};

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function NotificationsScreen() {
  const auth = useAuth();
  const n = useNotifications();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    n.list()
      .then((list) => {
        setItems(list);
        setError(null);
        if (list.some((x) => !x.read_at)) n.markAllRead();
      })
      .catch((e: Error) => setError(e.message));
    // n.list/markAllRead стабильны в пределах пользователя
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.userId]);
  useFocusEffect(load);

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Уведомления" back />
      {!auth.userId ? (
        <EmptyState icon="lock-closed-outline" title="Войдите в аккаунт" action={{ title: 'Войти', onPress: () => router.push('/auth') }} />
      ) : error ? (
        <EmptyState icon="alert-circle-outline" title={error} />
      ) : !items ? (
        <LoadingState />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListHeaderComponent={<Notice text="Здесь появляются ответы куратора, проверка документов и изменения в ваших поступлениях." />}
          ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="Уведомлений пока нет" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => item.link && router.push(item.link as never)}
              style={({ pressed }) => [styles.item, !item.read_at && styles.unread, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              testID="notification-item"
            >
              <Ionicons name={ICONS[item.kind] ?? 'notifications-outline'} size={22} color={colors.primaryDark} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{item.title}</Text>
                {item.body ? (
                  <Text style={ui.muted} numberOfLines={3}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={styles.time}>{when(item.created_at)}</Text>
              </View>
              {!item.read_at ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', backgroundColor: colors.background, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  unread: { borderColor: colors.secondary, backgroundColor: colors.secondarySoft },
  title: { ...font.bodyBold, color: colors.text },
  time: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary, marginTop: 6 },
});
