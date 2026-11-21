/**
 * Общие типы UniItalia. Используются мобильным приложением, админ-панелью
 * и генератором seed.sql. Поля совпадают с колонками в supabase/migrations.
 */

export type VerificationStatus = 'verified' | 'needs_review' | 'unverified' | 'outdated';

export type PublicPrivate = 'public' | 'private';

export type StudyLevel = 'foundation' | 'bachelor' | 'master' | 'single_cycle';

export type TeachingLanguage = 'en' | 'it' | 'en_it';

/** Метаданные проверки, обязательные для каждого изменяемого факта. */
export interface VerificationMeta {
  verification_status: VerificationStatus;
  verified_at: string | null;
  source_url: string | null;
  academic_year: string | null;
}

export interface University extends VerificationMeta {
  id: string;
  slug: string;
  official_name: string;
  name_en: string | null;
  name_ru: string | null;
  city: string;
  region: string;
  public_private: PublicPrivate;
  website: string | null;
  address: string | null;
  description_ru: string | null;
  logo_url: string | null;
  image_url: string | null;
  featured: boolean;
  is_demo: boolean;
}

export interface Program extends VerificationMeta {
  id: string;
  slug: string;
  university_id: string;
  title_original: string;
  title_ru: string | null;
  level: StudyLevel;
  fields: string[];
  language: TeachingLanguage;
  duration_years: number | null;
  ects: number | null;
  /** Стоимость в евро за год; null = информация уточняется. */
  tuition_fee_min_eur: number | null;
  tuition_fee_max_eur: number | null;
  curriculum_url: string | null;
  program_url: string | null;
  description_ru: string | null;
  is_demo: boolean;
}

export interface Scholarship extends VerificationMeta {
  id: string;
  slug: string;
  organization: string;
  name_ru: string;
  region: string;
  website: string | null;
  description_ru: string | null;
  university_ids: string[];
  is_demo: boolean;
}

export interface ProgramWithUniversity extends Program {
  university: University;
}

export type ApplicantCategory = 'all' | 'eu' | 'non_eu_in_italy' | 'non_eu_abroad';

export interface Deadline {
  id: string;
  program_id: string | null;
  scholarship_id: string | null;
  academic_year: string;
  applicant_category: ApplicantCategory;
  title_ru: string;
  starts_at: string | null;
  ends_at: string;
  timezone: string;
  verification_status: VerificationStatus;
  verified_at: string | null;
  source_url: string | null;
}

export type StaffRole = 'admin' | 'curator';

export type RequirementType = 'language' | 'diploma' | 'exam' | 'document' | 'other';

export interface Requirement {
  id: string;
  program_id: string;
  academic_year: string;
  applicant_category: ApplicantCategory;
  requirement_type: RequirementType;
  title_ru: string;
  details_ru: string | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
  source_url: string | null;
}
