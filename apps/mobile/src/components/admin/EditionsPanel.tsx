import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { APPLICANT_CATEGORIES, type ApplicantCategory } from '@uniitalia/shared';
import { supabase } from '../../lib/supabase';
import { useStaff } from '../../lib/staff';
import { confirmAction, notify } from '../../lib/links';
import { Button, ui } from '../ui';
import { Field, FormSection, toDb, validate, VERIFICATION_FIELDS, type FieldDef, type Values } from './form';
import { StatusPills } from './AdminList';
import { dbErrorRu } from './EditScreen';
import { spacing } from '../../theme';

type Edition = {
  id: string;
  academic_year: string;
  applicant_category: ApplicantCategory;
  tuition_fee_min_eur: number | null;
  tuition_fee_max_eur: number | null;
  fee_notes_ru: string | null;
  status: string;
  verification_status: 'verified' | 'needs_review' | 'unverified' | 'outdated';
};

const FIELDS: FieldDef[] = [
  { name: 'academic_year', label: 'Учебный год', type: 'year', required: true },
  {
    name: 'applicant_category',
    label: 'Для кого',
    type: 'select',
    required: true,
    options: Object.entries(APPLICANT_CATEGORIES).map(([v, l]) => ({ value: v, label: l })),
  },
  { name: 'tuition_fee_min_eur', label: 'Стоимость от, € в год', type: 'number' },
  { name: 'tuition_fee_max_eur', label: 'Стоимость до, € в год', type: 'number', hint: 'Если стоимость одна — заполните только «от».' },
  { name: 'fee_notes_ru', label: 'Примечание', type: 'text', placeholder: 'Зависит от ISEE' },
];
const ALL = [...FIELDS, ...VERIFICATION_FIELDS];
const EMPTY: Values = { academic_year: '', applicant_category: 'all', tuition_fee_min_eur: '', tuition_fee_max_eur: '', fee_notes_ru: '', status: 'draft', verification_status: 'unverified', source_url: '', verified_at: '' };

const fmt = (n: number | null) => (n == null ? '—' : `${Number(n).toLocaleString('ru-RU')} €`);

/** Стоимость программы по учебным годам. В приложении показывается последний опубликованный год. */
export function EditionsPanel({ programId }: { programId: string }) {
  const { isAdmin } = useStaff();
  const [rows, setRows] = useState<Edition[]>([]);
  const [form, setForm] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!supabase) return [];
    const { data } = await supabase.from('program_editions').select('*').eq('program_id', programId).order('academic_year', { ascending: false });
    return (data ?? []) as Edition[];
  }, [programId]);
  const load = useCallback(() => fetchRows().then(setRows), [fetchRows]);
  useEffect(() => {
    let cancelled = false;
    fetchRows().then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  const add = async () => {
    const e = validate(ALL, form);
    setErrors(e);
    if (Object.keys(e).length || !supabase) return;
    setBusy(true);
    const payload = { program_id: programId, ...Object.fromEntries(ALL.map((f) => [f.name, toDb(f, form[f.name])])) };
    const { error } = await supabase.from('program_editions').insert(payload);
    setBusy(false);
    if (error) return notify('Не удалось добавить', dbErrorRu(error.message));
    setForm(EMPTY);
    load();
  };

  const remove = async (id: string) => {
    if (!(await confirmAction('Удалить стоимость?', 'Запись за этот учебный год будет удалена.', 'Удалить')) || !supabase) return;
    const { error } = await supabase.from('program_editions').delete().eq('id', id);
    if (error) return notify('Не удалось удалить', dbErrorRu(error.message));
    load();
  };

  return (
    <FormSection title="Стоимость по учебным годам">
      {rows.length === 0 ? <Text style={ui.muted}>Пока не добавлено. Студенты видят «Информация уточняется».</Text> : null}
      {rows.map((r) => (
        <View key={r.id} style={{ paddingVertical: spacing.sm, gap: 4 }}>
          <Text style={ui.body}>
            {r.academic_year} · {APPLICANT_CATEGORIES[r.applicant_category]}: {fmt(r.tuition_fee_min_eur)}
            {r.tuition_fee_max_eur != null && r.tuition_fee_max_eur !== r.tuition_fee_min_eur ? ` – ${fmt(r.tuition_fee_max_eur)}` : ''}
          </Text>
          {r.fee_notes_ru ? <Text style={ui.muted}>{r.fee_notes_ru}</Text> : null}
          <StatusPills row={r} />
          {isAdmin ? <Button title="Удалить" variant="ghost" onPress={() => remove(r.id)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} /> : null}
        </View>
      ))}
      <Text style={[ui.h3, { marginTop: spacing.lg, marginBottom: spacing.md }]}>Добавить год</Text>
      {ALL.map((f) => (
        <Field key={f.name} f={f} value={form[f.name]} onChange={(v) => setForm({ ...form, [f.name]: v })} error={errors[f.name]} />
      ))}
      <Button title="Добавить стоимость" variant="outline" icon="add" onPress={add} loading={busy} testID="edition-add" />
    </FormSection>
  );
}
