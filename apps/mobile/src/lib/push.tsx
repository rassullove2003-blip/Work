import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';

/**
 * Push-уведомления на экран телефона. Работают только в установленной сборке приложения:
 * в Expo Go (SDK 53+) push недоступен, в вебе — не поддерживается. Сервер отправляет push сам
 * при каждом новом уведомлении (таблица push_tokens + триггер notifications_push).
 */
const supported = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let currentToken: string | null = null;

async function loadModule() {
  return import('expo-notifications');
}

async function register(userId: string): Promise<void> {
  const Notifications = await loadModule();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Уведомления UniItalia', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted' || !supabase) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  currentToken = token;
  await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() });
}

/** Перед выходом из аккаунта: этот телефон больше не получает push для этого пользователя. */
export async function unregisterPush(): Promise<void> {
  if (!currentToken || !supabase) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

/** Подключается в корневом макете: регистрирует телефон и открывает экран из нажатого уведомления. */
export function PushRegistrar() {
  const { userId } = useAuth();

  useEffect(() => {
    if (!supported || !userId) return;
    register(userId).catch(() => {
      // нет разрешения или сети — приложение работает без push, уведомления остаются внутри приложения
    });
  }, [userId]);

  useEffect(() => {
    if (!supported) return;
    let sub: { remove(): void } | null = null;
    const open = (data: unknown) => {
      const link = (data as { link?: string } | undefined)?.link;
      if (link && link.startsWith('/')) router.push(link as never);
    };
    loadModule().then(async (Notifications) => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) open(last.notification.request.content.data);
      sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    });
    return () => sub?.remove();
  }, []);

  return null;
}
