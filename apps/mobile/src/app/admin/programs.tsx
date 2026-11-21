import React from 'react';
import { LEVELS, type StudyLevel } from '@uniitalia/shared';
import { AdminList } from '../../components/admin/AdminList';
import { StaffGuard } from '../../components/admin/EditScreen';

export default function AdminPrograms() {
  return (
    <StaffGuard title="Программы">
      <AdminList
        title="Программы"
        table="degree_programs"
        select="id, title_original, title_ru, level, slug, status, verification_status, university:universities(official_name, name_ru)"
        order="title_original"
        searchText={(r) => {
          const u = r.university as { official_name: string; name_ru: string | null } | null;
          return `${r.title_original} ${r.title_ru ?? ''} ${u?.official_name ?? ''} ${u?.name_ru ?? ''}`;
        }}
        renderTitle={(r) => String(r.title_original)}
        renderSubtitle={(r) => {
          const u = r.university as { official_name: string; name_ru: string | null } | null;
          return `${LEVELS[r.level as StudyLevel]?.ru ?? ''} · ${u?.name_ru ?? u?.official_name ?? ''}`;
        }}
        itemPath="/admin/program/[id]"
        newLabel="Добавить программу"
      />
    </StaffGuard>
  );
}
