import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ScreenHeader, ui } from '../components/ui';
import { t } from '../i18n';

export default function NotFound() {
  const s = t();
  return (
    <View style={ui.screen}>
      <ScreenHeader title={s.common.notFound} back />
      <EmptyState icon="help-circle-outline" title={s.common.notFound} text={s.common.notFoundText} action={{ title: s.common.toHome, onPress: () => router.replace('/') }} />
    </View>
  );
}
