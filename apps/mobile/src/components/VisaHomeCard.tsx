import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, radius, spacing } from '../theme';

/** Карточка на главной: «Виза и переезд — пошагово». */
export function VisaHomeCard() {
  return (
    <Pressable
      onPress={() => router.push('/visa' as never)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel="Виза и переезд: пошаговая инструкция"
      testID="home-visa"
    >
      <View style={styles.icon}>
        <Ionicons name="airplane" size={26} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>Виза и переезд</Text>
        <Text style={styles.text}>Пошагово: Universitaly, документы, деньги, посольство вашей страны, permesso di soggiorno</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.text, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  icon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.bodyBold, fontSize: 17, color: '#fff' },
  text: { ...font.small, color: 'rgba(255,255,255,0.8)' },
});
