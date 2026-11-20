import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true, если заданы переменные окружения Supabase. Иначе приложение работает в демо-режиме. */
export const isSupabaseConfigured = /^https:\/\//.test(url) && anonKey.length > 20;

// В мобильное приложение попадает только публичный anon key: все права
// ограничиваются политиками RLS на сервере. service_role key здесь недопустим.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
