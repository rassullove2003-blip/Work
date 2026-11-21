import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditScreen, StaffGuard } from '../../../components/admin/EditScreen';
import { deadlineDefaults, deadlineFields } from '../../../components/admin/fields';
import { useOptions } from '../../../components/admin/useOptions';
import { LoadingState } from '../../../components/ui';

export default function AdminDeadlineEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const programs = useOptions(
    'degree_programs',
    'id, title_original, university:universities(official_name, name_ru)',
    (r) => {
      const u = r.university as { official_name: string; name_ru: string | null } | null;
      return { value: String(r.id), label: String(r.title_original), hint: u?.name_ru ?? u?.official_name ?? '' };
    },
    'title_original',
  );
  const scholarships = useOptions('scholarships', 'id, name_ru, organization', (r) => ({ value: String(r.id), label: String(r.name_ru), hint: String(r.organization) }), 'name_ru');
  return (
    <StaffGuard title="Дедлайн">
      {!programs || !scholarships ? (
        <LoadingState />
      ) : (
        <EditScreen
          table="admission_deadlines"
          id={String(id)}
          fields={deadlineFields(programs, scholarships)}
          defaults={deadlineDefaults}
          title={(v) => String(v.title_ru || '')}
          extraValidate={(v) => {
            const e: Record<string, string> = {};
            if (!v.program_id && !v.scholarship_id) e.program_id = 'Выберите программу или стипендию';
            if (v.starts_at && v.ends_at && String(v.starts_at) > String(v.ends_at)) e.starts_at = 'Начало позже крайнего срока';
            return e;
          }}
        />
      )}
    </StaffGuard>
  );
}
