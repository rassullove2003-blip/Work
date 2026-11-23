/** Документы студента: категории и статусы проверки (значения совпадают с базой). */

export type DocumentCategory =
  | 'passport' | 'school_certificate' | 'diploma' | 'transcript' | 'ielts' | 'italian_certificate' | 'motivation_letter'
  | 'recommendation' | 'cv' | 'portfolio' | 'cimea' | 'declaration_of_value' | 'universitaly' | 'financial'
  | 'scholarship' | 'visa' | 'other';

export const DOCUMENT_CATEGORIES: { id: DocumentCategory; ru: string }[] = [
  { id: 'passport', ru: 'Паспорт' },
  { id: 'school_certificate', ru: 'Аттестат' },
  { id: 'diploma', ru: 'Диплом' },
  { id: 'transcript', ru: 'Приложение с оценками' },
  { id: 'ielts', ru: 'Сертификат по английскому (IELTS/TOEFL)' },
  { id: 'italian_certificate', ru: 'Сертификат по итальянскому' },
  { id: 'motivation_letter', ru: 'Мотивационное письмо' },
  { id: 'recommendation', ru: 'Рекомендательное письмо' },
  { id: 'cv', ru: 'Резюме (CV)' },
  { id: 'portfolio', ru: 'Портфолио' },
  { id: 'cimea', ru: 'CIMEA' },
  { id: 'declaration_of_value', ru: 'Dichiarazione di valore' },
  { id: 'universitaly', ru: 'Universitaly' },
  { id: 'financial', ru: 'Финансовые документы' },
  { id: 'scholarship', ru: 'Документы для стипендии (ISEE и др.)' },
  { id: 'visa', ru: 'Документы для визы' },
  { id: 'other', ru: 'Другое' },
];

export const DOCUMENT_CATEGORY_LABELS = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.id, c.ru])) as Record<DocumentCategory, string>;

export type DocumentStatus = 'not_uploaded' | 'uploaded' | 'needs_translation' | 'check_apostille' | 'needs_changes' | 'ready';

/** Статусы, которые может поставить куратор (по порядку на экране). */
export const DOCUMENT_REVIEW_STATUSES: { id: DocumentStatus; ru: string; tone: 'info' | 'warning' | 'danger' | 'success' }[] = [
  { id: 'uploaded', ru: 'На проверке', tone: 'info' },
  { id: 'needs_changes', ru: 'Нужно исправить', tone: 'danger' },
  { id: 'needs_translation', ru: 'Нужен перевод', tone: 'warning' },
  { id: 'check_apostille', ru: 'Проверьте апостиль', tone: 'warning' },
  { id: 'ready', ru: 'Принят', tone: 'success' },
];

export function documentStatusInfo(status: string) {
  return DOCUMENT_REVIEW_STATUSES.find((s) => s.id === status) ?? { id: status as DocumentStatus, ru: 'Не загружен', tone: 'info' as const };
}

/** Допустимые файлы: как в хранилище (до 10 МБ). */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];
export const CHAT_MIME_TYPES = [
  ...DOCUMENT_MIME_TYPES,
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function formatBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

/** Безопасное имя файла для пути в хранилище (латиница, цифры, точка, дефис). */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'file';
  return ext ? `${base}.${ext}` : base;
}
