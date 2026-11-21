import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useCatalog } from '../lib/catalog';
import { DeadlineCard, upcoming } from '../components/DeadlineCard';
import { EmptyState, FilterChip, Notice, ScreenHeader, ui } from '../components/ui';
import { spacing } from '../theme';
import { t } from '../i18n';

/** Предстоящие сроки. По умолчанию только проверенные; можно показать все опубликованные. */
export default function DeadlinesScreen() {
  const s = t();
  const catalog = useCatalog();
  const [onlyVerified, setOnlyVerified] = useState(true);
  const list = upcoming(catalog.deadlines, onlyVerified);
  return (
    <View style={ui.screen}>
      <ScreenHeader title={s.deadlines.title} back />
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => <DeadlineCard deadline={item} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <View style={ui.wrap}>
              <FilterChip label="Только проверенные" selected={onlyVerified} onPress={() => setOnlyVerified(true)} />
              <FilterChip label="Все опубликованные" selected={!onlyVerified} onPress={() => setOnlyVerified(false)} />
            </View>
            {!onlyVerified ? <Notice tone="warning" text="Непроверенные сроки отмечены отдельно — сверяйте их на официальном сайте." /> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={ui.card}>
            <EmptyState icon="calendar-outline" title={s.home.noDeadlinesTitle} text={s.home.noDeadlinesText} />
          </View>
        }
      />
    </View>
  );
}
