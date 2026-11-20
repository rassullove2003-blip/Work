import { ru, type Strings } from './ru';

// Сейчас доступен только русский. Новые языки добавляются сюда.
const dictionaries: Record<string, Strings> = { ru };

let current: Strings = dictionaries.ru;

export function setLanguage(lang: string) {
  current = dictionaries[lang] ?? dictionaries.ru;
}

/** Текущий словарь интерфейса. */
export function t(): Strings {
  return current;
}

export { plural } from './ru';
