'use client';
import { use, useEffect, useState } from 'react';
import { EntityForm } from '@/components/EntityForm';
import { EditionsPanel } from '@/components/EditionsPanel';
import { programDefaults, programFields } from '@/lib/entities';
import { errorRu, supabase } from '@/lib/supabase';

export default function ProgramEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [unis, setUnis] = useState<{ id: string; official_name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase!.from('universities').select('id, official_name').order('official_name').then(({ data, error }) => {
      if (error) setError(errorRu(error.message));
      setUnis(data ?? []);
    });
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!unis) return <p className="muted">Загрузка…</p>;
  return (
    <>
      <EntityForm
        table="degree_programs"
        id={id}
        fields={programFields(unis)}
        defaults={{ ...programDefaults, university_id: unis[0]?.id }}
        listHref="/programs"
        title={(r) => String(r.title_original || 'Программа')}
      />
      {id !== 'new' && <EditionsPanel programId={id} />}
    </>
  );
}
