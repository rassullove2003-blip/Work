import React, { createContext, useContext, useEffect, useState } from 'react';
import type { StaffRole } from '@uniitalia/shared';
import { supabase } from './supabase';
import { useAuth } from './auth';

interface StaffState {
  /** null — студент (или гость). */
  role: StaffRole | null;
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
}

const StaffContext = createContext<StaffState>({ role: null, loading: false, isStaff: false, isAdmin: false });

/**
 * Роль текущего пользователя. Только для отображения интерфейса:
 * реальные права проверяет база (RLS), подделать роль в приложении нельзя.
 */
export function StaffProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  // Роль хранится вместе с id пользователя, для которого загружена.
  const [loaded, setLoaded] = useState<{ userId: string; role: StaffRole | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !userId) return;
    supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLoaded({ userId, role: (data?.role as StaffRole | undefined) ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const role = userId && loaded?.userId === userId ? loaded.role : null;
  const loading = Boolean(supabase && userId && loaded?.userId !== userId);

  return (
    <StaffContext.Provider value={{ role, loading, isStaff: role !== null, isAdmin: role === 'admin' }}>
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff(): StaffState {
  return useContext(StaffContext);
}
