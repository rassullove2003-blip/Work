import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MAX_COMPARE } from '@uniitalia/shared';
import { loadJSON, saveJSON } from './storage';

const KEY = 'uniitalia.compare.universities';

interface CompareState {
  ids: string[];
  has: (id: string) => boolean;
  /** Добавить/убрать. Возвращает false, если список уже полон. */
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  /** Заменить список (лишнее сверх 4 отбрасывается). */
  setAll: (ids: string[]) => void;
}

const Ctx = createContext<CompareState | null>(null);

/** Сравнение до 4 вузов. Хранится на устройстве — работает и без входа в аккаунт. */
export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    loadJSON<string[]>(KEY, []).then((v) => setIds(Array.isArray(v) ? v.slice(0, MAX_COMPARE) : []));
  }, []);

  const value = useMemo<CompareState>(() => {
    const update = (next: string[]) => {
      setIds(next);
      saveJSON(KEY, next);
    };
    return {
      ids,
      has: (id) => ids.includes(id),
      toggle(id) {
        if (ids.includes(id)) {
          update(ids.filter((x) => x !== id));
          return true;
        }
        if (ids.length >= MAX_COMPARE) return false;
        update([...ids, id]);
        return true;
      },
      remove: (id) => update(ids.filter((x) => x !== id)),
      clear: () => update([]),
      setAll: (next) => update([...new Set(next)].slice(0, MAX_COMPARE)),
    };
  }, [ids]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompare(): CompareState {
  const v = useContext(Ctx);
  if (!v) throw new Error('CompareProvider не подключён');
  return v;
}
