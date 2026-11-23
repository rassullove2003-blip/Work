import type { ApplicationStatus } from './types';

/** Этапы поступления в порядке прохождения (раздел 10 ТЗ). */
export const APPLICATION_STATUSES: { id: ApplicationStatus; ru: string }[] = [
  { id: 'choosing', ru: 'Выбираю университет' },
  { id: 'collecting_documents', ru: 'Собираю документы' },
  { id: 'documents_ready', ru: 'Документы готовы' },
  { id: 'exam_registered', ru: 'Зарегистрирован на экзамен' },
  { id: 'exam_passed', ru: 'Экзамен пройден' },
  { id: 'application_sent', ru: 'Заявка отправлена' },
  { id: 'awaiting_decision', ru: 'Ожидаю решения' },
  { id: 'admitted', ru: 'Получено зачисление' },
  { id: 'visa_preparation', ru: 'Подготовка к визе' },
  { id: 'visa_received', ru: 'Виза получена' },
  { id: 'completed', ru: 'Поступление завершено' },
];

export const APPLICATION_STATUS_LABELS = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s.id, s.ru])) as Record<ApplicationStatus, string>;

/** Процент пройденного пути: первый этап — 0 %, последний — 100 %. */
export function applicationProgress(status: ApplicationStatus): number {
  const i = APPLICATION_STATUSES.findIndex((s) => s.id === status);
  return i < 0 ? 0 : Math.round((i / (APPLICATION_STATUSES.length - 1)) * 100);
}

/** Общий чек-лист, который добавляется к новой заявке. Студент может удалить ненужное. */
export const DEFAULT_APPLICATION_TASKS: string[] = [
  'Проверить требования программы на официальном сайте',
  'Подготовить документы об образовании и их перевод',
  'Подготовить языковой сертификат',
  'Подать заявку в университет',
  'Пройти предзачисление на Universitaly (для граждан не-EU)',
  'Подать заявку на стипендию DSU, если нужна',
  'Записаться на подачу документов на учебную визу',
];

/** Учебный год по умолчанию для новой заявки: ближайший набор. */
export function defaultIntakeYear(now = new Date()): string {
  const y = now.getFullYear() + (now.getMonth() >= 8 ? 1 : 0);
  return `${y}/${y + 1}`;
}
