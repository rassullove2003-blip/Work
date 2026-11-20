'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import project from '../../../supabase/project.json';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || project.url;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || project.publishableKey;

export const isConfigured = /^https:\/\//.test(url) && key.length > 20;

/**
 * Клиент с публичным anon key. Безопасность обеспечивают политики RLS:
 * писать в каталог могут только пользователи из admin_users (admin/editor),
 * удалять — только admin. Проверка роли в интерфейсе — лишь удобство.
 */
export const supabase: SupabaseClient | null = isConfigured ? createClient(url, key) : null;

export type StaffRole = 'admin' | 'editor';

export function errorRu(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Недостаточно прав для этого действия.';
  if (m.includes('duplicate key') && m.includes('slug')) return 'Запись с таким slug уже существует.';
  if (m.includes('duplicate key')) return 'Такая запись уже существует.';
  if (m.includes('violates check constraint')) return 'Некорректное значение поля (проверьте формат ссылки, учебного года или slug).';
  if (m.includes('verification_status=verified')) return 'Статус «Проверено» требует ссылку на источник и дату проверки.';
  if (m.includes('invalid login credentials')) return 'Неверный email или пароль.';
  if (m.includes('foreign key')) return 'Связанная запись не найдена или используется в других таблицах.';
  return `Ошибка: ${message}`;
}
