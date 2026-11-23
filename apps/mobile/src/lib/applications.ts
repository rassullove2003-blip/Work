import { APPLICANT_CATEGORIES, DEFAULT_APPLICATION_TASKS, type ApplicationStatus, type Deadline } from '@uniitalia/shared';
import { supabase } from './supabase';

export interface Application {
  id: string;
  user_id: string;
  program_id: string;
  academic_year: string | null;
  status: ApplicationStatus;
  notes: string | null;
  curator_comment: string | null;
  curator_comment_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationTask {
  id: string;
  application_id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  created_at: string;
}

export interface ApplicationEvent {
  id: number;
  status: ApplicationStatus;
  by_staff: boolean;
  created_at: string;
}

/** Строка списка заявок для сотрудников (RPC staff_applications). */
export interface StaffApplicationRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  country: string | null;
  citizenship: string | null;
  program_slug: string;
  program_title: string;
  university_name: string;
  academic_year: string | null;
  status: ApplicationStatus;
  curator_comment: string | null;
  updated_at: string;
  open_tasks: number;
}

function db() {
  if (!supabase) throw new Error('Сервер не подключён');
  return supabase;
}

function fail(e: { message: string } | null, text: string): void {
  if (!e) return;
  const m = e.message.toLowerCase();
  if (m.includes('duplicate key')) throw new Error('Эта программа уже есть в ваших поступлениях на этот учебный год.');
  if (m.includes('row-level security') || m.includes('permission')) throw new Error('Недостаточно прав.');
  if (m.includes('network') || m.includes('fetch')) throw new Error('Нет соединения с сервером. Проверьте интернет.');
  throw new Error(`${text}: ${e.message}`);
}

export async function listMyApplications(userId: string): Promise<{ apps: Application[]; tasks: ApplicationTask[] }> {
  const [a, t] = await Promise.all([
    db().from('student_applications').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    db().from('application_tasks').select('id, application_id, title, due_date, done, created_at').eq('user_id', userId),
  ]);
  fail(a.error, 'Не удалось загрузить поступления');
  fail(t.error, 'Не удалось загрузить задачи');
  return { apps: (a.data ?? []) as Application[], tasks: (t.data ?? []) as ApplicationTask[] };
}

/**
 * Создаёт заявку и чек-лист: общие шаги + опубликованные сроки программы
 * (с датами — чтобы они попали в «ближайший срок»).
 */
export async function createApplication(userId: string, programId: string, academicYear: string, deadlines: Deadline[]): Promise<string> {
  const { data, error } = await db()
    .from('student_applications')
    .insert({ user_id: userId, program_id: programId, academic_year: academicYear })
    .select('id')
    .single();
  fail(error, 'Не удалось добавить программу');
  const id = (data as { id: string }).id;
  const tasks = [
    ...deadlines.map((d) => ({
      application_id: id,
      title: `Срок: ${d.title_ru} (${APPLICANT_CATEGORIES[d.applicant_category]})`,
      due_date: d.ends_at.slice(0, 10),
    })),
    ...DEFAULT_APPLICATION_TASKS.map((title) => ({ application_id: id, title })),
  ];
  const t = await db().from('application_tasks').insert(tasks);
  fail(t.error, 'Программа добавлена, но не удалось создать чек-лист');
  return id;
}

export async function getApplication(id: string): Promise<{ app: Application; tasks: ApplicationTask[]; events: ApplicationEvent[] } | null> {
  const [a, t, e] = await Promise.all([
    db().from('student_applications').select('*').eq('id', id).maybeSingle(),
    db().from('application_tasks').select('id, application_id, title, due_date, done, created_at').eq('application_id', id).order('done').order('due_date', { nullsFirst: false }).order('created_at'),
    db().from('application_events').select('id, status, by_staff, created_at').eq('application_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  fail(a.error, 'Не удалось загрузить заявку');
  if (!a.data) return null;
  return { app: a.data as Application, tasks: (t.data ?? []) as ApplicationTask[], events: (e.data ?? []) as ApplicationEvent[] };
}

export async function updateApplication(id: string, patch: Partial<Pick<Application, 'status' | 'notes' | 'curator_comment' | 'academic_year'>>) {
  const { error } = await db().from('student_applications').update(patch).eq('id', id);
  fail(error, 'Не удалось сохранить');
}

export async function deleteApplication(id: string) {
  const { error } = await db().from('student_applications').delete().eq('id', id);
  fail(error, 'Не удалось удалить');
}

export async function addTask(applicationId: string, title: string, dueDate: string | null) {
  const { error } = await db().from('application_tasks').insert({ application_id: applicationId, title, due_date: dueDate });
  fail(error, 'Не удалось добавить задачу');
}

export async function setTaskDone(id: string, done: boolean) {
  const { error } = await db().from('application_tasks').update({ done }).eq('id', id);
  fail(error, 'Не удалось обновить задачу');
}

export async function deleteTask(id: string) {
  const { error } = await db().from('application_tasks').delete().eq('id', id);
  fail(error, 'Не удалось удалить задачу');
}

export async function staffApplications(id?: string): Promise<StaffApplicationRow[]> {
  const { data, error } = await db().rpc('staff_applications', { p_id: id ?? null });
  fail(error, 'Не удалось загрузить заявки');
  return (data ?? []) as StaffApplicationRow[];
}

/** Ближайшая невыполненная задача с датой (сегодня или позже). */
export function nextDueTask(tasks: ApplicationTask[]): ApplicationTask | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return tasks
    .filter((t) => !t.done && t.due_date && t.due_date >= today)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
}
