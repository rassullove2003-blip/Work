import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buildComparison, COMPARE_ROWS, MAX_COMPARE } from '@uniitalia/shared';
import { useCatalog } from '../lib/catalog';
import { useCompare } from '../lib/compare';
import { useFilters } from '../lib/filters';
import { openOfficial } from '../lib/links';
import { UniversityAvatar } from '../components/cards';
import { Button, EmptyState, ErrorState, LoadingState, Notice, ScreenHeader, ui } from '../components/ui';
import { colors, font, radius, spacing } from '../theme';

const LABEL_W = 118;
const COL_W = 168;

export default function CompareScreen() {
  const catalog = useCatalog();
  const compare = useCompare();
  const { setTab } = useFilters();

  if (catalog.status === 'loading') return <LoadingState />;
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.reload} details={catalog.error} />;

  const universities = compare.ids.map((id) => catalog.universities.find((u) => u.id === id)).filter((u) => !!u);
  const columns = buildComparison(universities, catalog.programs, catalog.scholarships, catalog.deadlines);
  const addMore = () => {
    setTab('universities');
    router.navigate('/search');
  };

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title="Сравнение вузов"
        back
        right={
          columns.length ? (
            <Pressable onPress={compare.clear} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Очистить сравнение">
              <Ionicons name="trash-outline" size={22} color={colors.secondary} />
            </Pressable>
          ) : undefined
        }
      />
      {columns.length === 0 ? (
        <EmptyState
          icon="git-compare-outline"
          title="Добавьте вузы для сравнения"
          text={`Откройте страницу университета и нажмите «Сравнить». Можно сравнить до ${MAX_COMPARE} вузов.`}
          action={{ title: 'Найти университет', onPress: addMore }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg, paddingBottom: spacing.xxl * 2 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
            <View style={styles.table} testID="compare-table">
              <View style={styles.row}>
                <View style={[styles.labelCell, { justifyContent: 'flex-end' }]}>
                  <Text style={styles.small}>Вузов: {columns.length} из {MAX_COMPARE}</Text>
                </View>
                {columns.map(({ university: u }) => (
                  <View key={u.id} style={[styles.cell, styles.head]}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/university/[slug]', params: { slug: u.slug } })}
                      style={{ gap: 6 }}
                      accessibilityRole="link"
                    >
                      <UniversityAvatar university={u} size={36} />
                      <Text style={styles.name} numberOfLines={3}>
                        {u.name_ru ?? u.official_name}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => compare.remove(u.id)} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Убрать ${u.name_ru ?? u.official_name}`} testID="compare-remove">
                      <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
              {COMPARE_ROWS.map((r, i) => (
                <View key={r.key} style={[styles.row, i % 2 === 0 && { backgroundColor: colors.surface }]}>
                  <View style={styles.labelCell}>
                    <Text style={styles.label}>{r.label}</Text>
                  </View>
                  {columns.map((c) => (
                    <View key={c.university.id} style={styles.cell}>
                      <Text style={[styles.value, c.cells[r.key] === 'Нет данных' && { color: colors.textMuted }]}>{c.cells[r.key]}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <View style={styles.row}>
                <View style={styles.labelCell}>
                  <Text style={styles.label}>Сайт</Text>
                </View>
                {columns.map(({ university: u }) => (
                  <View key={u.id} style={styles.cell}>
                    {u.website ? (
                      <Pressable onPress={() => openOfficial(u.website)} accessibilityRole="link">
                        <Text style={styles.link}>Официальный сайт</Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.value, { color: colors.textMuted }]}>Нет данных</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.lg }}>
            {columns.length < MAX_COMPARE ? <Button title="Добавить вуз" icon="add" variant="outline" onPress={addMore} /> : null}
            <Notice text="Данные из каталога UniItalia. Стоимость часто — первый взнос или сбор, а не полная цена: смотрите пояснения на странице программы и сверяйте с официальным сайтом вуза." />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  table: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  labelCell: { width: LABEL_W, padding: spacing.sm, justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  cell: { width: COL_W, padding: spacing.sm, justifyContent: 'center' },
  head: { paddingTop: spacing.md, paddingRight: 28 },
  remove: { position: 'absolute', top: 6, right: 6 },
  name: { ...font.bodyBold, fontSize: 14, color: colors.text },
  label: { ...font.small, fontWeight: '700', color: colors.textMuted },
  value: { ...font.small, color: colors.text },
  link: { ...font.small, color: colors.secondary, fontWeight: '600' },
  small: { fontSize: 12, color: colors.textMuted },
});
