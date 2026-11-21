import { APPLICANT_CATEGORIES, CITIES, FIELDS, LANGUAGES, LEVELS, REGIONS } from '@uniitalia/shared';
import type { FieldDef, Option } from './form';

const SLUG_HINT = 'Адрес страницы: латиница, цифры и дефис, например university-of-pisa.';

export const universityFields: FieldDef[] = [
  { name: 'official_name', label: 'Официальное название', type: 'text', required: true, placeholder: 'Università di Pisa' },
  { name: 'slug', label: 'Slug (адрес страницы)', type: 'text', required: true, hint: SLUG_HINT },
  { name: 'name_ru', label: 'Название на русском', type: 'text' },
  { name: 'name_en', label: 'Название на английском', type: 'text' },
  { name: 'city', label: 'Город', type: 'select', required: true, searchable: true, options: CITIES.map((c) => ({ value: c.id, label: c.ru, hint: c.it })) },
  { name: 'region', label: 'Регион', type: 'select', required: true, searchable: true, options: Object.entries(REGIONS).map(([v, r]) => ({ value: v, label: r.ru, hint: r.it })) },
  { name: 'public_private', label: 'Тип', type: 'select', required: true, options: [{ value: 'public', label: 'Государственный' }, { value: 'private', label: 'Частный' }] },
  { name: 'website', label: 'Официальный сайт', type: 'url', placeholder: 'https://…' },
  { name: 'address', label: 'Адрес', type: 'text' },
  { name: 'logo_url', label: 'Логотип', type: 'image', folder: 'logos', hint: 'Только изображения, на которые есть право использования.' },
  { name: 'image_url', label: 'Фотография', type: 'image', folder: 'photos', hint: 'Только изображения, на которые есть право использования.' },
  { name: 'description_ru', label: 'Описание на русском', type: 'multiline' },
  { name: 'featured', label: 'Показывать в «Популярных университетах»', type: 'toggle' },
  { name: 'is_demo', label: 'Демонстрационная запись', type: 'toggle', hint: 'Снимите, когда данные сверены с официальным сайтом.' },
  { name: 'academic_year', label: 'Учебный год данных', type: 'year' },
];

export const universityDefaults = { public_private: 'public', status: 'draft', verification_status: 'unverified', featured: false, is_demo: false };

export function programFields(universities: Option[]): FieldDef[] {
  return [
    { name: 'title_original', label: 'Название в оригинале', type: 'text', required: true },
    { name: 'slug', label: 'Slug (адрес страницы)', type: 'text', required: true, hint: SLUG_HINT },
    { name: 'title_ru', label: 'Русское пояснение', type: 'text' },
    { name: 'university_id', label: 'Университет', type: 'select', required: true, searchable: true, options: universities },
    { name: 'level', label: 'Уровень', type: 'select', required: true, options: Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l.ru })) },
    { name: 'language', label: 'Язык обучения', type: 'select', required: true, options: Object.entries(LANGUAGES).map(([v, l]) => ({ value: v, label: l })) },
    { name: 'duration_years', label: 'Длительность, лет', type: 'number' },
    { name: 'ects', label: 'ECTS', type: 'number' },
    { name: 'program_url', label: 'Страница программы', type: 'url', placeholder: 'https://…' },
    { name: 'curriculum_url', label: 'Учебный план', type: 'url', placeholder: 'https://…' },
    { name: 'description_ru', label: 'Описание на русском', type: 'multiline' },
    { name: 'fields', label: 'Направления', type: 'multiselect', options: FIELDS.map((f) => ({ value: f.id, label: f.ru })) },
    { name: 'is_demo', label: 'Демонстрационная запись', type: 'toggle' },
    { name: 'academic_year', label: 'Учебный год данных', type: 'year' },
  ];
}

export const programDefaults = { level: 'bachelor', language: 'en', status: 'draft', verification_status: 'unverified', fields: [], is_demo: false };

export function deadlineFields(programs: Option[], scholarships: Option[]): FieldDef[] {
  return [
    { name: 'title_ru', label: 'Название срока', type: 'text', required: true, placeholder: 'Подача заявок через Universitaly' },
    { name: 'program_id', label: 'Программа', type: 'select', searchable: true, options: programs, hint: 'Укажите программу или стипендию.' },
    { name: 'scholarship_id', label: 'Стипендия', type: 'select', searchable: true, options: scholarships },
    { name: 'academic_year', label: 'Учебный год', type: 'year', required: true },
    {
      name: 'applicant_category',
      label: 'Для кого',
      type: 'select',
      required: true,
      options: Object.entries(APPLICANT_CATEGORIES).map(([v, l]) => ({ value: v, label: l })),
    },
    { name: 'starts_at', label: 'Дата начала', type: 'date' },
    { name: 'ends_at', label: 'Крайний срок', type: 'date', required: true },
  ];
}

export const deadlineDefaults = { applicant_category: 'all', status: 'draft', verification_status: 'unverified', timezone: 'Europe/Rome' };

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
