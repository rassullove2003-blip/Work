import React from 'react';
import { AdminList } from '../../components/admin/AdminList';
import { StaffGuard } from '../../components/admin/EditScreen';

export default function AdminVisaMissions() {
  return (
    <StaffGuard title="Виза: посольства">
      <AdminList
        title="Виза: посольства"
        table="visa_missions"
        select="id, country_ru, mission_name, sort_order, status, verification_status"
        order="sort_order"
        searchText={(r) => `${r.country_ru} ${r.mission_name}`}
        renderTitle={(r) => `${r.country_ru} · ${r.mission_name}`}
        itemPath="/admin/visa-mission/[id]"
        newLabel="Добавить посольство"
      />
    </StaffGuard>
  );
}
