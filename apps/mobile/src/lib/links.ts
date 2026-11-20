import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform } from 'react-native';

/** Открывает официальный сайт во встроенном браузере. */
export async function openOfficial(url: string | null | undefined) {
  if (!url) return;
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Alert.alert('Не удалось открыть ссылку', url);
  }
}

/** Alert, который работает и в вебе (для проверки в браузере). */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export function confirmAction(title: string, message: string, confirmText: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
