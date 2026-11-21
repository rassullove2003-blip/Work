import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { APPLICANT_CATEGORIES, REQUIREMENT_TYPES, type ApplicantCategory, type Requirement, type RequirementType } from '@uniitalia/shared';
import { FilterChip, Notice, VerificationBadge, ui } from './ui';
import { colors, font, spacing } from '../theme';

const ORDER = Object.keys(REQUIREMENT_TYPES) as RequirementType[];

/** Требования к поступлению для студента: фильтр «для кого», группировка по типу, статус проверки. */
export function RequirementsView({ requirements }: { requirements: Requirement[] }) {
  const categories = useMemo(() => [...new Set(requirements.map((r) => r.applicant_category))], [requirements]);
  const [cat, setCat] = useState<ApplicantCategory | 'any'>('any');
  const latestYear = requirements.map((r) => r.academic_year).sort().at(-1);
  const list = requirements.filter((r) => r.academic_year === latestYear && (cat === 'any' || r.applicant_category === cat || r.applicant_category === 'all'));

  if (requirements.length === 0) {
    return (
      <View style={{ gap: spacing.md }}>
        <View style={ui.card}>
          <Text style={[ui.body, { color: colors.textMuted, fontStyle: 'italic' }]}>Информация уточняется</Text>
        </View>
        <Notice text="Отсутствие данных о требованиях не означает, что их нет. Проверяйте условия для своей категории (EU / non-EU) на официальном сайте." />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={ui.muted}>Учебный год {latestYear}</Text>
      {categories.some((c) => c !== 'all') ? (
        <View style={ui.wrap}>
          <FilterChip label="Все" selected={cat === 'any'} onPress={() => setCat('any')} />
          {categories.filter((c) => c !== 'all').map((c) => (
            <FilterChip key={c} label={APPLICANT_CATEGORIES[c]} selected={cat === c} onPress={() => setCat(c)} />
          ))}
        </View>
      ) : null}
      {ORDER.filter((t) => list.some((r) => r.requirement_type === t)).map((t) => (
        <View key={t} style={ui.card}>
          <Text style={styles.type}>{REQUIREMENT_TYPES[t].toUpperCase()}</Text>
          {list
            .filter((r) => r.requirement_type === t)
            .map((r) => (
              <View key={r.id} style={styles.item}>
                <Text style={styles.title}>{r.title_ru}</Text>
                {r.details_ru ? <Text style={ui.body}>{r.details_ru}</Text> : null}
                {r.applicant_category !== 'all' ? <Text style={ui.muted}>{APPLICANT_CATEGORIES[r.applicant_category]}</Text> : null}
                <VerificationBadge meta={r} />
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  type: { ...font.caption, color: colors.primaryDark, marginBottom: spacing.sm },
  item: { gap: 4, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  title: { ...font.bodyBold, color: colors.text },
});
