import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { ChatView } from '../components/ChatView';
import { EmptyState, ScreenHeader, ui } from '../components/ui';

export default function StudentChatScreen() {
  const auth = useAuth();
  return (
    <View style={ui.screen}>
      <ScreenHeader title="Чат с куратором" back />
      {!auth.enabled ? (
        <EmptyState icon="cloud-offline-outline" title="Сервер не подключён" />
      ) : !auth.userId ? (
        <EmptyState icon="lock-closed-outline" title="Войдите в аккаунт" text="Чат с куратором доступен после входа." action={{ title: 'Войти', onPress: () => router.push('/auth') }} />
      ) : (
        <ChatView studentId={auth.userId} intro="Кураторы UniItalia отвечают в рабочее время. Переписку видите только вы и кураторы." />
      )}
    </View>
  );
}
