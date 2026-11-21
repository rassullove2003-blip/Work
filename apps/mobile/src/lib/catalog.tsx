import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  seedPrograms,
  seedScholarships,
  seedUniversities,
  type Deadline,
  type Program,
  type ProgramWithUniversity,
  type Scholarship,
  type University,
} from '@uniitalia/shared';
import { isSupabaseConfigured, supabase } from './supabase';

export type CatalogSource = 'supabase' | 'local';

interface CatalogState {
  status: 'loading' | 'ready' | 'error';
  source: CatalogSource;
  error: string | null;
  universities: University[];
  programs: ProgramWithUniversity[];
  scholarships: Scholarship[];
  /** Опубликованные сроки (проверенные и непроверенные — статус показывается в интерфейсе). */
  deadlines: Deadline[];
  /** true, если в каталоге есть хотя бы одна демонстрационная запись. */
  hasDemoData: boolean;
  reload: () => void;
  universityBySlug: (slug: string) => University | undefined;
  programBySlug: (slug: string) => ProgramWithUniversity | undefined;
  scholarshipBySlug: (slug: string) => Scholarship | undefined;
  programsOfUniversity: (universityId: string) => ProgramWithUniversity[];
  scholarshipsOfUniversity: (universityId: string) => Scholarship[];
  deadlinesOfProgram: (programId: string) => Deadline[];
}

const CatalogContext = createContext<CatalogState | null>(null);

function joinPrograms(programs: Program[], universities: University[]): ProgramWithUniversity[] {
  const byId = new Map(universities.map((u) => [u.id, u]));
  return programs.flatMap((p) => {
    const university = byId.get(p.university_id);
    return university ? [{ ...p, university }] : [];
  });
}

type ProgramCatalogRow = Omit<Program, 'tuition_fee_min_eur' | 'tuition_fee_max_eur'> & {
  fee_min_eur: number | string | null;
  fee_max_eur: number | string | null;
  fee_academic_year: string | null;
};

async function loadFromSupabase() {
  if (!supabase) throw new Error('Supabase не настроен');
  const [u, p, s, us, d] = await Promise.all([
    supabase.from('universities').select('*').eq('status', 'published'),
    supabase.from('program_catalog').select('*').eq('status', 'published'),
    supabase.from('scholarships').select('*').eq('status', 'published'),
    supabase.from('university_scholarships').select('university_id, scholarship_id'),
    supabase.from('admission_deadlines').select('*').eq('status', 'published').order('ends_at'),
  ]);
  const err = u.error ?? p.error ?? s.error ?? us.error ?? d.error;
  if (err) throw new Error(err.message);

  const universities = (u.data ?? []) as University[];
  const programs: Program[] = ((p.data ?? []) as ProgramCatalogRow[]).map((row) => {
    const { fee_min_eur, fee_max_eur, fee_academic_year, ...rest } = row;
    return {
      ...rest,
      tuition_fee_min_eur: fee_min_eur == null ? null : Number(fee_min_eur),
      tuition_fee_max_eur: fee_max_eur == null ? null : Number(fee_max_eur),
      // для стоимости показываем учебный год издания программы
      academic_year: fee_academic_year ?? rest.academic_year,
    };
  });
  const links = (us.data ?? []) as { university_id: string; scholarship_id: string }[];
  const scholarships = ((s.data ?? []) as Omit<Scholarship, 'university_ids'>[]).map((sch) => ({
    ...sch,
    university_ids: links.filter((l) => l.scholarship_id === sch.id).map((l) => l.university_id),
  }));
  const deadlines = (d.data ?? []) as Deadline[];
  return { universities, programs, scholarships, deadlines };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const source: CatalogSource = isSupabaseConfigured ? 'supabase' : 'local';
  const [status, setStatus] = useState<CatalogState['status']>(source === 'local' ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState(() =>
    source === 'local'
      ? { universities: seedUniversities, programs: seedPrograms, scholarships: seedScholarships, deadlines: [] as Deadline[] }
      : { universities: [] as University[], programs: [] as Program[], scholarships: [] as Scholarship[], deadlines: [] as Deadline[] },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (source === 'local') return;
    let cancelled = false;
    loadFromSupabase()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus('ready');
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [source, attempt]);

  const value = useMemo<CatalogState>(() => {
    const programs = joinPrograms(data.programs, data.universities);
    const uniBySlug = new Map(data.universities.map((u) => [u.slug, u]));
    const progBySlug = new Map(programs.map((p) => [p.slug, p]));
    const schBySlug = new Map(data.scholarships.map((s) => [s.slug, s]));
    return {
      status,
      source,
      error,
      universities: data.universities,
      programs,
      scholarships: data.scholarships,
      deadlines: data.deadlines,
      hasDemoData:
        data.universities.some((u) => u.is_demo) || programs.some((p) => p.is_demo) || data.scholarships.some((s) => s.is_demo),
      reload: () => {
        setStatus('loading');
        setAttempt((n) => n + 1);
      },
      universityBySlug: (slug) => uniBySlug.get(slug),
      programBySlug: (slug) => progBySlug.get(slug),
      scholarshipBySlug: (slug) => schBySlug.get(slug),
      programsOfUniversity: (id) => programs.filter((p) => p.university_id === id),
      scholarshipsOfUniversity: (id) => data.scholarships.filter((s) => s.university_ids.includes(id)),
      deadlinesOfProgram: (id) => data.deadlines.filter((d) => d.program_id === id),
    };
  }, [data, status, source, error]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogState {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog вне CatalogProvider');
  return ctx;
}

export function useReloadCatalog() {
  const { reload } = useCatalog();
  return useCallback(() => reload(), [reload]);
}
