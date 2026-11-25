import React from 'react';
import { AdminList } from '../../components/admin/AdminList';
import { StaffGuard } from '../../components/admin/EditScreen';

export default function AdminVisaSections() {
  return (
    <StaffGuard title="Виза: шаги">
      <AdminList
        title="Виза: шаги"
        table="visa_sections"
        select="id, title_ru, body_ru, sort_order, status, verification_status"
        order="sort_order"
        searchText={(r) => `${r.title_ru} ${r.body_ru}`}
        renderTitle={(r) => String(r.title_ru)}
        renderSubtitle={(r) => String(r.body_ru).slice(0, 90) + '…'}
        itemPath="/admin/visa-section/[id]"
        newLabel="Добавить шаг"
      />
    </StaffGuard>
  );
}
