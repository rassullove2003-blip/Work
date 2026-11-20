import React, { useEffect, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth, type StudentProfile } from '../../lib/auth';
import { confirmAction, notify } from '../../lib/links';
import { Button, EmptyState, FormField, LoadingState, Notice, Section, ui } from '../../components/ui';
import { colors, spacing } from '../../theme';
import { t } from '../../i18n';

type Form = { full_name: string; country: string; citizenship: string; education_level: string; budget_eur: string; target_academic_year: string };

const toForm = (p: StudentProfile | null): Form => ({
  full_name: p?.full_name ?? '',
  country: p?.country ?? '',
  citizenship: p?.citizenship ?? '',
  education_level: p?.education_level ?? '',
  budget_eur: p?.budget_eur != null ? String(p.budget_eur) : '',
  target_academic_year: p?.target_academic_year ?? '',
});

function ProfileForm() {
  const s = t();
  const auth = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    auth
      .loadProfile()
      .then((p) => setForm(toForm(p)))
      .catch((e: Error) => {
        setLoadError(e.message);
        setForm(toForm(null));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.userId]);

  if (!form) return <LoadingState />;
  const set = (k: keyof Form) => (v: string) => setForm({ ...form, [k]: v });

  const save = async () => {
    const e: typeof errors = {};
    if (form.budget_eur && !/^\d{1,7}$/.test(form.budget_eur.trim())) e.budget_eur = 'Введите сумму целым числом';
    if (form.target_academic_year && !/^\d{4}\/\d{4}$/.test(form.target_academic_year.trim())) e.target_academic_year = 'Формат: 2027/2028';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await auth.saveProfile({
        full_name: form.full_name.trim() || null,
        country: form.country.trim() || null,
        citizenship: form.citizenship.trim() || null,
        education_level: form.education_level.trim() || null,
        budget_eur: form.budget_eur.trim() ? Number(form.budget_eur.trim()) : null,
        target_academic_year: form.target_academic_year.trim() || null,
      });
      notify(s.profile.saved);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={ui.card}>
      {loadError ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{loadError}</Text> : null}
      <FormField label={s.profile.fullName} value={form.full_name} onChangeText={set('full_name')} autoComplete="name" />
      <FormField label={s.profile.country} value={form.country} onChangeText={set('country')} placeholder="Казахстан" />
      <FormField label={s.profile.citizenship} value={form.citizenship} onChangeText={set('citizenship')} />
      <FormField label={s.profile.educationLevel} value={form.education_level} onChangeText={set('education_level')} placeholder="11 классов / бакалавр" />
      <FormField label={s.profile.budget} value={form.budget_eur} onChangeText={set('budget_eur')} keyboardType="number-pad" error={errors.budget_eur} />
      <FormField label={s.profile.targetYear} value={form.target_academic_year} onChangeText={set('target_academic_year')} placeholder={s.profile.targetYearHint} error={errors.target_academic_year} />
      <Button title={s.common.save} onPress={save} loading={busy} testID="profile-save" />
    </View>
  );
}

export default function ProfileScreen() {
  const s = t();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const doExport = async () => {
    try {
      const data = await auth.exportData();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'UniItalia — мои данные' });
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const doDelete = async () => {
    const ok = await confirmAction(s.profile.deleteConfirmTitle, s.profile.deleteConfirmText, s.profile.deleteAccount);
    if (!ok) return;
    try {
      await auth.deleteAccount();
      notify(s.profile.deleted);
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { paddingTop: insets.top + spacing.lg }]} keyboardShouldPersistTaps="handled">
      <Text style={ui.h2} accessibilityRole="header">
        {s.profile.title}
      </Text>

      {!auth.enabled ? (
        <View style={[ui.card, { marginTop: spacing.lg }]}>
          <EmptyState icon="server-outline" title={s.profile.serverOffTitle} text={s.profile.serverOffText} />
        </View>
      ) : !auth.ready ? (
        <LoadingState />
      ) : !auth.userId ? (
        <View style={[ui.card, { marginTop: spacing.lg, gap: spacing.sm }]}>
          <EmptyState icon="person-circle-outline" title={s.profile.guestTitle} text={s.profile.guestText} />
          <Button title={s.profile.login} onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} testID="profile-login" />
          <Button title={s.profile.register} variant="outline" onPress={() => router.push({ pathname: '/auth', params: { mode: 'register' } })} />
        </View>
      ) : (
        <>
          <Text style={[ui.muted, { marginTop: spacing.xs }]}>{auth.email}</Text>
          <Section title="Мои данные">
            <ProfileForm />
          </Section>
          <Section title="Аккаунт">
            <View style={{ gap: spacing.sm }}>
              <Button title={s.profile.exportData} variant="outline" icon="download-outline" onPress={doExport} />
              <Button title={s.profile.logout} variant="outline" icon="log-out-outline" onPress={() => auth.signOut()} />
              <Button title={s.profile.deleteAccount} variant="danger" icon="trash-outline" onPress={doDelete} />
            </View>
          </Section>
        </>
      )}

      <Section title={s.profile.aboutData}>
        <Notice text={s.profile.aboutDataText} />
        <Text style={[ui.muted, { marginTop: spacing.md }]}>Версия {Constants.expoConfig?.version ?? '—'}</Text>
      </Section>
    </ScrollView>
  );
}
