import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Button, EmptyState, FilterChip, FormField, Notice, ScreenHeader, ui } from '../components/ui';
import { colors, font, spacing } from '../theme';

const LEVELS = ['Учусь в школе', 'Окончил(а) школу', 'Колледж', 'Бакалавриат', 'Магистратура', 'Другое'];

type Form = { name: string; country: string; contact: string; education_level: string; field: string; comment: string };

export default function HelpScreen() {
  const { program } = useLocalSearchParams<{ program?: string }>();
  const auth = useAuth();
  const [form, setForm] = useState<Form>({ name: '', country: '', contact: '', education_level: '', field: '', comment: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'consent', string>>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Подставляем данные профиля, если вошли.
  useEffect(() => {
    if (!auth.userId) return;
    auth
      .loadProfile()
      .then((p) =>
        setForm((f) => ({
          ...f,
          name: f.name || p?.full_name || '',
          country: f.country || p?.country || '',
          contact: f.contact || auth.email || '',
          education_level: f.education_level || p?.education_level || '',
        })),
      )
      .catch(() => {});
    // профиль подставляем один раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.userId]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Укажите имя';
    if (form.contact.trim().length < 5) e.contact = 'Укажите телефон, Telegram, WhatsApp или email';
    if (!consent) e.consent = 'Нужно согласие на обработку данных';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!supabase) return setError('Сервер не подключён');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('consultation_requests').insert({
      user_id: auth.userId ?? null,
      name: form.name.trim().slice(0, 120),
      country: form.country.trim().slice(0, 80) || null,
      contact: form.contact.trim().slice(0, 200),
      education_level: form.education_level || null,
      field: form.field.trim() || null,
      comment: form.comment.trim().slice(0, 2000) || null,
      consent: true,
      source: program ? `program:${program}`.slice(0, 200) : 'app',
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes('too many') ? 'Вы уже отправили несколько заявок сегодня. Мы свяжемся с вами — подождите, пожалуйста.' : 'Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.');
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title="Помощь с поступлением" back />
        <EmptyState
          icon="checkmark-circle-outline"
          title="Заявка отправлена"
          text="Куратор UniItalia свяжется с вами по указанному контакту. Если у вас есть аккаунт, можно также написать в «Чат с куратором»."
          action={{ title: 'На главную', onPress: () => router.replace('/') }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Помощь с поступлением" back />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Notice text="Оставьте заявку — куратор UniItalia свяжется с вами, поможет выбрать программы и составить план поступления. Мы не гарантируем зачисление: решение принимает университет." />
        <View style={[ui.card, { gap: spacing.md, marginTop: spacing.lg }]}>
          <FormField label="Имя *" value={form.name} onChangeText={set('name')} error={errors.name} maxLength={120} testID="help-name" />
          <FormField label="Страна проживания" value={form.country} onChangeText={set('country')} placeholder="Например: Казахстан" maxLength={80} />
          <FormField label="Как с вами связаться *" value={form.contact} onChangeText={set('contact')} error={errors.contact} placeholder="Телефон, Telegram, WhatsApp или email" autoCapitalize="none" maxLength={200} testID="help-contact" />
          <Text style={styles.label}>Образование</Text>
          <View style={ui.wrap}>
            {LEVELS.map((l) => (
              <FilterChip key={l} label={l} selected={form.education_level === l} onPress={() => set('education_level')(form.education_level === l ? '' : l)} />
            ))}
          </View>
          <FormField label="Какое направление интересует" value={form.field} onChangeText={set('field')} placeholder="Например: экономика, IT, дизайн" maxLength={200} />
          <FormField
            label="Вопрос или комментарий"
            value={form.comment}
            onChangeText={set('comment')}
            placeholder={program ? 'Например: подойдёт ли мне эта программа?' : 'Например: какие вузы подходят с моим бюджетом?'}
            multiline
            maxLength={2000}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
            testID="help-comment"
          />
          {program ? <Text style={ui.muted}>К заявке будет приложена ссылка на программу, которую вы смотрели.</Text> : null}
          <Pressable onPress={() => setConsent((c) => !c)} style={styles.consent} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} testID="help-consent">
            <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={24} color={consent ? colors.secondary : colors.textMuted} />
            <Text style={[ui.muted, { flex: 1 }]}>Согласен(на) на обработку указанных данных для связи со мной по вопросу поступления.</Text>
          </Pressable>
          {errors.consent ? <Text style={styles.error}>{errors.consent}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Отправить заявку" icon="send-outline" onPress={submit} loading={busy} testID="help-submit" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { ...font.small, fontWeight: '600', color: colors.text },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44 },
  error: { ...font.small, color: colors.danger },
});
