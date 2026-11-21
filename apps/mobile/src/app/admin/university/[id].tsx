import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditScreen, StaffGuard } from '../../../components/admin/EditScreen';
import { SLUG_RE, universityDefaults, universityFields } from '../../../components/admin/fields';

export default function AdminUniversityEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffGuard title="Университет">
      <EditScreen
        table="universities"
        id={String(id)}
        fields={universityFields}
        defaults={universityDefaults}
        title={(v) => String(v.name_ru || v.official_name || '')}
        extraValidate={(v) => (v.slug && !SLUG_RE.test(String(v.slug).trim()) ? { slug: 'Только латиница, цифры и дефис' } : ({} as Record<string, string>))}
      />
    </StaffGuard>
  );
}
