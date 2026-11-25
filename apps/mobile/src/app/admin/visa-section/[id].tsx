import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditScreen, StaffGuard } from '../../../components/admin/EditScreen';
import type { FieldDef } from '../../../components/admin/form';

const fields: FieldDef[] = [
  { name: 'title_ru', label: 'Заголовок шага', type: 'text', required: true },
  { name: 'body_ru', label: 'Текст', type: 'multiline', required: true, hint: 'Каждый пункт — с новой строки, начиная с «• ».' },
  { name: 'sort_order', label: 'Порядок в списке', type: 'number', hint: 'Меньше — выше.' },
  { name: 'academic_year', label: 'Учебный год', type: 'year' },
];

export default function AdminVisaSectionEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffGuard title="Шаг">
      <EditScreen
        table="visa_sections"
        id={String(id)}
        fields={fields}
        defaults={{ sort_order: 200, status: 'draft', verification_status: 'unverified', academic_year: '2027/2028' }}
        title={(v) => String(v.title_ru || 'Новый шаг')}
      />
    </StaffGuard>
  );
}
