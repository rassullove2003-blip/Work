import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditScreen, StaffGuard } from '../../../components/admin/EditScreen';
import { EditionsPanel } from '../../../components/admin/EditionsPanel';
import { programDefaults, programFields, SLUG_RE } from '../../../components/admin/fields';
import { useOptions } from '../../../components/admin/useOptions';
import { LoadingState } from '../../../components/ui';

export default function AdminProgramEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const universities = useOptions('universities', 'id, official_name, name_ru', (r) => ({ value: String(r.id), label: String(r.name_ru || r.official_name), hint: String(r.official_name) }), 'official_name');
  return (
    <StaffGuard title="Программа">
      {!universities ? (
        <LoadingState />
      ) : (
        <EditScreen
          table="degree_programs"
          id={String(id)}
          fields={programFields(universities)}
          defaults={programDefaults}
          title={(v) => String(v.title_original || '')}
          extraValidate={(v) => (v.slug && !SLUG_RE.test(String(v.slug).trim()) ? { slug: 'Только латиница, цифры и дефис' } : ({} as Record<string, string>))}
          footer={(pid) => <EditionsPanel programId={pid} />}
        />
      )}
    </StaffGuard>
  );
}
