import React from 'react';
import { AdminList } from '../../components/admin/AdminList';
import { StaffGuard } from '../../components/admin/EditScreen';

export default function AdminRules() {
  return (
    <StaffGuard title="Общие правила">
      <AdminList
        title="Общие правила"
        table="admission_rules"
        select="id, section, body_ru, sort_order, status, verification_status"
        order="sort_order"
        searchText={(r) => `${r.section} ${r.body_ru}`}
        renderTitle={(r) => String(r.section)}
        renderSubtitle={(r) => String(r.body_ru).slice(0, 90) + '…'}
        itemPath="/admin/rule/[id]"
        newLabel="Добавить правило"
      />
    </StaffGuard>
  );
}
