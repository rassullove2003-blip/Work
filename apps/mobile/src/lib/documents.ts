import { DOCUMENT_MIME_TYPES, type DocumentCategory, type DocumentStatus } from '@uniitalia/shared';
import { supabase } from './supabase';
import { removeStoredFiles, uploadFile, type PickedFile } from './files';

export interface StudentDocument {
  id: string;
  user_id: string;
  category: DocumentCategory;
  title: string | null;
  status: DocumentStatus;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  staff_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // для сотрудников (RPC staff_documents)
  email?: string;
  full_name?: string | null;
}

function db() {
  if (!supabase) throw new Error('Сервер не подключён');
  return supabase;
}

function fail(e: { message: string } | null, text: string): void {
  if (!e) return;
  const m = e.message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission')) throw new Error('Недостаточно прав.');
  throw new Error(`${text}: ${e.message}`);
}

export async function listDocuments(userId: string): Promise<StudentDocument[]> {
  const { data, error } = await db().from('student_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  fail(error, 'Не удалось загрузить документы');
  return (data ?? []) as StudentDocument[];
}

export async function staffDocuments(studentId?: string | null): Promise<StudentDocument[]> {
  const { data, error } = await db().rpc('staff_documents', { p_student: studentId ?? null });
  fail(error, 'Не удалось загрузить документы');
  return (data ?? []) as StudentDocument[];
}

/** Загружает новый документ: файл в хранилище + запись в базе. */
export async function addDocument(userId: string, category: DocumentCategory, title: string, file: PickedFile): Promise<void> {
  const stored = await uploadFile('student-documents', userId, file, DOCUMENT_MIME_TYPES);
  const { error } = await db().from('student_documents').insert({
    user_id: userId,
    category,
    title: title.trim() || null,
    storage_path: stored.path,
    file_name: stored.name,
    mime_type: stored.mime,
    size_bytes: stored.size,
  });
  if (error) {
    await removeStoredFiles('student-documents', [stored.path]);
    fail(error, 'Не удалось сохранить документ');
  }
}

/** Заменяет файл документа (статус снова станет «На проверке»). */
export async function replaceDocumentFile(doc: StudentDocument, file: PickedFile): Promise<void> {
  const stored = await uploadFile('student-documents', doc.user_id, file, DOCUMENT_MIME_TYPES);
  const { error } = await db()
    .from('student_documents')
    .update({ storage_path: stored.path, file_name: stored.name, mime_type: stored.mime, size_bytes: stored.size })
    .eq('id', doc.id);
  if (error) {
    await removeStoredFiles('student-documents', [stored.path]);
    fail(error, 'Не удалось заменить файл');
  }
  if (doc.storage_path) await removeStoredFiles('student-documents', [doc.storage_path]);
}

export async function deleteDocument(doc: StudentDocument): Promise<void> {
  const { error } = await db().from('student_documents').delete().eq('id', doc.id);
  fail(error, 'Не удалось удалить документ');
  if (doc.storage_path) await removeStoredFiles('student-documents', [doc.storage_path]);
}

/** Куратор: статус проверки и комментарий. */
export async function reviewDocument(id: string, status: DocumentStatus, comment: string): Promise<void> {
  const { error } = await db()
    .from('student_documents')
    .update({ status, staff_comment: comment.trim() || null })
    .eq('id', id);
  fail(error, 'Не удалось сохранить проверку');
}
