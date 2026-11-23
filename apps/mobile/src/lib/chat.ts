import { CHAT_MIME_TYPES } from '@uniitalia/shared';
import { supabase } from './supabase';
import { uploadFile, removeStoredFiles, type PickedFile } from './files';

export interface ChatMessage {
  id: string;
  student_id: string;
  sender_id: string | null;
  from_staff: boolean;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  created_at: string;
}

export interface StaffChatRow {
  student_id: string;
  email: string;
  full_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_from_staff: boolean | null;
  unread: boolean;
}

function db() {
  if (!supabase) throw new Error('Сервер не подключён');
  return supabase;
}

export async function loadMessages(studentId: string): Promise<ChatMessage[]> {
  const { data, error } = await db()
    .from('chat_messages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error('Не удалось загрузить сообщения');
  return (data ?? []) as ChatMessage[];
}

/** Отправка сообщения в чат студента (студентом или куратором). */
export async function sendMessage(studentId: string, body: string, file?: PickedFile | null): Promise<ChatMessage> {
  const stored = file ? await uploadFile('chat-attachments', studentId, file, CHAT_MIME_TYPES) : null;
  const { data, error } = await db()
    .from('chat_messages')
    .insert({
      student_id: studentId,
      body: body.trim() || null,
      attachment_path: stored?.path ?? null,
      attachment_name: stored?.name ?? null,
      attachment_mime: stored?.mime ?? null,
      attachment_size: stored?.size ?? null,
    })
    .select('*')
    .single();
  if (error) {
    if (stored) await removeStoredFiles('chat-attachments', [stored.path]);
    throw new Error(error.message.includes('row-level') ? 'Недостаточно прав.' : 'Сообщение не отправлено. Проверьте интернет и попробуйте ещё раз.');
  }
  return data as ChatMessage;
}

export async function markChatRead(studentId?: string | null): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('mark_chat_read', { p_student: studentId ?? null });
}

export async function staffChats(): Promise<StaffChatRow[]> {
  const { data, error } = await db().rpc('staff_chats');
  if (error) throw new Error('Не удалось загрузить чаты');
  return (data ?? []) as StaffChatRow[];
}

/** Подписка на новые сообщения в чате студента (мгновенная доставка). Возвращает функцию отписки. */
export function subscribeMessages(studentId: string, onMessage: (m: ChatMessage) => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel(`chat-${studentId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `student_id=eq.${studentId}` }, (p) =>
      onMessage(p.new as ChatMessage),
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
