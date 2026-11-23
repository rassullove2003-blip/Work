import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './auth';

export interface AppNotification {
  id: string;
  kind: 'deadline' | 'chat' | 'status' | 'comment' | 'document' | 'task';
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationsState {
  unread: number;
  /** Непрочитанные сообщения в чате с куратором (для студента). */
  unreadChat: number;
  refresh: () => void;
  list: () => Promise<AppNotification[]>;
  markAllRead: () => Promise<void>;
}

const Ctx = createContext<NotificationsState>({
  unread: 0,
  unreadChat: 0,
  refresh: () => {},
  list: async () => [],
  markAllRead: async () => {},
});

/** Счётчик непрочитанных уведомлений; обновляется мгновенно через Realtime, при возврате в приложение и раз в минуту. */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [counts, setCounts] = useState({ unread: 0, unreadChat: 0 });

  const refresh = useCallback(() => {
    if (!supabase || !userId) return;
    const base = () => supabase!.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
    Promise.all([base(), base().eq('kind', 'chat').eq('link', '/chat')]).then(([all, chat]) =>
      setCounts({ unread: all.count ?? 0, unreadChat: chat.count ?? 0 }),
    );
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!supabase || !userId) return;
    const client = supabase;
    const channel = client
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const timer = setInterval(refresh, 60_000);
    return () => {
      client.removeChannel(channel);
      sub.remove();
      clearInterval(timer);
    };
  }, [userId, refresh]);

  const value = useMemo<NotificationsState>(
    () => ({
      ...(userId ? counts : { unread: 0, unreadChat: 0 }),
      refresh,
      async list() {
        if (!supabase || !userId) return [];
        const { data, error } = await supabase
          .from('notifications')
          .select('id, kind, title, body, link, read_at, created_at')
          .eq('user_id', userId)
          .lte('send_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw new Error('Не удалось загрузить уведомления');
        return (data ?? []) as AppNotification[];
      },
      async markAllRead() {
        if (!supabase || !userId) return;
        await supabase.rpc('mark_notifications_read');
        refresh();
      },
    }),
    [counts, refresh, userId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsState {
  return useContext(Ctx);
}
