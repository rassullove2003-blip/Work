import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useStaff } from '../../lib/staff';
import { useCatalog } from '../../lib/catalog';
import { confirmAction, notify } from '../../lib/links';
import { Button, EmptyState, LoadingState, Notice, ScreenHeader, ui } from '../ui';
import { Field, FormSection, toDb, toForm, validate, VERIFICATION_FIELDS, type FieldDef, type Values } from './form';
import { colors, spacing } from '../../theme';

/** Переводит ошибки базы на понятный русский. */
export function dbErrorRu(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Недостаточно прав для этого действия.';
  if (m.includes('duplicate key') && m.includes('slug')) return 'Запись с таким адресом (slug) уже существует. Измените slug.';
  if (m.includes('duplicate key')) return 'Такая запись уже существует.';
  if (m.includes('verification_status=verified')) return 'Для статуса «Проверено» укажите источник и дату проверки.';
  if (m.includes('violates check constraint')) return 'Одно из полей заполнено в неверном формате (ссылка, учебный год, slug или число).';
  if (m.includes('foreign key')) return 'Связанная запись не найдена или используется в других разделах.';
  if (m.includes('network') || m.includes('fetch')) return 'Нет соединения с сервером. Проверьте интернет.';
  return `Ошибка: ${message}`;
}

/** Показывает содержимое только сотрудникам (по необходимости — только администратору). */
export function StaffGuard({ adminOnly = false, title, children }: { adminOnly?: boolean; title: string; children: React.ReactNode }) {
  const { isStaff, isAdmin, loading } = useStaff();
  if (loading) return <LoadingState />;
  if (!isStaff || (adminOnly && !isAdmin)) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title={title} back />
        <EmptyState icon="lock-closed-outline" title="Нет доступа" text={adminOnly ? 'Раздел доступен только администратору.' : 'Раздел доступен только сотрудникам UniItalia.'} />
      </View>
    );
  }
  return <>{children}</>;
}

export function EditScreen({
  table,
  id,
  title,
  fields,
  defaults,
  withVerification = true,
  extraValidate,
  footer,
}: {
  table: string;
  id: string; // 'new' — создание
  title: (v: Values) => string;
  fields: FieldDef[];
  defaults: Values;
  withVerification?: boolean;
  extraValidate?: (v: Values) => Record<string, string>;
  footer?: (savedId: string) => React.ReactNode;
}) {
  const { isAdmin } = useStaff();
  const catalog = useCatalog();
  const isNew = id === 'new';
  const all = useMemo(() => (withVerification ? [...fields, ...VERIFICATION_FIELDS] : fields), [fields, withVerification]);
  const [values, setValues] = useState<Values | null>(
    isNew ? Object.fromEntries(all.map((f) => [f.name, toForm(f, defaults[f.name])])) : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !supabase) return;
    supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setLoadError(dbErrorRu(error.message));
        if (!data) return setLoadError('Запись не найдена или удалена.');
        setValues(Object.fromEntries(all.map((f) => [f.name, toForm(f, data[f.name])])));
      });
  }, [id, table, isNew, all]);

  if (loadError) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title="Редактирование" back />
        <EmptyState icon="alert-circle-outline" title={loadError} />
      </View>
    );
  }
  if (!values) return <LoadingState />;

  const set = (name: string) => (v: unknown) => {
    setSavedAt(null);
    setValues({ ...values, [name]: v });
  };

  const save = async () => {
    const e = { ...validate(all, values), ...(extraValidate?.(values) ?? {}) };
    setErrors(e);
    if (Object.keys(e).length) {
      notify('Проверьте поля', 'Некоторые поля заполнены неверно — они отмечены красным.');
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const payload = Object.fromEntries(all.map((f) => [f.name, toDb(f, values[f.name])]));
    const res = isNew
      ? await supabase.from(table).insert(payload).select('id').single()
      : await supabase.from(table).update(payload).eq('id', id).select('id').single();
    setBusy(false);
    if (res.error) {
      notify('Не удалось сохранить', dbErrorRu(res.error.message));
      return;
    }
    catalog.reload();
    setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    if (isNew) router.replace({ pathname: `/admin/${table === 'degree_programs' ? 'program' : table === 'admission_deadlines' ? 'deadline' : 'university'}/[id]`, params: { id: res.data.id } } as never);
  };

  const remove = async () => {
    const ok = await confirmAction('Удалить запись?', 'Запись и связанные с ней данные будут удалены безвозвратно.', 'Удалить');
    if (!ok || !supabase) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      notify('Не удалось удалить', dbErrorRu(error.message));
      return;
    }
    catalog.reload();
    if (router.canGoBack()) router.back();
    else router.replace('/admin' as never);
  };

  const publishingUnverified = values.status === 'published' && values.verification_status !== 'verified';

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={isNew ? 'Новая запись' : 'Редактирование'} back />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Text style={ui.h2}>{isNew ? 'Новая запись' : title(values) || 'Без названия'}</Text>
        <FormSection title="Основное">
          {fields.map((f) => (
            <Field key={f.name} f={f} value={values[f.name]} onChange={set(f.name)} error={errors[f.name]} />
          ))}
        </FormSection>
        {withVerification ? (
          <FormSection title="Проверка и публикация">
            {VERIFICATION_FIELDS.map((f) => (
              <Field key={f.name} f={f} value={values[f.name]} onChange={set(f.name)} error={errors[f.name]} />
            ))}
            {publishingUnverified ? (
              <Notice tone="warning" text="Запись будет опубликована как непроверенная — студенты увидят пометку «Не проверено»." />
            ) : null}
          </FormSection>
        ) : null}

        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          <Button title={busy ? 'Сохранение…' : 'Сохранить'} onPress={save} loading={busy} testID="admin-save" />
          {savedAt ? <Text style={{ color: '#00805F', textAlign: 'center', fontWeight: '600' }}>Сохранено в {savedAt}</Text> : null}
          {!isNew && isAdmin ? <Button title="Удалить" variant="danger" icon="trash-outline" onPress={remove} /> : null}
          {!isNew && !isAdmin ? <Text style={[ui.muted, { textAlign: 'center' }]}>Удалять записи может только администратор.</Text> : null}
        </View>

        {!isNew && footer ? footer(id) : null}
        <View style={{ height: spacing.xxl }} />
        <Text style={[ui.muted, { color: colors.textMuted, textAlign: 'center' }]}>Все изменения записываются в журнал с указанием автора.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
