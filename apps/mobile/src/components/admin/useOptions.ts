import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Option } from './form';

/** Загружает варианты для выпадающего списка (включая черновики — для персонала). */
export function useOptions(table: string, select: string, map: (r: Record<string, unknown>) => Option, order: string): Option[] | null {
  const [opts, setOpts] = useState<Option[] | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from(table)
      .select(select)
      .order(order)
      .limit(2000)
      .then(({ data }) => setOpts(((data ?? []) as unknown as Record<string, unknown>[]).map(map)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, order]);
  return opts;
}
