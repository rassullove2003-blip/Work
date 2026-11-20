import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  EMPTY_PROGRAM_FILTERS,
  EMPTY_UNIVERSITY_FILTERS,
  type ProgramFilters,
  type UniversityFilters,
} from '@uniitalia/shared';
import { loadJSON, saveJSON } from './storage';

export type SearchTab = 'programs' | 'universities';

interface FiltersState {
  tab: SearchTab;
  setTab: (t: SearchTab) => void;
  programFilters: ProgramFilters;
  setProgramFilters: (f: ProgramFilters | ((prev: ProgramFilters) => ProgramFilters)) => void;
  universityFilters: UniversityFilters;
  setUniversityFilters: (f: UniversityFilters | ((prev: UniversityFilters) => UniversityFilters)) => void;
}

const KEY = 'uniitalia.filters.v1';
const FiltersContext = createContext<FiltersState | null>(null);

/** Хранит выбранные фильтры поиска и сохраняет их на устройстве между запусками. */
export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<SearchTab>('programs');
  const [programFilters, setProgramFilters] = useState<ProgramFilters>(EMPTY_PROGRAM_FILTERS);
  const [universityFilters, setUniversityFilters] = useState<UniversityFilters>(EMPTY_UNIVERSITY_FILTERS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadJSON<{ tab?: SearchTab; p?: Partial<ProgramFilters>; u?: Partial<UniversityFilters> }>(KEY, {}).then((s) => {
      if (s.tab) setTab(s.tab);
      if (s.p) setProgramFilters((prev) => ({ ...EMPTY_PROGRAM_FILTERS, ...s.p, query: prev.query }));
      if (s.u) setUniversityFilters((prev) => ({ ...EMPTY_UNIVERSITY_FILTERS, ...s.u, query: prev.query }));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // текст запроса не сохраняем, только фильтры
    saveJSON(KEY, { tab, p: { ...programFilters, query: '' }, u: { ...universityFilters, query: '' } });
  }, [loaded, tab, programFilters, universityFilters]);

  const value = useMemo(
    () => ({ tab, setTab, programFilters, setProgramFilters, universityFilters, setUniversityFilters }),
    [tab, programFilters, universityFilters],
  );
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersState {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters вне FiltersProvider');
  return ctx;
}
