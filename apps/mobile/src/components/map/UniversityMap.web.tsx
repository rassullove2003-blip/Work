import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cityName, regionName, UNIVERSITY_TYPES } from '@uniitalia/shared';
import { openOfficial } from '../../lib/links';
import { Notice, ui } from '../ui';
import { osmLink, type UniversityMapProps } from './types';
import { colors, font, spacing } from '../../theme';

/** В браузере нативной карты нет — показываем список по регионам со ссылками на OpenStreetMap. */
export function UniversityMap({ points, onOpen }: UniversityMapProps) {
  const regions = [...new Set(points.map((p) => p.university.region))].sort((a, b) => regionName(a).localeCompare(regionName(b), 'ru'));
  return (
    <ScrollView contentContainerStyle={ui.content}>
      <Notice text="Интерактивная карта работает в приложении на телефоне. Здесь — список вузов по регионам со ссылками на карту OpenStreetMap." />
      {regions.map((r) => (
        <View key={r} style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={ui.h3}>{regionName(r)}</Text>
          {points
            .filter((p) => p.university.region === r)
            .map(({ university: u, programs }) => (
              <View key={u.id} style={[ui.card, { gap: 4 }]} testID="map-item">
                <Pressable onPress={() => onOpen(u.slug)} accessibilityRole="link">
                  <Text style={styles.name}>{u.name_ru ?? u.official_name}</Text>
                </Pressable>
                <Text style={ui.muted}>
                  {cityName(u.city, u.city_ru)} · {UNIVERSITY_TYPES[u.public_private]} · программ: {programs}
                  {u.geo_precision === 'city' ? ' · точка — центр города' : ''}
                </Text>
                <Pressable onPress={() => openOfficial(osmLink(u.latitude, u.longitude))} accessibilityRole="link">
                  <Text style={styles.link}>Показать на карте</Text>
                </Pressable>
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { ...font.bodyBold, color: colors.text },
  link: { ...font.small, color: colors.secondary, fontWeight: '600' },
});
