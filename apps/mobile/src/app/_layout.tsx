import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CatalogProvider } from '../lib/catalog';
import { AuthProvider } from '../lib/auth';
import { FavoritesProvider } from '../lib/favorites';
import { FiltersProvider } from '../lib/filters';
import { StaffProvider } from '../lib/staff';
import { NotificationsProvider } from '../lib/notifications';
import { RemindersProvider } from '../lib/reminders';
import { PushRegistrar } from '../lib/push';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StaffProvider>
        <NotificationsProvider>
        <RemindersProvider>
        <CatalogProvider>
          <FavoritesProvider>
            <FiltersProvider>
              <StatusBar style="dark" />
              <PushRegistrar />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
                <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
              </Stack>
            </FiltersProvider>
          </FavoritesProvider>
        </CatalogProvider>
        </RemindersProvider>
        </NotificationsProvider>
        </StaffProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
