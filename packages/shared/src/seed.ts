import universitiesRaw from '../data/universities.json';
import programsRaw from '../data/programs.json';
import scholarshipsRaw from '../data/scholarships.json';
import type { Program, Scholarship, StudyLevel, TeachingLanguage, University, PublicPrivate } from './types';
import { cityName, regionName } from './dictionaries';

/**
 * Демонстрационная база (seed). Названия, города, регионы, тип и официальные
 * сайты — реальные, но в этой версии НЕ сверены с первоисточником, поэтому
 * все записи помечены verification_status = 'unverified' и is_demo = true.
 * Стоимость, требования и дедлайны намеренно не заполнены (null), чтобы
 * интерфейс показывал «Информация уточняется», а не выдуманные цифры.
 */

const UNVERIFIED = {
  verification_status: 'unverified' as const,
  verified_at: null,
  source_url: null,
  academic_year: null,
};

export const seedUniversities: University[] = universitiesRaw.map((u) => ({
  ...UNVERIFIED,
  id: u.slug,
  slug: u.slug,
  official_name: u.official_name,
  name_en: u.name_en,
  name_ru: u.name_ru,
  city: u.city,
  region: u.region,
  public_private: u.public_private as PublicPrivate,
  website: u.website,
  source_url: u.website,
  address: null,
  description_ru: `${u.public_private === 'public' ? 'Государственный' : 'Частный'} университет, город ${cityName(u.city)} (${regionName(u.region)}). Подробная информация для иностранных студентов уточняется.`,
  logo_url: null,
  image_url: null,
  featured: u.featured,
  is_demo: true,
}));

export const seedPrograms: Program[] = programsRaw.map((p) => ({
  ...UNVERIFIED,
  id: p.slug,
  slug: p.slug,
  university_id: p.university,
  title_original: p.title_original,
  title_ru: p.title_ru,
  level: p.level as StudyLevel,
  fields: p.fields,
  language: p.language as TeachingLanguage,
  duration_years: p.duration_years,
  ects: p.ects,
  tuition_fee_min_eur: null,
  tuition_fee_max_eur: null,
  curriculum_url: null,
  program_url: null,
  description_ru: null,
  is_demo: true,
}));

export const seedScholarships: Scholarship[] = scholarshipsRaw.map((s) => ({
  ...UNVERIFIED,
  id: s.slug,
  slug: s.slug,
  organization: s.organization,
  name_ru: s.name_ru,
  region: s.region,
  website: s.website,
  source_url: s.website,
  description_ru:
    'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.',
  university_ids: s.universities,
  is_demo: true,
}));
