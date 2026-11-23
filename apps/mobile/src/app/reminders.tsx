import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { REMINDER_OPTIONS, useReminders, type ReminderSettings } from '../lib/reminders';
import { notify } from '../lib/links';
import { DeadlineCard, upcoming } from '../components/DeadlineCard';
import { Button, EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, Section, ui } from '../components/ui';
import { colors, spacing } from '../theme';

function Settings() {
  const reminders = useReminders();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);

  useEffect(() => {
    reminders.loadSettings().then(setSettings);
    // настройки читаем один раз при открытии экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) return <Text style={ui.muted}>Загрузка…</Text>;

  const save = async (next: ReminderSettings) => {
    const prev = settings;
    setSettings(next);
    try {
      await reminders.saveSettings(next);
    } catch (e) {
      setSettings(prev);
      notify('Ошибка', (e as Error).message);
    }
  };
  const toggleDay = (days: number) => {
    const has = settings.days.includes(days);
    if (has && settings.days.length === 1) return notify('Оставьте хотя бы один вариант', 'Или выключите напоминания переключателем выше.');
    save({ ...settings, days: has ? settings.days.filter((d) => d !== days) : [...settings.days, days] });
  };

  return (
    <View style={[ui.card, { gap: spacing.md }]}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={[ui.body, { flex: 1, fontWeight: '600' }]}>Присылать напоминания</Text>
        <Switch
          value={settings.enabled}
          onValueChange={(enabled) => save({ ...settings, enabled })}
          trackColor={{ true: colors.secondary, false: colors.border }}
          accessibilityLabel="Присылать напоминания"
          testID="reminders-enabled"
        />
      </View>
      {settings.enabled ? (
        <>
          <Text style={ui.muted}>Когда напоминать (можно выбрать несколько):</Text>
          <View style={ui.wrap}>
            {REMINDER_OPTIONS.map((o) => (
              <FilterChip key={o.days} label={o.label} selected={settings.days.includes(o.days)} onPress={() => toggleDay(o.days)} />
            ))}
          </View>
        </>
      ) : (
        <Text style={ui.muted}>Напоминания выключены. Сроки останутся в списке ниже.</Text>
      )}
    </View>
  );
}

export default function RemindersScreen() {
  const auth = useAuth();
  const catalog = useCatalog();
  const reminders = useReminders();

  if (!auth.userId) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title="Напоминания о сроках" back />
        <EmptyState icon="alarm-outline" title="Войдите в аккаунт" text="Напоминания привязаны к аккаунту и приходят на все ваши устройства." action={{ title: 'Войти', onPress: () => router.push('/auth') }} />
      </View>
    );
  }
  if (catalog.status === 'loading') return <LoadingState />;

  const list = upcoming(catalog.deadlines.filter((d) => reminders.ids.has(d.id)), false, 200);

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Напоминания о сроках" back />
      <ScrollView contentContainerStyle={ui.content}>
        <Notice text="Нажмите «Напомнить» на любом дедлайне — мы пришлём уведомление заранее. Сроки программ из «Моих поступлений» и задачи с датой отслеживаются автоматически. Проверка идёт каждое утро." />
        <Section title="Настройки">
          <Settings />
        </Section>
        <Section title={`Сроки с напоминанием (${list.length})`}>
          {list.length ? (
            list.map((d) => <DeadlineCard key={d.id} deadline={d} />)
          ) : (
            <View style={ui.card}>
              <EmptyState icon="notifications-off-outline" title="Пока ни одного срока" text="Откройте список дедлайнов или страницу программы и нажмите «Напомнить»." />
            </View>
          )}
          <Button title="Все дедлайны" icon="calendar-outline" variant="outline" onPress={() => router.push('/deadlines')} testID="reminders-all-deadlines" />
        </Section>
      </ScrollView>
    </View>
  );
}
