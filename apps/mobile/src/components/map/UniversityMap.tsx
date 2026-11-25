import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';
import { cityName, UNIVERSITY_TYPES } from '@uniitalia/shared';
import { ITALY, type UniversityMapProps } from './types';
import { colors, font, spacing } from '../../theme';

/** Карта на телефоне: Apple Maps (iOS) / Google Maps (Android) через react-native-maps. */
export function UniversityMap({ points, focusId, onOpen }: UniversityMapProps) {
  const focus = points.find((p) => p.university.id === focusId);
  const region = focus
    ? { latitude: focus.university.latitude, longitude: focus.university.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }
    : ITALY;
  return (
    <MapView style={StyleSheet.absoluteFill} initialRegion={region} showsPointsOfInterests={false} toolbarEnabled={false}>
      {points.map(({ university: u, programs }) => (
        <Marker
          key={u.id}
          coordinate={{ latitude: u.latitude, longitude: u.longitude }}
          pinColor={u.public_private === 'private' ? colors.warning : colors.secondary}
          onCalloutPress={() => onOpen(u.slug)}
          tracksViewChanges={false}
        >
          <Callout tooltip={false} onPress={() => onOpen(u.slug)}>
            <View style={styles.callout}>
              <Text style={styles.name}>{u.name_ru ?? u.official_name}</Text>
              <Text style={styles.meta}>
                {cityName(u.city, u.city_ru)} · {UNIVERSITY_TYPES[u.public_private]} · программ: {programs}
              </Text>
              {u.geo_precision === 'city' ? <Text style={styles.meta}>Точка — центр города</Text> : null}
              <Text style={styles.link}>Открыть страницу вуза ›</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  callout: { maxWidth: 240, gap: 2, padding: spacing.xs },
  name: { ...font.bodyBold, fontSize: 15, color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  link: { fontSize: 13, color: colors.secondary, fontWeight: '700', marginTop: 4 },
});
