import AsyncStorage from '@react-native-async-storage/async-storage';

/** JSON-хранилище на устройстве; ошибки чтения/записи не роняют приложение. */
export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // хранилище недоступно (например, приватный режим браузера) — работаем без сохранения
  }
}
