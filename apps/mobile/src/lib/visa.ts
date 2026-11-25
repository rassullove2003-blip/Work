import type { VerificationMeta } from '@uniitalia/shared';
import { supabase } from './supabase';

export interface VisaSection extends VerificationMeta {
  id: string;
  key: string | null;
  sort_order: number;
  title_ru: string;
  body_ru: string;
}

export interface VisaMission extends VerificationMeta {
  id: string;
  sort_order: number;
  country_code: string;
  country_ru: string;
  mission_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  jurisdiction_ru: string | null;
  visa_center_url: string | null;
}

/** Официальная анкета на национальную визу (МИД Италии). */
export const VISA_FORM_URL = 'https://vistoperitalia.esteri.it/files/public/moduli/it/Formulario_Visto_Nazionale.pdf';
/** Официальный опросник МИД Италии: какие документы и куда подавать. */
export const VISA_QUESTIONNAIRE_URL = 'https://vistoperitalia.esteri.it/';
/** Список визовых центров МИД Италии (дата документа — 03.04.2024). */
export const VISA_CENTERS_LIST_URL = 'https://vistoperitalia.esteri.it/files/public/moduli/it/fornitori_esterni_convenzionati_di_servizi_di_visto.pdf';

let cache: { sections: VisaSection[]; missions: VisaMission[] } | null = null;

export async function loadVisaGuide(force = false): Promise<{ sections: VisaSection[]; missions: VisaMission[] }> {
  if (cache && !force) return cache;
  if (!supabase) throw new Error('Раздел доступен при подключении к серверу.');
  const meta = 'academic_year, source_url, verified_at, verification_status';
  const [s, m] = await Promise.all([
    supabase.from('visa_sections').select(`id, key, sort_order, title_ru, body_ru, ${meta}`).eq('status', 'published').order('sort_order'),
    supabase
      .from('visa_missions')
      .select(`id, sort_order, country_code, country_ru, mission_name, address, phone, email, website, jurisdiction_ru, visa_center_url, ${meta}`)
      .eq('status', 'published')
      .order('sort_order'),
  ]);
  if (s.error || m.error) throw new Error('Не удалось загрузить раздел о визе. Проверьте интернет.');
  cache = { sections: (s.data ?? []) as VisaSection[], missions: (m.data ?? []) as VisaMission[] };
  return cache;
}

/** Страны в порядке списка (без повторов — у России два консульства). */
export function visaCountries(missions: VisaMission[]): { code: string; ru: string }[] {
  const seen = new Map<string, string>();
  for (const m of missions) if (!seen.has(m.country_code)) seen.set(m.country_code, m.country_ru);
  return [...seen].map(([code, ru]) => ({ code, ru }));
}
