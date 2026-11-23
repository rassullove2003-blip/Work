import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { useNotifications } from './notifications';

/** За сколько дней можно напоминать (совпадает с ограничением в базе). */
export const REMINDER_OPTIONS = [
  { days: 30, label: 'за 30 дней' },
  { days: 14, label: 'за 14 дней' },
  { days: 7, label: 'за 7 дней' },
  { days: 3, label: 'за 3 дня' },
  { days: 1, label: 'за 1 день' },
  { days: 0, label: 'в день срока' },
];
export const DEFAULT_REMINDER_DAYS = [14, 7, 3, 1, 0];

export interface ReminderSettings {
  enabled: boolean;
  days: number[];
}

interface RemindersState {
  /** id сроков, на которые подписан пользователь. */
  ids: Set<string>;
  isOn: (deadlineId: string) => boolean;
  toggle: (deadlineId: string) => Promise<boolean>;
  subscribeMany: (deadlineIds: string[]) => Promise<void>;
  loadSettings: () => Promise<ReminderSettings>;
  saveSettings: (s: ReminderSettings) => Promise<void>;
}

const Ctx = createContext<RemindersState | null>(null);

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const notifications = useNotifications();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    supabase
      .from('deadline_subscriptions')
      .select('deadline_id')
      .eq('user_id', userId)
      .then(({ data }) => {
        setIds(new Set((data ?? []).map((r) => r.deadline_id as string)));
        setLoadedFor(userId);
      });
  }, [userId]);

  // Если срок уже близко — напоминание приходит сразу, не дожидаясь утренней рассылки.
  const remindNow = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc('remind_me_now');
    if (data) notifications.refresh();
  }, [notifications]);

  const current = useMemo(() => (userId && loadedFor === userId ? ids : new Set<string>()), [ids, loadedFor, userId]);

  const value = useMemo<RemindersState>(
    () => ({
      ids: current,
      isOn: (id) => current.has(id),
      async toggle(id) {
        if (!supabase || !userId) throw new Error('Войдите в аккаунт, чтобы получать напоминания.');
        const on = !current.has(id);
        const { error } = on
          ? await supabase.from('deadline_subscriptions').upsert({ user_id: userId, deadline_id: id }, { ignoreDuplicates: true })
          : await supabase.from('deadline_subscriptions').delete().eq('user_id', userId).eq('deadline_id', id);
        if (error) throw new Error('Не удалось сохранить напоминание. Проверьте интернет.');
        setIds((prev) => {
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        });
        if (on) await remindNow();
        return on;
      },
      async subscribeMany(deadlineIds) {
        if (!supabase || !userId || deadlineIds.length === 0) return;
        const { error } = await supabase
          .from('deadline_subscriptions')
          .upsert(deadlineIds.map((deadline_id) => ({ user_id: userId, deadline_id })), { ignoreDuplicates: true });
        if (error) return;
        setIds((prev) => new Set([...prev, ...deadlineIds]));
        await remindNow();
      },
      async loadSettings() {
        if (!supabase || !userId) return { enabled: true, days: DEFAULT_REMINDER_DAYS };
        const { data } = await supabase.from('student_profiles').select('reminders_enabled, reminder_days').eq('user_id', userId).maybeSingle();
        return { enabled: data?.reminders_enabled ?? true, days: (data?.reminder_days as number[] | null) ?? DEFAULT_REMINDER_DAYS };
      },
      async saveSettings(s) {
        if (!supabase || !userId) return;
        const { error } = await supabase
          .from('student_profiles')
          .upsert({ user_id: userId, reminders_enabled: s.enabled, reminder_days: [...s.days].sort((a, b) => b - a) });
        if (error) throw new Error('Не удалось сохранить настройки.');
        if (s.enabled) await remindNow();
      },
    }),
    [current, userId, remindNow],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminders(): RemindersState {
  const v = useContext(Ctx);
  if (!v) throw new Error('RemindersProvider не подключён');
  return v;
}
