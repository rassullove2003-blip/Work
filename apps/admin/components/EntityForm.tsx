'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorRu, supabase } from '@/lib/supabase';
import { useStaff } from './AdminShell';

export type FieldDef =
  | { name: string; label: string; type: 'text' | 'url' | 'textarea' | 'number' | 'date'; required?: boolean; hint?: string; pattern?: string }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[]; required?: boolean; hint?: string }
  | { name: string; label: string; type: 'multiselect'; options: { value: string; label: string }[]; hint?: string }
  | { name: string; label: string; type: 'checkbox'; hint?: string };

/** Поля проверки, обязательные для каждого изменяемого факта (раздел 15 ТЗ). */
export const VERIFICATION_FIELDS: FieldDef[] = [
  {
    name: 'status',
    label: 'Публикация',
    type: 'select',
    required: true,
    options: [
      { value: 'draft', label: 'Черновик (не виден в приложении)' },
      { value: 'published', label: 'Опубликовано' },
      { value: 'archived', label: 'В архиве' },
    ],
  },
  {
    name: 'verification_status',
    label: 'Статус проверки',
    type: 'select',
    required: true,
    options: [
      { value: 'unverified', label: 'Не проверено' },
      { value: 'needs_review', label: 'Требует проверки' },
      { value: 'verified', label: 'Проверено' },
      { value: 'outdated', label: 'Устарело' },
    ],
    hint: '«Проверено» можно поставить только с источником и датой проверки.',
  },
  { name: 'source_url', label: 'Источник (официальная страница)', type: 'url' },
  { name: 'verified_at', label: 'Дата проверки', type: 'date' },
  { name: 'academic_year', label: 'Учебный год', type: 'text', pattern: '\\d{4}/\\d{4}', hint: 'Формат 2026/2027' },
];

type Row = Record<string, unknown>;

function toInput(f: FieldDef, v: unknown): unknown {
  if (f.type === 'date' && typeof v === 'string') return v.slice(0, 10);
  if (f.type === 'checkbox') return Boolean(v);
  if (f.type === 'multiselect') return Array.isArray(v) ? v : [];
  return v ?? '';
}

function toDb(f: FieldDef, v: unknown): unknown {
  if (f.type === 'checkbox') return Boolean(v);
  if (f.type === 'multiselect') return v;
  if (v === '' || v === undefined) return null;
  if (f.type === 'number') return Number(v);
  if (f.type === 'date') return new Date(`${v}T12:00:00Z`).toISOString();
  return typeof v === 'string' ? v.trim() : v;
}

export function EntityForm({
  table,
  id,
  fields,
  defaults,
  listHref,
  title,
}: {
  table: string;
  id: string; // 'new' для создания
  fields: FieldDef[];
  defaults: Row;
  listHref: string;
  title: (row: Row) => string;
}) {
  const router = useRouter();
  const { role } = useStaff();
  const isNew = id === 'new';
  const all = [...fields, ...VERIFICATION_FIELDS];
  const [row, setRow] = useState<Row | null>(isNew ? Object.fromEntries(all.map((f) => [f.name, toInput(f, defaults[f.name])])) : null);
  const [meta, setMeta] = useState<{ updated_at?: string; last_edited_by?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    supabase!
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setError(errorRu(error.message));
        if (!data) return setError('Запись не найдена.');
        setRow(Object.fromEntries(all.map((f) => [f.name, toInput(f, data[f.name])])));
        setMeta({ updated_at: data.updated_at, last_edited_by: data.last_edited_by });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, table]);

  if (!row) return <p className="muted">{error ?? 'Загрузка…'}</p>;

  const set = (name: string, v: unknown) => {
    setSaved(false);
    setRow({ ...row, [name]: v });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = Object.fromEntries(all.map((f) => [f.name, toDb(f, row[f.name])]));
    const res = isNew
      ? await supabase!.from(table).insert(payload).select('id').single()
      : await supabase!.from(table).update(payload).eq('id', id).select('id').single();
    setBusy(false);
    if (res.error) return setError(errorRu(res.error.message));
    setSaved(true);
    if (isNew) router.replace(`${listHref}/${res.data.id}`);
  };

  const remove = async () => {
    if (!confirm('Удалить запись безвозвратно? Связанные данные тоже будут удалены.')) return;
    const { error } = await supabase!.from(table).delete().eq('id', id);
    if (error) return setError(errorRu(error.message));
    router.replace(listHref);
  };

  const publishingUnverified = row.status === 'published' && row.verification_status !== 'verified';

  return (
    <form onSubmit={save} className="card">
      <div className="row between">
        <h1>{isNew ? 'Новая запись' : title(row)}</h1>
        <a className="btn small" href={listHref}>
          ← К списку
        </a>
      </div>
      <div className="grid">
        {fields.map((f) => (
          <Field key={f.name} f={f} value={row[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
      </div>
      <h2>Проверка и публикация</h2>
      <div className="grid">
        {VERIFICATION_FIELDS.map((f) => (
          <Field key={f.name} f={f} value={row[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
      </div>
      {publishingUnverified && (
        <p className="warning">
          Запись будет опубликована со статусом «{String(row.verification_status)}». В приложении она будет помечена как
          непроверенная — пользователи увидят предупреждение.
        </p>
      )}
      {meta?.updated_at && (
        <p className="muted small">
          Изменено: {new Date(meta.updated_at).toLocaleString('ru-RU')}
          {meta.last_edited_by ? ` · редактор ${meta.last_edited_by.slice(0, 8)}…` : ''}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Сохранено</p>}
      <div className="row">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
        {!isNew && role === 'admin' && (
          <button type="button" className="btn danger" onClick={remove}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const label = (
    <span>
      {f.label}
      {'required' in f && f.required ? ' *' : ''}
    </span>
  );
  const hint = f.hint ? <small className="muted">{f.hint}</small> : null;
  switch (f.type) {
    case 'textarea':
      return (
        <label className="wide">
          {label}
          <textarea rows={4} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </label>
      );
    case 'select':
      return (
        <label>
          {label}
          <select required={f.required} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
            {!f.required && <option value="">—</option>}
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </label>
      );
    case 'multiselect': {
      const list = (value as string[]) ?? [];
      return (
        <fieldset className="wide">
          <legend>{f.label}</legend>
          <div className="checks">
            {f.options.map((o) => (
              <label key={o.value} className="check">
                <input
                  type="checkbox"
                  checked={list.includes(o.value)}
                  onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))}
                />
                {o.label}
              </label>
            ))}
          </div>
          {hint}
        </fieldset>
      );
    }
    case 'checkbox':
      return (
        <label className="check">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {f.label}
          {hint}
        </label>
      );
    default:
      return (
        <label>
          {label}
          <input
            type={f.type}
            required={f.required}
            pattern={'pattern' in f ? f.pattern : undefined}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
          {hint}
        </label>
      );
  }
}
