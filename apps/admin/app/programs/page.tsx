'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LEVELS, normalize, type StudyLevel } from '@uniitalia/shared';
import { errorRu, supabase } from '@/lib/supabase';
import { STATUS_RU, VERIFICATION_RU } from '@/lib/entities';

type Row = { id: string; title_original: string; title_ru: string | null; level: StudyLevel; status: string; verification_status: string; is_demo: boolean; university: { official_name: string } | null };

export default function ProgramsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase!.from('degree_programs').select('id, title_original, title_ru, level, status, verification_status, is_demo, university:universities(official_name)').order('title_original').then(({ data, error }) => {
      if (error) setError(errorRu(error.message));
      setRows((data ?? []) as unknown as Row[]);
    });
  }, []);
  const list = useMemo(() => (rows ?? []).filter((r) => !q || normalize(`${r.title_original} ${r.title_ru ?? ''} ${r.university?.official_name ?? ''}`).includes(normalize(q))), [rows, q]);
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Программы</h1>
        <input placeholder="Поиск по названию или университету" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link className="btn primary" href="/programs/new">+ Добавить</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {!rows ? <p className="muted">Загрузка…</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Программа</th><th>Университет</th><th>Уровень</th><th>Публикация</th><th>Проверка</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/programs/${p.id}`}>{p.title_original}</Link>{p.is_demo && <span className="badge"> демо</span>}<br /><span className="muted small">{p.title_ru}</span></td>
                  <td>{p.university?.official_name}</td>
                  <td>{LEVELS[p.level]?.ru}</td>
                  <td><span className={`badge ${p.status}`}>{STATUS_RU[p.status]}</span></td>
                  <td><span className={`badge ${p.verification_status}`}>{VERIFICATION_RU[p.verification_status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
