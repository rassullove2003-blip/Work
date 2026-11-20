'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Stats = Record<string, number | null>;

async function count(table: string, filter?: [string, string]) {
  let q = supabase!.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count, error } = await q;
  return error ? null : count;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    (async () => {
      const entries = await Promise.all([
        ['Университеты', await count('universities')],
        ['Опубликовано вузов', await count('universities', ['status', 'published'])],
        ['Программы', await count('degree_programs')],
        ['Проверенные программы', await count('degree_programs', ['verification_status', 'verified'])],
        ['Стипендии', await count('scholarships')],
        ['Новые заявки', await count('consultation_requests', ['status', 'new'])],
      ] as const);
      setStats(Object.fromEntries(entries));
    })();
  }, []);
  return (
    <>
      <h1>Обзор</h1>
      <div className="stats">
        {stats
          ? Object.entries(stats).map(([k, v]) => (
              <div key={k} className="card stat">
                <b>{v ?? '—'}</b>
                <span className="muted">{k}</span>
              </div>
            ))
          : <p className="muted">Загрузка…</p>}
      </div>
      <div className="row">
        <Link className="btn primary" href="/universities/new">+ Университет</Link>
        <Link className="btn primary" href="/programs/new">+ Программа</Link>
      </div>
      <h2>Правила публикации</h2>
      <ul className="muted">
        <li>Публикуйте только данные с официальной ссылкой-источником и учебным годом.</li>
        <li>Статус «Проверено» требует источник и дату проверки — без них база не сохранит запись.</li>
        <li>Все изменения записываются в журнал (audit_logs) с автором и временем.</li>
        <li>Удалять записи может только администратор.</li>
      </ul>
    </>
  );
}
