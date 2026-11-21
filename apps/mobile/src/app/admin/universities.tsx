import React from 'react';
import { cityName } from '@uniitalia/shared';
import { AdminList } from '../../components/admin/AdminList';
import { StaffGuard } from '../../components/admin/EditScreen';

export default function AdminUniversities() {
  return (
    <StaffGuard title="Университеты">
      <AdminList
        title="Университеты"
        table="universities"
        select="id, official_name, name_ru, city, slug, status, verification_status"
        order="official_name"
        searchText={(r) => `${r.official_name} ${r.name_ru ?? ''} ${cityName(String(r.city))} ${r.slug}`}
        renderTitle={(r) => String(r.name_ru || r.official_name)}
        renderSubtitle={(r) => `${r.official_name} · ${cityName(String(r.city))}`}
        itemPath="/admin/university/[id]"
        newLabel="Добавить университет"
      />
    </StaffGuard>
  );
}
