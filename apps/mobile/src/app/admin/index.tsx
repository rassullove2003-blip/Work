import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ROLE_LABELS } from '@uniitalia/shared';
import { useStaff } from '../../lib/staff';
import { supabase } from '../../lib/supabase';
import { StaffGuard } from '../../components/admin/EditScreen';
import { Notice, ScreenHeader, ui, type IconName } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

type Item = { href: string; icon: IconName; title: string; text: string; table?: string; adminOnly?: boolean };

const ITEMS: Item[] = [
  { href: '/admin/universities', icon: 'business-outline', title: 'Университеты', text: 'Добавление, фото, логотипы, описание', table: 'universities' },
  { href: '/admin/programs', icon: 'book-outline', title: 'Программы', text: 'Специальности и стоимость по годам', table: 'degree_programs' },
  { href: '/admin/deadlines', icon: 'calendar-outline', title: 'Дедлайны', text: 'Сроки подачи и стипендий', table: 'admission_deadlines' },
  { href: '/admin/rules', icon: 'book-outline', title: 'Общие правила', text: 'Ориентиры по поступлению, визе и стоимости', table: 'admission_rules' },
  { href: '/admin/visa-sections', icon: 'airplane-outline', title: 'Виза: шаги', text: 'Пошаговая инструкция по визе и переезду', table: 'visa_sections' },
  { href: '/admin/visa-missions', icon: 'flag-outline', title: 'Виза: посольства', text: 'Куда подавать по странам проживания', table: 'visa_missions' },
  { href: '/admin/consultations', icon: 'mail-unread-outline', title: 'Заявки на консультацию', text: 'Форма «Получить помощь с поступлением»' },
  { href: '/admin/chats', icon: 'chatbubbles-outline', title: 'Чаты со студентами', text: 'Вопросы студентов и файлы' },
  { href: '/admin/documents', icon: 'document-text-outline', title: 'Документы студентов', text: 'Проверка загруженных документов' },
  { href: '/admin/applications', icon: 'school-outline', title: 'Заявки студентов', text: 'Поступления, этапы, комментарии и задачи' },
  { href: '/admin/import', icon: 'cloud-upload-outline', title: 'Импорт данных', text: 'Google Таблица, Excel или CSV: проверка и загрузка' },
  { href: '/admin/staff', icon: 'people-outline', title: 'Сотрудники', text: 'Назначение кураторов и администраторов', adminOnly: true },
];

export default function AdminHome() {
  const { role, isAdmin } = useStaff();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!supabase) return;
    ITEMS.filter((i) => i.table).forEach(async (i) => {
      const { count } = await supabase!.from(i.table!).select('*', { count: 'exact', head: true });
      setCounts((c) => ({ ...c, [i.table!]: count ?? 0 }));
    });
  }, []);

  return (
    <StaffGuard title="Управление">
      <View style={ui.screen}>
        <ScreenHeader title="Управление" back />
        <ScrollView contentContainerStyle={ui.content}>
          <Text style={ui.muted}>Ваша роль: {role ? ROLE_LABELS[role] : '—'}</Text>
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => (
              <Pressable key={i.href} onPress={() => router.push(i.href as never)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                <View style={styles.icon}>
                  <Ionicons name={i.icon} size={24} color={colors.primaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {i.title}
                    {i.table && counts[i.table] != null ? `  ·  ${counts[i.table]}` : ''}
                  </Text>
                  <Text style={ui.muted}>{i.text}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: spacing.xl }}>
            <Notice text="Черновики видны только сотрудникам. Студенты видят записи после публикации. Все изменения сохраняются в журнале." />
          </View>
        </ScrollView>
      </View>
    </StaffGuard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  icon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.bodyBold, fontSize: 17, color: colors.text },
});
