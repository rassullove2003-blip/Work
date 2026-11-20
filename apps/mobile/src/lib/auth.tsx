import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

export interface StudentProfile {
  user_id: string;
  full_name: string | null;
  country: string | null;
  citizenship: string | null;
  education_level: string | null;
  interested_fields: string[];
  budget_eur: number | null;
  target_academic_year: string | null;
}

interface AuthState {
  enabled: boolean;
  ready: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  loadProfile: () => Promise<StudentProfile | null>;
  saveProfile: (p: Partial<StudentProfile>) => Promise<void>;
  exportData: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Переводит частые ошибки Supabase Auth на русский. */
export function authErrorRu(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Неверный email или пароль.';
  if (m.includes('email not confirmed')) return 'Email не подтверждён. Проверьте почту.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Пользователь с таким email уже зарегистрирован.';
  if (m.includes('password should be')) return 'Пароль слишком простой. Используйте не менее 8 символов.';
  if (m.includes('rate limit')) return 'Слишком много попыток. Попробуйте позже.';
  if (m.includes('network') || m.includes('fetch')) return 'Нет соединения с сервером. Проверьте интернет.';
  return 'Произошла ошибка. Попробуйте ещё раз.';
}

function requireClient() {
  if (!supabase) throw new Error('Supabase не настроен');
  return supabase;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      enabled: isSupabaseConfigured,
      ready,
      session,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      async signIn(email, password) {
        const { error } = await requireClient().auth.signInWithPassword({ email, password });
        if (error) throw new Error(authErrorRu(error.message));
      },
      async signUp(email, password, fullName) {
        const { data, error } = await requireClient().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw new Error(authErrorRu(error.message));
        return { needsConfirmation: !data.session };
      },
      async resetPassword(email) {
        const { error } = await requireClient().auth.resetPasswordForEmail(email);
        if (error) throw new Error(authErrorRu(error.message));
      },
      async signOut() {
        await requireClient().auth.signOut();
      },
      async deleteAccount() {
        const client = requireClient();
        const { error } = await client.rpc('delete_my_account');
        if (error) throw new Error('Не удалось удалить аккаунт. Попробуйте позже.');
        await client.auth.signOut();
      },
      async loadProfile() {
        if (!session) return null;
        const { data, error } = await requireClient()
          .from('student_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (error) throw new Error('Не удалось загрузить профиль.');
        return data as StudentProfile | null;
      },
      async saveProfile(p) {
        if (!session) throw new Error('Нужно войти в аккаунт.');
        const { error } = await requireClient()
          .from('student_profiles')
          .upsert({ ...p, user_id: session.user.id });
        if (error) throw new Error('Не удалось сохранить профиль. Проверьте введённые данные.');
      },
      async exportData() {
        const { data, error } = await requireClient().rpc('export_my_data');
        if (error) throw new Error('Не удалось выгрузить данные.');
        return data;
      },
    }),
    [ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
