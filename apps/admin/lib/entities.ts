import { CITIES, FIELDS, LANGUAGES, LEVELS, REGIONS } from '@uniitalia/shared';
import type { FieldDef } from '@/components/EntityForm';

const SLUG = '[a-z0-9]+(-[a-z0-9]+)*';

export const universityFields: FieldDef[] = [
  { name: 'official_name', label: 'Официальное название', type: 'text', required: true },
  { name: 'slug', label: 'Slug (для ссылок)', type: 'text', required: true, pattern: SLUG, hint: 'латиница, цифры и дефис: university-of-pisa' },
  { name: 'name_ru', label: 'Название на русском', type: 'text' },
  { name: 'name_en', label: 'Название на английском', type: 'text' },
  { name: 'city', label: 'Город', type: 'select', required: true, options: CITIES.map((c) => ({ value: c.id, label: `${c.ru} (${c.it})` })) },
  { name: 'region', label: 'Регион', type: 'select', required: true, options: Object.entries(REGIONS).map(([v, r]) => ({ value: v, label: r.ru })) },
  { name: 'public_private', label: 'Тип', type: 'select', required: true, options: [{ value: 'public', label: 'Государственный' }, { value: 'private', label: 'Частный' }] },
  { name: 'website', label: 'Официальный сайт', type: 'url' },
  { name: 'address', label: 'Адрес', type: 'text' },
  { name: 'logo_url', label: 'Логотип (URL, только с правом использования)', type: 'url' },
  { name: 'image_url', label: 'Фото (URL, только с правом использования)', type: 'url' },
  { name: 'description_ru', label: 'Описание на русском', type: 'textarea' },
  { name: 'featured', label: 'Показывать в «Популярных университетах»', type: 'checkbox' },
  { name: 'is_demo', label: 'Демонстрационная запись', type: 'checkbox' },
];

export const universityDefaults = { public_private: 'public', status: 'draft', verification_status: 'unverified', featured: false, is_demo: false };

export function programFields(universities: { id: string; official_name: string }[]): FieldDef[] {
  return [
    { name: 'title_original', label: 'Название в оригинале', type: 'text', required: true },
    { name: 'slug', label: 'Slug (для ссылок)', type: 'text', required: true, pattern: SLUG },
    { name: 'title_ru', label: 'Русское пояснение', type: 'text' },
    { name: 'university_id', label: 'Университет', type: 'select', required: true, options: universities.map((u) => ({ value: u.id, label: u.official_name })) },
    { name: 'level', label: 'Уровень', type: 'select', required: true, options: Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: `${l.ru} (${l.it})` })) },
    { name: 'language', label: 'Язык обучения', type: 'select', required: true, options: Object.entries(LANGUAGES).map(([v, l]) => ({ value: v, label: l })) },
    { name: 'duration_years', label: 'Длительность, лет', type: 'number' },
    { name: 'ects', label: 'ECTS', type: 'number' },
    { name: 'program_url', label: 'Страница программы', type: 'url' },
    { name: 'curriculum_url', label: 'Учебный план (curriculum)', type: 'url' },
    { name: 'description_ru', label: 'Описание на русском', type: 'textarea' },
    { name: 'fields', label: 'Направления', type: 'multiselect', options: FIELDS.map((f) => ({ value: f.id, label: f.ru })) },
    { name: 'is_demo', label: 'Демонстрационная запись', type: 'checkbox' },
  ];
}

export const programDefaults = { level: 'bachelor', language: 'en', status: 'draft', verification_status: 'unverified', fields: [], is_demo: false };

export const STATUS_RU: Record<string, string> = { draft: 'Черновик', published: 'Опубликовано', archived: 'В архиве' };
export const VERIFICATION_RU: Record<string, string> = { verified: 'Проверено', needs_review: 'Требует проверки', unverified: 'Не проверено', outdated: 'Устарело' };
