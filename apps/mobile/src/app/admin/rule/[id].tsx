import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditScreen, StaffGuard } from '../../../components/admin/EditScreen';
import type { FieldDef } from '../../../components/admin/form';

const fields: FieldDef[] = [
  { name: 'section', label: 'Раздел', type: 'text', required: true, placeholder: 'Например: Виза · общий срок', hint: 'Тема до «·» становится фильтром на экране правил.' },
  { name: 'body_ru', label: 'Правило и пояснение', type: 'multiline', required: true },
  { name: 'sort_order', label: 'Порядок в списке', type: 'number', hint: 'Меньше — выше. Шаг 10 удобно оставлять для вставки.' },
  { name: 'academic_year', label: 'Учебный год', type: 'year' },
];

export default function AdminRuleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffGuard title="Правило">
      <EditScreen
        table="admission_rules"
        id={String(id)}
        fields={fields}
        defaults={{ sort_order: 200, status: 'draft', verification_status: 'unverified', academic_year: '2027/2028' }}
        title={(v) => String(v.section || 'Новое правило')}
      />
    </StaffGuard>
  );
}
