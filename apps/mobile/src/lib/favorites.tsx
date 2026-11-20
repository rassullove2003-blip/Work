import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { loadJSON, saveJSON } from './storage';

/**
 * Избранное.
 *  - server: Supabase подключён и пользователь вошёл — данные в saved_universities / saved_programs (RLS: только владелец);
 *  - local:  демо-режим без сервера — данные только на этом устройстве;
 *  - login_required: Supabase подключён, но пользователь — гость.
 */
export type FavoritesMode = 'server' | 'local' | 'login_required';

interface FavoritesState {
  mode: FavoritesMode;
  universityIds: Set<string>;
  programIds: Set<string>;
  toggleUniversity: (id: string) => Promise<void>;
  toggleProgram: (id: string) => Promise<void>;
  error: string | null;
}

const KEY = 'uniitalia.favorites.v1';
const FavoritesContext = createContext<FavoritesState | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const mode: FavoritesMode = !auth.enabled ? 'local' : auth.userId ? 'server' : 'login_required';
  const [universityIds, setUniversityIds] = useState<Set<string>>(new Set());
  const [programIds, setProgramIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mode === 'local') {
        const saved = await loadJSON<{ u: string[]; p: string[] }>(KEY, { u: [], p: [] });
        if (!cancelled) {
          setUniversityIds(new Set(saved.u));
          setProgramIds(new Set(saved.p));
        }
      } else if (mode === 'server' && supabase) {
        const [u, p] = await Promise.all([
          supabase.from('saved_universities').select('university_id'),
          supabase.from('saved_programs').select('program_id'),
        ]);
        if (cancelled) return;
        if (u.error || p.error) {
          setError('Не удалось загрузить избранное.');
          return;
        }
        setUniversityIds(new Set((u.data ?? []).map((r) => r.university_id as string)));
        setProgramIds(new Set((p.data ?? []).map((r) => r.program_id as string)));
      } else {
        setUniversityIds(new Set());
        setProgramIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, auth.userId]);

  const persistLocal = useCallback((u: Set<string>, p: Set<string>) => saveJSON(KEY, { u: [...u], p: [...p] }), []);

  const toggle = useCallback(
    async (kind: 'university' | 'program', id: string) => {
      if (mode === 'login_required') {
        router.push('/auth');
        return;
      }
      const current = kind === 'university' ? universityIds : programIds;
      const next = new Set(current);
      const adding = !next.has(id);
      if (adding) next.add(id);
      else next.delete(id);
      // оптимистичное обновление
      if (kind === 'university') setUniversityIds(next);
      else setProgramIds(next);
      setError(null);

      if (mode === 'local') {
        await persistLocal(kind === 'university' ? next : universityIds, kind === 'program' ? next : programIds);
        return;
      }
      if (!supabase || !auth.userId) return;
      const table = kind === 'university' ? 'saved_universities' : 'saved_programs';
      const col = kind === 'university' ? 'university_id' : 'program_id';
      const res = adding
        ? await supabase.from(table).insert({ user_id: auth.userId, [col]: id })
        : await supabase.from(table).delete().eq('user_id', auth.userId).eq(col, id);
      if (res.error) {
        // откат
        if (kind === 'university') setUniversityIds(current);
        else setProgramIds(current);
        setError('Не удалось обновить избранное. Попробуйте ещё раз.');
      }
    },
    [mode, universityIds, programIds, auth.userId, persistLocal],
  );

  const value = useMemo<FavoritesState>(
    () => ({
      mode,
      universityIds,
      programIds,
      error,
      toggleUniversity: (id) => toggle('university', id),
      toggleProgram: (id) => toggle('program', id),
    }),
    [mode, universityIds, programIds, error, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesState {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites вне FavoritesProvider');
  return ctx;
}
