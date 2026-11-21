import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APPLICANT_CATEGORIES, REQUIREMENT_TYPES, type Requirement } from '@uniitalia/shared';
import { supabase } from '../../lib/supabase';
import { useStaff } from '../../lib/staff';
import { useCatalog } from '../../lib/catalog';
import { confirmAction, notify } from '../../lib/links';
import { Button, ui } from '../ui';
import { Field, FormSection, toDb, toForm, validate, VERIFICATION_FIELDS, type FieldDef, type Values } from './form';
import { StatusPills } from './AdminList';
import { dbErrorRu } from './EditScreen';
import { colors, font, radius, spacing } from '../../theme';

type Row = Requirement & { status: string };

const FIELDS: FieldDef[] = [
  {
    name: 'requirement_type',
    label: 'Тип требования',
    type: 'select',
    required: true,
    options: Object.entries(REQUIREMENT_TYPES).map(([v, l]) => ({ value: v, label: l })),
  },
  {
    name: 'applicant_category',
    label: 'Для кого',
    type: 'select',
    required: true,
    options: Object.entries(APPLICANT_CATEGORIES).map(([v, l]) => ({ value: v, label: l })),
  },
  { name: 'academic_year', label: 'Учебный год', type: 'year', required: true },
  { name: 'title_ru', label: 'Требование кратко', type: 'text', required: true, placeholder: 'IELTS 6.0 или эквивалент' },
  { name: 'details_ru', label: 'Подробности', type: 'multiline', placeholder: 'Какие сертификаты принимаются, минимальные баллы, исключения…' },
];
const ALL = [...FIELDS, ...VERIFICATION_FIELDS];
const EMPTY: Values = Object.fromEntries(ALL.map((f) => [f.name, toForm(f, undefined)]));
EMPTY.requirement_type = 'language';
EMPTY.applicant_category = 'all';
EMPTY.status = 'draft';
EMPTY.verification_status = 'unverified';

/** Требования к поступлению по программе: строки «тип · для кого · год · текст». */
export function RequirementsPanel({ programId }: { programId: string }) {
  const { isAdmin } = useStaff();
  const catalog = useCatalog();
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Values>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!supabase) return [];
    const { data } = await supabase
      .from('admission_requirements')
      .select('*')
      .eq('program_id', programId)
      .order('academic_year', { ascending: false })
      .order('requirement_type');
    return (data ?? []) as Row[];
  }, [programId]);
  const load = useCallback(() => fetchRows().then(setRows), [fetchRows]);
  useEffect(() => {
    let cancelled = false;
    fetchRows().then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  const startEdit = (r: Row) => {
    setEditingId(r.id);
    setErrors({});
    setForm(Object.fromEntries(ALL.map((f) => [f.name, toForm(f, (r as unknown as Values)[f.name])])));
  };
  const reset = () => {
    setEditingId(null);
    setErrors({});
    setForm(EMPTY);
  };

  const save = async () => {
    const e = validate(ALL, form);
    setErrors(e);
    if (Object.keys(e).length || !supabase) return;
    setBusy(true);
    const payload = Object.fromEntries(ALL.map((f) => [f.name, toDb(f, form[f.name])]));
    const res = editingId
      ? await supabase.from('admission_requirements').update(payload).eq('id', editingId)
      : await supabase.from('admission_requirements').insert({ ...payload, program_id: programId });
    setBusy(false);
    if (res.error) return notify('Не удалось сохранить', dbErrorRu(res.error.message));
    // Учебный год, тип и «для кого» оставляем — удобно вводить несколько строк подряд.
    const keep = { requirement_type: form.requirement_type, applicant_category: form.applicant_category, academic_year: form.academic_year };
    setEditingId(null);
    setForm({ ...EMPTY, ...keep });
    load();
    catalog.reload();
  };

  const remove = async (id: string) => {
    if (!(await confirmAction('Удалить требование?', 'Строка будет удалена безвозвратно.', 'Удалить')) || !supabase) return;
    const { error } = await supabase.from('admission_requirements').delete().eq('id', id);
    if (error) return notify('Не удалось удалить', dbErrorRu(error.message));
    if (editingId === id) reset();
    load();
    catalog.reload();
  };

  return (
    <FormSection title="Требования к поступлению">
      {rows.length === 0 ? (
        <Text style={ui.muted}>Пока не добавлено. Студенты видят «Информация уточняется».</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {rows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => startEdit(r)}
              style={[styles.row, editingId === r.id && styles.rowActive]}
              accessibilityRole="button"
              accessibilityHint="Нажмите, чтобы изменить"
              testID={`req-row-${r.id}`}
            >
              <Text style={styles.caption}>
                {REQUIREMENT_TYPES[r.requirement_type]} · {APPLICANT_CATEGORIES[r.applicant_category]} · {r.academic_year}
              </Text>
              <Text style={styles.title}>{r.title_ru}</Text>
              {r.details_ru ? <Text style={ui.muted} numberOfLines={3}>{r.details_ru}</Text> : null}
              <StatusPills row={{ id: r.id, status: r.status, verification_status: r.verification_status }} />
              {isAdmin ? (
                <Button title="Удалить" variant="ghost" onPress={() => remove(r.id)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 36 }} />
              ) : null}
            </Pressable>
          ))}
          <Text style={ui.muted}>Нажмите на строку, чтобы изменить её.</Text>
        </View>
      )}

      <Text style={[ui.h3, { marginTop: spacing.xl, marginBottom: spacing.md }]}>{editingId ? 'Изменить требование' : 'Добавить требование'}</Text>
      {ALL.map((f) => (
        <Field key={f.name} f={f} value={form[f.name]} onChange={(v) => setForm({ ...form, [f.name]: v })} error={errors[f.name]} />
      ))}
      <View style={{ gap: spacing.sm }}>
        <Button title={editingId ? 'Сохранить изменения' : 'Добавить требование'} variant="outline" icon={editingId ? 'checkmark' : 'add'} onPress={save} loading={busy} testID="req-save" />
        {editingId ? <Button title="Отмена" variant="ghost" onPress={reset} /> : null}
      </View>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  rowActive: { borderColor: colors.secondary, backgroundColor: colors.secondarySoft },
  caption: { ...font.caption, color: colors.primaryDark },
  title: { ...font.bodyBold, color: colors.text },
});
