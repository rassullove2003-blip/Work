import { useEffect, useState } from 'react';
import type { VerificationMeta } from '@uniitalia/shared';
import type { IconName } from '../components/ui';
import { supabase } from './supabase';

export interface Rule extends VerificationMeta {
  id: string;
  sort_order: number;
  section: string;
  body_ru: string;
  extra_urls: string[];
}

/** Группы правил по ключевым словам раздела (новые разделы из админки попадут в «Другое»). */
export const RULE_GROUPS: { label: string; icon: IconName; words: string[] }[] = [
  { label: 'Образование и документы', icon: 'school-outline', words: ['образован', 'документ', 'магистратура'] },
  { label: 'Язык и тесты', icon: 'language-outline', words: ['язык', 'тест', 'cent', 'творческ'] },
  { label: 'Сроки и виза', icon: 'airplane-outline', words: ['дедлайн', 'дата', 'даты', 'виза', 'срок'] },
  { label: 'Стоимость и стипендии', icon: 'wallet-outline', words: ['стоимост', 'сбор', 'стипенд', 'плат'] },
];
export const OTHER_GROUP = 'Другое';

export function ruleGroup(section: string): string {
  const s = section.toLowerCase();
  return RULE_GROUPS.find((g) => g.words.some((w) => s.includes(w)))?.label ?? OTHER_GROUP;
}

let cache: Rule[] | null = null;

export async function loadRules(force = false): Promise<Rule[]> {
  if (cache && !force) return cache;
  if (!supabase) throw new Error('Правила доступны при подключении к серверу.');
  const { data, error } = await supabase
    .from('admission_rules')
    .select('id, sort_order, section, body_ru, source_url, extra_urls, academic_year, verification_status, verified_at')
    .eq('status', 'published')
    .order('sort_order');
  if (error) throw new Error('Не удалось загрузить правила. Проверьте интернет.');
  cache = (data ?? []) as Rule[];
  return cache;
}

/** Правила для главной: null — загрузка, [] — нет (или сервер недоступен). */
export function useRules(): Rule[] | null {
  const [rules, setRules] = useState<Rule[] | null>(cache);
  useEffect(() => {
    loadRules()
      .then(setRules)
      .catch(() => setRules([]));
  }, []);
  return rules;
}
