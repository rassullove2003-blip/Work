'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { cityName, filterUniversities, type University } from '@uniitalia/shared';
import { errorRu, supabase } from '@/lib/supabase';
import { STATUS_RU, VERIFICATION_RU } from '@/lib/entities';

export default function UniversitiesList() {
  const [rows, setRows] = useState<(University & { status: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase!.from('universities').select('*').order('official_name').then(({ data, error }) => {
      if (error) setError(errorRu(error.message));
      setRows((data ?? []) as (University & { status: string })[]);
    });
  }, []);
  const list = useMemo(
    () => (rows ? (filterUniversities(rows, { query: q, cities: [], regions: [], types: [] }) as typeof rows) : []),
    [rows, q],
  );
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Университеты</h1>
        <input placeholder="Поиск по названию или городу" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link className="btn primary" href="/universities/new">+ Добавить</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {!rows ? <p className="muted">Загрузка…</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Название</th><th>Город</th><th>Тип</th><th>Публикация</th><th>Проверка</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/universities/${u.id}`}>{u.official_name}</Link>{u.is_demo && <span className="badge"> демо</span>}<br /><span className="muted small">{u.name_ru}</span></td>
                  <td>{cityName(u.city)}</td>
                  <td>{u.public_private === 'public' ? 'Гос.' : 'Частный'}</td>
                  <td><span className={`badge ${u.status}`}>{STATUS_RU[u.status]}</span></td>
                  <td><span className={`badge ${u.verification_status}`}>{VERIFICATION_RU[u.verification_status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
