'use client';
import { useEffect, useState } from 'react';
import { errorRu, supabase } from '@/lib/supabase';

type Req = { id: string; name: string; country: string | null; contact: string; education_level: string | null; field: string | null; comment: string | null; status: string; created_at: string };
const STATUS: Record<string, string> = { new: 'Новая', in_progress: 'В работе', closed: 'Закрыта' };

export default function Consultations() {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => supabase!.from('consultation_requests').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
    if (error) setError(errorRu(error.message));
    setRows((data ?? []) as Req[]);
  });
  useEffect(() => { load(); }, []);
  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase!.from('consultation_requests').update({ status }).eq('id', id);
    if (error) setError(errorRu(error.message)); else load();
  };
  return (
    <>
      <h1>Заявки на консультацию</h1>
      <p className="muted">Заявка не означает оплату или гарантированное сопровождение. Форма в мобильном приложении появится на следующем этапе.</p>
      {error && <p className="error">{error}</p>}
      {!rows ? <p className="muted">Загрузка…</p> : rows.length === 0 ? <p className="muted">Заявок пока нет.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Дата</th><th>Имя</th><th>Контакт</th><th>Страна / уровень</th><th>Комментарий</th><th>Статус</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString('ru-RU')}</td>
                  <td>{r.name}</td>
                  <td>{r.contact}</td>
                  <td>{r.country ?? '—'} / {r.education_level ?? '—'}</td>
                  <td>{r.comment ?? '—'}</td>
                  <td><select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
