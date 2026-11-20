'use client';
import { useCallback, useEffect, useState } from 'react';
import { errorRu, supabase } from '@/lib/supabase';
import { STATUS_RU, VERIFICATION_RU } from '@/lib/entities';

type Edition = {
  id: string; academic_year: string; applicant_category: string; tuition_fee_min_eur: number | null; tuition_fee_max_eur: number | null;
  fee_notes_ru: string | null; status: string; verification_status: string; source_url: string | null; verified_at: string | null;
};
const CATEGORY_RU: Record<string, string> = { all: 'Все', eu: 'EU', non_eu_in_italy: 'Non-EU в Италии', non_eu_abroad: 'Non-EU за рубежом' };
const empty = { academic_year: '', applicant_category: 'all', tuition_fee_min_eur: '', tuition_fee_max_eur: '', fee_notes_ru: '', source_url: '', verified_at: '', status: 'draft', verification_status: 'unverified' };

/** Стоимость обучения по учебным годам (временные версии данных). */
export function EditionsPanel({ programId }: { programId: string }) {
  const [rows, setRows] = useState<Edition[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    supabase!.from('program_editions').select('*').eq('program_id', programId).order('academic_year', { ascending: false }).then(({ data, error }) => {
      if (error) setError(errorRu(error.message));
      setRows((data ?? []) as Edition[]);
    });
  }, [programId]);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = (v: string) => (v.trim() === '' ? null : Number(v));
    const { error } = await supabase!.from('program_editions').insert({
      program_id: programId,
      academic_year: form.academic_year.trim(),
      applicant_category: form.applicant_category,
      tuition_fee_min_eur: n(form.tuition_fee_min_eur),
      tuition_fee_max_eur: n(form.tuition_fee_max_eur),
      fee_notes_ru: form.fee_notes_ru.trim() || null,
      source_url: form.source_url.trim() || null,
      verified_at: form.verified_at ? new Date(`${form.verified_at}T12:00:00Z`).toISOString() : null,
      status: form.status,
      verification_status: form.verification_status,
    });
    if (error) return setError(errorRu(error.message));
    setForm({ ...empty });
    load();
  };
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h2 style={{ marginTop: 0 }}>Стоимость по учебным годам</h2>
      <p className="muted small">В приложении показывается последний опубликованный год (категория «Все» или «Non-EU за рубежом»).</p>
      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr><th>Год</th><th>Категория</th><th>Стоимость, €</th><th>Публикация</th><th>Проверка</th><th>Источник</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.academic_year}</td>
                  <td>{CATEGORY_RU[r.applicant_category]}</td>
                  <td>{r.tuition_fee_min_eur ?? '—'}{r.tuition_fee_max_eur != null && r.tuition_fee_max_eur !== r.tuition_fee_min_eur ? ` – ${r.tuition_fee_max_eur}` : ''}</td>
                  <td><span className={`badge ${r.status}`}>{STATUS_RU[r.status]}</span></td>
                  <td><span className={`badge ${r.verification_status}`}>{VERIFICATION_RU[r.verification_status]}</span></td>
                  <td>{r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer">ссылка</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} className="grid">
        <label>Учебный год *<input required pattern="\d{4}/\d{4}" placeholder="2026/2027" value={form.academic_year} onChange={set('academic_year')} /></label>
        <label>Категория<select value={form.applicant_category} onChange={set('applicant_category')}>{Object.entries(CATEGORY_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Стоимость от, €<input type="number" min={0} value={form.tuition_fee_min_eur} onChange={set('tuition_fee_min_eur')} /></label>
        <label>Стоимость до, €<input type="number" min={0} value={form.tuition_fee_max_eur} onChange={set('tuition_fee_max_eur')} /></label>
        <label>Примечание<input value={form.fee_notes_ru} onChange={set('fee_notes_ru')} placeholder="зависит от ISEE" /></label>
        <label>Источник<input type="url" value={form.source_url} onChange={set('source_url')} /></label>
        <label>Дата проверки<input type="date" value={form.verified_at} onChange={set('verified_at')} /></label>
        <label>Публикация<select value={form.status} onChange={set('status')}><option value="draft">Черновик</option><option value="published">Опубликовано</option></select></label>
        <label>Проверка<select value={form.verification_status} onChange={set('verification_status')}>{Object.entries(VERIFICATION_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div className="wide">
          {error && <p className="error">{error}</p>}
          <button className="btn primary">Добавить год</button>
        </div>
      </form>
    </div>
  );
}
