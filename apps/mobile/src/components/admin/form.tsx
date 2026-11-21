import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalize } from '@uniitalia/shared';
import { supabase } from '../../lib/supabase';
import { FilterChip, ui } from '../ui';
import { colors, font, radius, spacing } from '../../theme';

export type Option = { value: string; label: string; hint?: string };

export type FieldDef =
  | { name: string; label: string; type: 'text' | 'multiline' | 'url' | 'number'; required?: boolean; hint?: string; placeholder?: string }
  | { name: string; label: string; type: 'date'; required?: boolean; hint?: string }
  | { name: string; label: string; type: 'year'; required?: boolean; hint?: string }
  | { name: string; label: string; type: 'select'; options: Option[]; required?: boolean; hint?: string; searchable?: boolean }
  | { name: string; label: string; type: 'multiselect'; options: Option[]; hint?: string }
  | { name: string; label: string; type: 'toggle'; hint?: string }
  | { name: string; label: string; type: 'image'; folder: string; hint?: string };

export type Values = Record<string, unknown>;

/** Поля проверки и публикации, общие для всех записей каталога. */
export const VERIFICATION_FIELDS: FieldDef[] = [
  {
    name: 'status',
    label: 'Публикация',
    type: 'select',
    required: true,
    options: [
      { value: 'draft', label: 'Черновик', hint: 'не виден студентам' },
      { value: 'published', label: 'Опубликовано' },
      { value: 'archived', label: 'В архиве' },
    ],
  },
  {
    name: 'verification_status',
    label: 'Статус проверки',
    type: 'select',
    required: true,
    options: [
      { value: 'unverified', label: 'Не проверено' },
      { value: 'needs_review', label: 'Требует проверки' },
      { value: 'verified', label: 'Проверено' },
      { value: 'outdated', label: 'Устарело' },
    ],
    hint: '«Проверено» можно поставить только с источником и датой проверки.',
  },
  { name: 'source_url', label: 'Источник (официальная страница)', type: 'url', placeholder: 'https://…' },
  { name: 'verified_at', label: 'Дата проверки', type: 'date' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_RE = /^\d{4}\/\d{4}$/;

/** Значение из базы → значение в форме. */
export function toForm(f: FieldDef, v: unknown): unknown {
  switch (f.type) {
    case 'date':
      return typeof v === 'string' ? v.slice(0, 10) : '';
    case 'toggle':
      return Boolean(v);
    case 'multiselect':
      return Array.isArray(v) ? v : [];
    case 'number':
      return v == null ? '' : String(v);
    default:
      return v ?? '';
  }
}

/** Значение из формы → значение для базы. */
export function toDb(f: FieldDef, v: unknown): unknown {
  if (f.type === 'toggle') return Boolean(v);
  if (f.type === 'multiselect') return v;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '' || s == null) return null;
  if (f.type === 'number') return Number(s);
  // Дата хранится как конец дня; отображается по первым 10 символам.
  if (f.type === 'date') return `${s}T23:59:00Z`;
  return s;
}

/** Проверка значений. Возвращает ошибки по именам полей. */
export function validate(fields: FieldDef[], values: Values): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.name];
    const empty = v == null || (typeof v === 'string' && v.trim() === '');
    if ('required' in f && f.required && empty) e[f.name] = 'Обязательное поле';
    if (empty) continue;
    const s = String(v).trim();
    if (f.type === 'url' && !/^https?:\/\/\S+$/.test(s)) e[f.name] = 'Ссылка должна начинаться с https://';
    if (f.type === 'date' && (!DATE_RE.test(s) || isNaN(Date.parse(s)))) e[f.name] = 'Формат: 2027-03-31';
    if (f.type === 'year' && !YEAR_RE.test(s)) e[f.name] = 'Формат: 2026/2027';
    if (f.type === 'number' && !/^\d+(\.\d+)?$/.test(s)) e[f.name] = 'Введите число';
  }
  if (values.verification_status === 'verified' && (!values.source_url || !values.verified_at)) {
    e.verification_status = 'Для «Проверено» укажите источник и дату проверки';
  }
  return e;
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={ui.card}>{children}</View>
    </View>
  );
}

export function Field({
  f,
  value,
  onChange,
  error,
}: {
  f: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const label = (
    <Text style={styles.label}>
      {f.label}
      {'required' in f && f.required ? ' *' : ''}
    </Text>
  );
  const hint = f.hint ? <Text style={styles.hint}>{f.hint}</Text> : null;
  const err = error ? <Text style={styles.error}>{error}</Text> : null;

  if (f.type === 'toggle') {
    return (
      <View style={[styles.field, styles.toggleRow]}>
        <View style={{ flex: 1 }}>
          {label}
          {hint}
        </View>
        <Switch value={Boolean(value)} onValueChange={onChange} trackColor={{ true: colors.success, false: colors.border }} accessibilityLabel={f.label} testID={`toggle-${f.name}`} />
      </View>
    );
  }
  if (f.type === 'select') {
    return (
      <View style={styles.field}>
        {label}
        <SelectField name={f.name} options={f.options} value={String(value ?? '')} onChange={onChange} searchable={f.searchable} allowEmpty={!f.required} />
        {hint}
        {err}
      </View>
    );
  }
  if (f.type === 'multiselect') {
    const list = (value as string[]) ?? [];
    return (
      <View style={styles.field}>
        {label}
        <View style={ui.wrap}>
          {f.options.map((o) => (
            <FilterChip
              key={o.value}
              label={o.label}
              selected={list.includes(o.value)}
              onPress={() => onChange(list.includes(o.value) ? list.filter((x) => x !== o.value) : [...list, o.value])}
            />
          ))}
        </View>
        {hint}
      </View>
    );
  }
  if (f.type === 'image') {
    return (
      <View style={styles.field}>
        {label}
        <ImageField folder={f.folder} value={String(value ?? '')} onChange={onChange} />
        {hint}
        {err}
      </View>
    );
  }
  const keyboard = f.type === 'number' ? 'decimal-pad' : f.type === 'url' ? 'url' : f.type === 'date' || f.type === 'year' ? 'numbers-and-punctuation' : 'default';
  const placeholder =
    'placeholder' in f && f.placeholder ? f.placeholder : f.type === 'date' ? 'ГГГГ-ММ-ДД, например 2027-03-31' : f.type === 'year' ? '2026/2027' : undefined;
  return (
    <View style={styles.field}>
      {label}
      <TextInput
        value={String(value ?? '')}
        onChangeText={onChange}
        multiline={f.type === 'multiline'}
        keyboardType={keyboard}
        autoCapitalize={f.type === 'url' ? 'none' : 'sentences'}
        autoCorrect={f.type !== 'url'}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={f.label}
        testID={`input-${f.name}`}
        style={[styles.input, f.type === 'multiline' && styles.multiline, error ? { borderColor: colors.danger } : null]}
      />
      {hint}
      {err}
    </View>
  );
}

function SelectField({
  name,
  options,
  value,
  onChange,
  searchable,
  allowEmpty,
}: {
  name: string;
  options: Option[];
  value: string;
  onChange: (v: unknown) => void;
  searchable?: boolean;
  allowEmpty?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!value);
  const current = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => (q ? options.filter((o) => normalize(`${o.label} ${o.hint ?? ''}`).includes(normalize(q))) : options).slice(0, 40),
    [options, q],
  );

  // Короткий список — сразу чипами.
  if (!searchable) {
    return (
      <View style={ui.wrap}>
        {allowEmpty ? <FilterChip label="—" selected={!value} onPress={() => onChange('')} /> : null}
        {options.map((o) => (
          <FilterChip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} testID={`opt-${name}-${o.value}`} />
        ))}
      </View>
    );
  }
  // Длинный список (вузы, программы) — с поиском.
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.selectBox} accessibilityRole="button" testID={`select-${name}`}>
        <Text style={[styles.selectText, !current && { color: colors.textMuted }]} numberOfLines={2}>
          {current ? current.label : 'Выберите…'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.selectList}>
          <TextInput value={q} onChangeText={setQ} placeholder="Поиск" placeholderTextColor={colors.textMuted} style={styles.input} autoCorrect={false} testID={`search-${name}`} />
          {allowEmpty ? (
            <Pressable style={styles.option} onPress={() => { onChange(''); setOpen(false); }}>
              <Text style={styles.optionText}>— не выбрано</Text>
            </Pressable>
          ) : null}
          {filtered.map((o) => (
            <Pressable
              key={o.value}
              style={[styles.option, o.value === value && { backgroundColor: colors.primarySoft }]}
              testID={`opt-${name}-${o.value}`}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
                setQ('');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.optionText}>{o.label}</Text>
              {o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
            </Pressable>
          ))}
          {filtered.length === 0 ? <Text style={styles.hint}>Ничего не найдено</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Выбор фото из галереи и загрузка в публичное хранилище catalog-images. */
function ImageField({ folder, value, onChange }: { folder: string; value: string; onChange: (v: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
    if (res.canceled || !res.assets?.[0] || !supabase) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const body = await (await fetch(asset.uri)).arrayBuffer();
      if (body.byteLength > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ. Выберите изображение меньше.');
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('catalog-images').upload(path, body, { contentType: mime, upsert: false });
      if (upErr) throw new Error(upErr.message.includes('row-level') ? 'Недостаточно прав для загрузки.' : upErr.message);
      onChange(supabase.storage.from('catalog-images').getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {value ? <Image source={{ uri: value }} style={styles.preview} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={ui.row}>
        <Pressable onPress={pick} style={styles.imgBtn} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.secondary} /> : <Ionicons name="image-outline" size={18} color={colors.secondary} />}
          <Text style={styles.imgBtnText}>{value ? 'Заменить' : 'Выбрать из галереи'}</Text>
        </Pressable>
        {value ? (
          <Pressable onPress={() => onChange('')} style={styles.imgBtn} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={[styles.imgBtnText, { color: colors.danger }]}>Убрать</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  sectionTitle: { ...font.h3, color: colors.text, marginBottom: spacing.md },
  field: { marginBottom: spacing.lg, gap: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...font.small, fontWeight: '700', color: colors.text },
  hint: { ...font.small, fontSize: 13, color: colors.textMuted },
  error: { ...font.small, color: colors.danger },
  input: {
    ...font.body,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
    backgroundColor: colors.background,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 46,
  },
  selectText: { ...font.body, color: colors.text, flex: 1 },
  selectList: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  option: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, minHeight: 44, justifyContent: 'center' },
  optionText: { ...font.body, color: colors.text },
  preview: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.surface },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  imgBtnText: { ...font.small, fontWeight: '700', color: colors.secondary },
});
