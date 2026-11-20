import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { Button, EmptyState, FormField, Notice, ScreenHeader, ui } from '../components/ui';
import { colors, spacing } from '../theme';
import { t } from '../i18n';

type Mode = 'login' | 'register' | 'reset';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function AuthScreen() {
  const s = t();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(params.mode === 'register' || params.mode === 'reset' ? params.mode : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = mode === 'login' ? s.auth.loginTitle : mode === 'register' ? s.auth.registerTitle : s.auth.resetTitle;

  if (!auth.enabled) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title={title} back />
        <EmptyState icon="server-outline" title={s.profile.serverOffTitle} text={s.profile.serverOffText} />
      </View>
    );
  }

  const submit = async () => {
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = s.auth.invalidEmail;
    if (mode !== 'reset' && password.length < 8) e.password = s.auth.shortPassword;
    setErrors(e);
    setInfo(null);
    if (e.email || e.password) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.signIn(email.trim(), password);
        router.back();
      } else if (mode === 'register') {
        const { needsConfirmation } = await auth.signUp(email.trim(), password, fullName.trim());
        if (needsConfirmation) setInfo(s.auth.checkEmail);
        else router.back();
      } else {
        await auth.resetPassword(email.trim());
        setInfo(s.auth.resetSent);
      }
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
    setInfo(null);
  };

  return (
    <KeyboardAvoidingView style={[ui.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={title} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
        {mode === 'register' ? <FormField label={s.auth.fullName} value={fullName} onChangeText={setFullName} autoComplete="name" testID="auth-name" /> : null}
        <FormField
          label={s.auth.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          error={errors.email}
          testID="auth-email"
        />
        {mode !== 'reset' ? (
          <FormField
            label={s.auth.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            error={errors.password}
            testID="auth-password"
          />
        ) : null}
        {errors.form ? <Text style={{ color: colors.danger }} accessibilityLiveRegion="assertive">{errors.form}</Text> : null}
        {info ? <Notice text={info} /> : null}
        <Button
          title={mode === 'login' ? s.auth.submitLogin : mode === 'register' ? s.auth.submitRegister : s.auth.submitReset}
          onPress={submit}
          loading={busy}
          testID="auth-submit"
        />
        {mode === 'login' ? (
          <>
            <Button title={s.auth.forgot} variant="ghost" onPress={() => switchMode('reset')} />
            <Button title={s.auth.toRegister} variant="ghost" onPress={() => switchMode('register')} />
          </>
        ) : (
          <Button title={s.auth.toLogin} variant="ghost" onPress={() => switchMode('login')} />
        )}
        <Text style={[ui.muted, { textAlign: 'center', marginTop: spacing.md }]}>{s.auth.socialNote}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
