import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditScreen, StaffGuard } from '../../../components/admin/EditScreen';
import type { FieldDef } from '../../../components/admin/form';

const fields: FieldDef[] = [
  { name: 'country_ru', label: 'Страна проживания (по-русски)', type: 'text', required: true },
  { name: 'country_code', label: 'Код страны (3 латинские буквы)', type: 'text', required: true, placeholder: 'KAZ', hint: 'ISO-код: KAZ, UZB, RUS…' },
  { name: 'mission_name', label: 'Посольство / консульство', type: 'text', required: true },
  { name: 'address', label: 'Адрес', type: 'text' },
  { name: 'phone', label: 'Телефоны (через запятую)', type: 'text' },
  { name: 'email', label: 'Email визового отдела', type: 'text' },
  { name: 'website', label: 'Официальный сайт', type: 'url', placeholder: 'https://…' },
  { name: 'jurisdiction_ru', label: 'Кого обслуживает / важное', type: 'multiline', hint: 'Текст, начинающийся со слова «Внимание», показывается как предупреждение.' },
  { name: 'visa_center_url', label: 'Сайт визового центра', type: 'url', placeholder: 'https://…' },
  { name: 'sort_order', label: 'Порядок в списке', type: 'number' },
  { name: 'academic_year', label: 'Учебный год', type: 'year' },
];

export default function AdminVisaMissionEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffGuard title="Посольство">
      <EditScreen
        table="visa_missions"
        id={String(id)}
        fields={fields}
        defaults={{ sort_order: 200, status: 'draft', verification_status: 'unverified', academic_year: '2027/2028' }}
        title={(v) => String(v.country_ru ? `${v.country_ru} · ${v.mission_name ?? ''}` : 'Новое посольство')}
      />
    </StaffGuard>
  );
}
