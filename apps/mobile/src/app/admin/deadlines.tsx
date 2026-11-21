import React from 'react';
import { AdminList } from '../../components/admin/AdminList';
import { StaffGuard } from '../../components/admin/EditScreen';

export default function AdminDeadlines() {
  return (
    <StaffGuard title="Дедлайны">
      <AdminList
        title="Дедлайны"
        table="admission_deadlines"
        select="id, title_ru, ends_at, academic_year, status, verification_status, program:degree_programs(title_original), scholarship:scholarships(name_ru)"
        order="ends_at"
        searchText={(r) => {
          const p = r.program as { title_original: string } | null;
          const s = r.scholarship as { name_ru: string } | null;
          return `${r.title_ru} ${p?.title_original ?? ''} ${s?.name_ru ?? ''}`;
        }}
        renderTitle={(r) => `${String(r.ends_at).slice(0, 10)} · ${r.title_ru}`}
        renderSubtitle={(r) => {
          const p = r.program as { title_original: string } | null;
          const s = r.scholarship as { name_ru: string } | null;
          return `${p?.title_original ?? s?.name_ru ?? ''} · ${r.academic_year}`;
        }}
        itemPath="/admin/deadline/[id]"
        newLabel="Добавить дедлайн"
      />
    </StaffGuard>
  );
}
