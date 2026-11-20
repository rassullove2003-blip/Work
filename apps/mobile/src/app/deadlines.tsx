import React from 'react';
import { View } from 'react-native';
import { EmptyState, Notice, ScreenHeader, ui } from '../components/ui';
import { spacing } from '../theme';
import { t } from '../i18n';

/** Подтверждённые дедлайны. Календарь и напоминания — Этап 2. */
export default function DeadlinesScreen() {
  const s = t();
  return (
    <View style={ui.screen}>
      <ScreenHeader title={s.deadlines.title} back />
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={ui.card}>
          <EmptyState icon="calendar-outline" title={s.home.noDeadlinesTitle} text={s.home.noDeadlinesText} />
        </View>
        <Notice text="Календарь сроков с напоминаниями за 30, 14, 7 и 1 день появится в следующей версии. Напоминания будут отправляться только по проверенным датам." />
      </View>
    </View>
  );
}
