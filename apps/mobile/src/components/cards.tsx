import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  cityName,
  formatDuration,
  formatFee,
  LANGUAGES,
  LEVELS,
  regionName,
  UNIVERSITY_TYPES,
  type ProgramWithUniversity,
  type Scholarship,
  type University,
} from '@uniitalia/shared';
import { colors, font, HIT, radius, shadow, spacing } from '../theme';
import { useFavorites } from '../lib/favorites';

/* ------------------------------------------------------ UniversityAvatar -- */
const AVATAR_COLORS = ['#00B8D9', '#0066FF', '#00C896', '#7B61FF', '#FF7A45', '#E5484D', '#172B4D'];

function initials(u: University): string {
  const name = (u.name_en ?? u.official_name).replace(/^(University of|Università (degli Studi )?(di |della |dell'|del )?)/i, '');
  const words = name.split(/\s+/).filter((w) => /^[A-ZА-ЯÀ-Ý]/.test(w));
  return (words[0]?.[0] ?? u.slug[0]).toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
}

/** Пока нет лицензированных изображений, показываем цветную плашку с инициалами. */
export function UniversityAvatar({ university, size = 56 }: { university: University; size?: number }) {
  if (university.logo_url) {
    return (
      <Image
        source={{ uri: university.logo_url }}
        style={{ width: size, height: size, borderRadius: size * 0.25, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityElementsHidden
      />
    );
  }
  const color = AVATAR_COLORS[[...university.slug].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.25, backgroundColor: color }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(university)}</Text>
    </View>
  );
}

/* --------------------------------------------------------- FavoriteButton -- */
export function FavoriteButton({ kind, id, label }: { kind: 'university' | 'program'; id: string; label: string }) {
  const fav = useFavorites();
  const active = kind === 'university' ? fav.universityIds.has(id) : fav.programIds.has(id);
  return (
    <Pressable
      onPress={() => (kind === 'university' ? fav.toggleUniversity(id) : fav.toggleProgram(id))}
      hitSlop={6}
      style={styles.favBtn}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `Убрать «${label}» из избранного` : `Добавить «${label}» в избранное`}
      testID={`fav-${kind}-${id}`}
    >
      <Ionicons name={active ? 'heart' : 'heart-outline'} size={24} color={active ? colors.danger : colors.secondary} />
    </Pressable>
  );
}

function Tag({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'blue' | 'demo' }) {
  const bg = tone === 'blue' ? colors.secondarySoft : tone === 'demo' ? colors.warningSoft : colors.surface;
  const fg = tone === 'blue' ? colors.secondary : tone === 'demo' ? '#7A5200' : colors.textMuted;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------- UniversityCard -- */
export function UniversityCard({
  university,
  programCount,
  variant = 'row',
}: {
  university: University;
  programCount?: number;
  variant?: 'row' | 'tile';
}) {
  const title = university.name_ru ?? university.official_name;
  const open = () => router.push({ pathname: '/university/[slug]', params: { slug: university.slug } });

  if (variant === 'tile') {
    return (
      <Pressable
        onPress={open}
        style={({ pressed }) => [styles.tile, shadow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${cityName(university.city)}`}
        testID={`uni-tile-${university.slug}`}
      >
        <View style={styles.tileTop}>
          <UniversityAvatar university={university} size={52} />
          <FavoriteButton kind="university" id={university.id} label={title} />
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {cityName(university.city)} · {UNIVERSITY_TYPES[university.public_private]}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${cityName(university.city)}, ${UNIVERSITY_TYPES[university.public_private]}`}
      testID={`uni-card-${university.slug}`}
    >
      <View style={styles.cardRow}>
        <UniversityAvatar university={university} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.muted} numberOfLines={2}>
            {university.official_name}
          </Text>
        </View>
        <FavoriteButton kind="university" id={university.id} label={title} />
      </View>
      <View style={styles.tags}>
        <Tag text={`${cityName(university.city)}, ${regionName(university.region)}`} />
        <Tag text={UNIVERSITY_TYPES[university.public_private]} tone="blue" />
        {programCount ? <Tag text={`Программ: ${programCount}`} /> : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>Стоимость: информация уточняется</Text>
        <View style={styles.moreRow}>
          <Text style={styles.more}>Подробнее</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------ ProgramCard -- */
export function ProgramCard({ program, showUniversity = true }: { program: ProgramWithUniversity; showUniversity?: boolean }) {
  const open = () => router.push({ pathname: '/program/[slug]', params: { slug: program.slug } });
  const uniName = program.university.name_ru ?? program.university.official_name;
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${program.title_original}, ${LEVELS[program.level].ru}, ${uniName}`}
      testID={`program-card-${program.slug}`}
    >
      <View style={styles.cardRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.levelCaption}>{LEVELS[program.level].ru.toUpperCase()}</Text>
          <Text style={styles.cardTitle}>{program.title_original}</Text>
          {program.title_ru ? <Text style={styles.muted}>{program.title_ru}</Text> : null}
        </View>
        <FavoriteButton kind="program" id={program.id} label={program.title_original} />
      </View>
      {showUniversity ? (
        <View style={[styles.cardRow, { marginTop: spacing.sm }]}>
          <UniversityAvatar university={program.university} size={32} />
          <Text style={[styles.body, { flex: 1 }]} numberOfLines={2}>
            {uniName} · {cityName(program.university.city)}
          </Text>
        </View>
      ) : null}
      <View style={styles.tags}>
        <Tag text={LANGUAGES[program.language]} tone="blue" />
        <Tag text={formatDuration(program)} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.footerText} numberOfLines={1}>
          {formatFee(program)}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------- ScholarshipCard -- */
export function ScholarshipCard({ scholarship, variant = 'row' }: { scholarship: Scholarship; variant?: 'row' | 'tile' }) {
  const open = () => router.push({ pathname: '/scholarship/[slug]', params: { slug: scholarship.slug } });
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [variant === 'tile' ? [styles.tile, shadow, { width: 260 }] : styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${scholarship.name_ru}, ${scholarship.organization}`}
      testID={`scholarship-card-${scholarship.slug}`}
    >
      <View style={styles.cardRow}>
        <View style={styles.schIcon}>
          <Ionicons name="school" size={22} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.levelCaption}>{regionName(scholarship.region).toUpperCase()}</Text>
          <Text style={styles.cardTitle} numberOfLines={variant === 'tile' ? 2 : undefined}>
            {scholarship.name_ru}
          </Text>
        </View>
      </View>
      <Text style={[styles.muted, { marginTop: spacing.sm }]} numberOfLines={2}>
        {scholarship.organization}
      </Text>
      <View style={styles.tags}>
        <Tag text="Размер уточняется" tone="demo" />
        <Tag text={`Вузов: ${scholarship.university_ids.length}`} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '900' },
  favBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm, marginTop: -spacing.sm },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitle: { ...font.bodyBold, fontSize: 17, color: colors.text },
  body: { ...font.small, color: colors.text },
  muted: { ...font.small, color: colors.textMuted },
  levelCaption: { ...font.caption, color: colors.primaryDark, marginBottom: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  tag: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, maxWidth: '100%' },
  tagText: { fontSize: 12, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  footerText: { ...font.small, color: colors.textMuted, flex: 1 },
  moreRow: { flexDirection: 'row', alignItems: 'center' },
  more: { ...font.small, fontWeight: '700', color: colors.secondary },
  tile: {
    width: 200,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  tileTitle: { ...font.bodyBold, color: colors.text, minHeight: 44 },
  schIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
