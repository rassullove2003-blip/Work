import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalize } from '@uniitalia/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { openOfficial } from '../lib/links';
import { loadJSON, saveJSON } from '../lib/storage';
import { loadVisaGuide, VISA_CENTERS_LIST_URL, VISA_FORM_URL, VISA_QUESTIONNAIRE_URL, visaCountries, type VisaMission, type VisaSection } from '../lib/visa';
import { Button, EmptyState, FilterChip, LoadingState, Notice, ScreenHeader, Section, ui, VerificationBadge, type IconName } from '../components/ui';
import { colors, font, radius, spacing } from '../theme';

const COUNTRY_KEY = 'uniitalia.visa.country';
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

function LinkRow({ icon, text, onPress, testID }: { icon: IconName; text: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.linkRow} accessibilityRole="link" hitSlop={4} testID={testID}>
      <Ionicons name={icon} size={18} color={colors.secondary} />
      <Text style={styles.linkText}>{text}</Text>
    </Pressable>
  );
}

function MissionCard({ m }: { m: VisaMission }) {
  const warning = m.jurisdiction_ru?.startsWith('Внимание');
  return (
    <View style={[ui.card, { gap: spacing.sm, marginBottom: spacing.md }]} testID="visa-mission">
      <Text style={styles.caption}>КУДА ПОДАВАТЬ НА ВИЗУ</Text>
      <Text style={ui.h3}>{m.mission_name}</Text>
      {m.jurisdiction_ru && !warning ? <Text style={ui.muted}>Обслуживает: {m.jurisdiction_ru}</Text> : null}
      {warning ? <Notice tone="warning" text={m.jurisdiction_ru!} /> : null}
      {m.address ? <Text style={ui.body}>{m.address}</Text> : null}
      {m.phone
        ? m.phone.split(',').map((p) => (
            <LinkRow key={p} icon="call-outline" text={p.trim()} onPress={() => Linking.openURL(`tel:${p.trim()}`)} />
          ))
        : null}
      {m.email ? <LinkRow icon="mail-outline" text={m.email} onPress={() => Linking.openURL(`mailto:${m.email}`)} /> : null}
      {m.website ? <LinkRow icon="globe-outline" text={`Сайт посольства: ${host(m.website)}`} onPress={() => openOfficial(m.website)} testID="visa-mission-site" /> : null}
      {m.visa_center_url ? (
        <View style={styles.center}>
          <LinkRow icon="business-outline" text={`Визовый центр: ${host(m.visa_center_url)}`} onPress={() => openOfficial(m.visa_center_url)} />
          <Text style={styles.small}>По списку визовых центров МИД Италии от 03.04.2024 — актуальность проверьте на сайте посольства.</Text>
        </View>
      ) : null}
      <Text style={styles.small}>Порядок записи, сроки рассмотрения и возможное собеседование уточните на официальном сайте консульства.</Text>
      <VerificationBadge meta={m} compact />
    </View>
  );
}

function Step({ s, index, open, onToggle }: { s: VisaSection; index: number; open: boolean; onToggle: () => void }) {
  return (
    <View style={[ui.card, { marginBottom: spacing.sm, padding: 0, overflow: 'hidden' }]}>
      <Pressable onPress={onToggle} style={styles.stepHead} accessibilityRole="button" accessibilityState={{ expanded: open }} testID="visa-step">
        <View style={styles.num}>
          <Text style={styles.numText}>{index + 1}</Text>
        </View>
        <Text style={[ui.h3, { flex: 1, fontSize: 16 }]}>{s.title_ru}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.stepBody}>
          {s.body_ru.split('\n').map((line, i) => (
            <Text key={i} style={[ui.body, line.startsWith('•') ? styles.bullet : styles.para]} selectable>
              {line}
            </Text>
          ))}
          {s.source_url ? <LinkRow icon="open-outline" text={`Источник: ${host(s.source_url)}`} onPress={() => openOfficial(s.source_url)} /> : null}
          <VerificationBadge meta={s} compact />
        </View>
      ) : null}
    </View>
  );
}

export default function VisaScreen() {
  const auth = useAuth();
  const [data, setData] = useState<{ sections: VisaSection[]; missions: VisaMission[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback((force = false) => {
    if (!supabase) return;
    loadVisaGuide(force)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => load(), [load]);

  // Страна: сохранённый выбор, иначе гражданство или страна из профиля.
  useEffect(() => {
    if (!data) return;
    let alive = true;
    (async () => {
      const saved = await loadJSON<string | null>(COUNTRY_KEY, null);
      if (!alive) return;
      if (saved) return setCountry(saved);
      if (!auth.userId) return;
      const p = await auth.loadProfile().catch(() => null);
      const guess = [p?.country, p?.citizenship].filter(Boolean).map((x) => normalize(String(x)));
      const hit = visaCountries(data.missions).find((c) => guess.some((g) => g.includes(normalize(c.ru))));
      if (alive && hit) setCountry(hit.code);
    })();
    return () => {
      alive = false;
    };
    // профиль читаем один раз при загрузке данных
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const choose = (code: string) => {
    setCountry(code);
    saveJSON(COUNTRY_KEY, code);
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Виза и переезд" back />
      {!supabase ? (
        <EmptyState icon="cloud-offline-outline" title="Раздел доступен при подключении к серверу." />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title={error} action={{ title: 'Повторить', onPress: () => load(true) }} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(true)} />}>
          <Notice tone="warning" text="Сведения с официальных сайтов МИД и Минобразования Италии. Окончательные требования устанавливает посольство или консульство Италии в вашей стране — уточните на его официальном сайте." />

          <Section title="Ваша страна проживания">
            <View style={ui.wrap}>
              {visaCountries(data.missions).map((c) => (
                <FilterChip key={c.code} label={c.ru} selected={country === c.code} onPress={() => choose(c.code)} />
              ))}
            </View>
            <View style={{ marginTop: spacing.md }}>
              {country ? (
                data.missions.filter((m) => m.country_code === country).map((m) => <MissionCard key={m.id} m={m} />)
              ) : (
                <Text style={ui.muted}>Выберите страну — покажем посольство Италии, куда подавать документы.</Text>
              )}
              {!country || data.missions.some((m) => m.country_code === country) ? null : (
                <Notice text="Для этой страны данных пока нет. Уточните на официальном сайте консульства." />
              )}
              <Text style={styles.small}>Другая страна? Официальный опросник МИД Италии покажет документы и посольство для любой страны.</Text>
              <LinkRow icon="help-circle-outline" text="Опросник МИД Италии «Il visto per l'Italia»" onPress={() => openOfficial(VISA_QUESTIONNAIRE_URL)} />
            </View>
          </Section>

          <Section title="Пошагово">
            {data.sections.map((s, i) => (
              <Step key={s.id} s={s} index={i} open={open.has(s.id)} onToggle={() => toggle(s.id)} />
            ))}
            <Button title="Раскрыть всё" variant="ghost" icon="list-outline" onPress={() => setOpen(new Set(data.sections.map((s) => s.id)))} />
          </Section>

          <Section title="Официальные документы">
            <View style={[ui.card, { gap: spacing.sm }]}>
              <LinkRow icon="document-text-outline" text="Анкета на национальную визу (PDF, МИД Италии)" onPress={() => openOfficial(VISA_FORM_URL)} />
              <LinkRow icon="document-text-outline" text="Список визовых центров (PDF, МИД Италии)" onPress={() => openOfficial(VISA_CENTERS_LIST_URL)} />
              <LinkRow icon="school-outline" text="Universitaly — предзачисление" onPress={() => openOfficial('https://www.universitaly.it/en/studenti-stranieri')} />
            </View>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { ...font.caption, color: colors.primaryDark },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  linkText: { ...font.small, color: colors.secondary, fontWeight: '600', flexShrink: 1 },
  small: { ...font.small, fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },
  center: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontWeight: '800', color: colors.primaryDark },
  stepBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 6 },
  bullet: { paddingLeft: spacing.sm },
  para: { fontWeight: '600' },
});
