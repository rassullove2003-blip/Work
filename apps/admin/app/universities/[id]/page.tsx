'use client';
import { use } from 'react';
import { EntityForm } from '@/components/EntityForm';
import { universityDefaults, universityFields } from '@/lib/entities';

export default function UniversityEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EntityForm
      table="universities"
      id={id}
      fields={universityFields}
      defaults={universityDefaults}
      listHref="/universities"
      title={(r) => String(r.official_name || 'Университет')}
    />
  );
}
