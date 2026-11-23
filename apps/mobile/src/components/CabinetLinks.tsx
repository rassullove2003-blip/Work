import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNotifications } from '../lib/notifications';
import { ui, type IconName } from './ui';
import { colors, font, radius, spacing } from '../theme';

export function CountBadge({ count, testID }: { count: number; testID?: string }) {
  if (!count) return null;
  return (
    <View style={styles.badge} testID={testID} accessibilityLabel={`Непрочитанных: ${count}`}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export function MenuRow({ icon, title, text, count, href, testID }: { icon: IconName; title: string; text?: string; count?: number; href: string; testID?: string }) {
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={count ? `${title}, непрочитанных: ${count}` : title}
      testID={testID}
    >
      <View style={styles.icon}>
        <Ionicons name={icon} size={22} color={colors.primaryDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {text ? <Text style={ui.muted}>{text}</Text> : null}
      </View>
      <CountBadge count={count ?? 0} />
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

/** Личный кабинет студента: документы, чат с куратором, уведомления. */
export function CabinetLinks() {
  const n = useNotifications();
  return (
    <View style={{ gap: spacing.sm }}>
      <MenuRow icon="chatbubbles-outline" title="Чат с куратором" text="Вопросы, файлы и ответы куратора" count={n.unreadChat} href="/chat" testID="open-chat" />
      <MenuRow icon="document-text-outline" title="Мои документы" text="Загрузка и проверка документов" href="/documents" testID="open-documents" />
      <MenuRow icon="notifications-outline" title="Уведомления" count={n.unread} href="/notifications" testID="open-notifications" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 64,
  },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.bodyBold, color: colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});
