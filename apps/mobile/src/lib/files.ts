import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MAX_FILE_BYTES, safeFileName } from '@uniitalia/shared';
import { supabase } from './supabase';
import { openOfficial } from './links';

export type Bucket = 'student-documents' | 'chat-attachments';

/** Выбранный пользователем файл (ещё не загружен). */
export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
  size: number | null;
}

/** Загруженный файл — то, что сохраняется в базе. */
export interface StoredFile {
  path: string;
  name: string;
  mime: string;
  size: number;
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function mimeOf(name: string, given?: string | null): string {
  if (given && given !== 'application/octet-stream') return given === 'image/jpg' ? 'image/jpeg' : given;
  return EXT_MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

export type PickSource = 'file' | 'gallery' | 'camera';

/** Открывает выбор файла / фото / камеру. null — пользователь отменил. */
export async function pickFile(source: PickSource, allowed: string[]): Promise<PickedFile | null> {
  if (source === 'file') {
    const res = await DocumentPicker.getDocumentAsync({ type: allowed, copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    return { uri: a.uri, name: a.name, mime: mimeOf(a.name, a.mimeType), size: a.size ?? null };
  }
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Нет доступа к камере. Разрешите его в настройках телефона.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mime = mimeOf(a.fileName ?? 'photo.jpg', a.mimeType ?? 'image/jpeg');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/heic' ? 'heic' : 'jpg';
  return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${ext}`, mime, size: a.fileSize ?? null };
}

/** Загружает файл в приватное хранилище в папку владельца: <ownerId>/<время>-<имя>. */
export async function uploadFile(bucket: Bucket, ownerId: string, file: PickedFile, allowed: string[]): Promise<StoredFile> {
  if (!supabase) throw new Error('Сервер не подключён');
  if (!allowed.includes(file.mime)) throw new Error('Этот тип файла не поддерживается. Подойдут PDF, JPG, PNG или HEIC.');
  const body = await (await fetch(file.uri)).arrayBuffer();
  if (body.byteLength > MAX_FILE_BYTES) throw new Error('Файл больше 10 МБ. Сожмите его или сфотографируйте заново.');
  const path = `${ownerId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: file.mime, upsert: false });
  if (error) throw new Error(error.message.includes('row-level') ? 'Недостаточно прав для загрузки.' : `Не удалось загрузить файл: ${error.message}`);
  return { path, name: file.name.slice(0, 200), mime: file.mime, size: body.byteLength };
}

/** Открывает приватный файл по временной ссылке (действует 10 минут). */
export async function openStoredFile(bucket: Bucket, path: string): Promise<void> {
  if (!supabase) throw new Error('Сервер не подключён');
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error('Не удалось открыть файл. Возможно, он удалён.');
  await openOfficial(data.signedUrl);
}

export async function removeStoredFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(bucket).remove(paths);
}

/** Удаляет все файлы пользователя в его папке (перед удалением аккаунта). */
export async function removeAllOwnFiles(ownerId: string): Promise<void> {
  if (!supabase) return;
  for (const bucket of ['student-documents', 'chat-attachments'] as Bucket[]) {
    const { data } = await supabase.storage.from(bucket).list(ownerId, { limit: 1000 });
    await removeStoredFiles(bucket, (data ?? []).map((f) => `${ownerId}/${f.name}`));
  }
}
