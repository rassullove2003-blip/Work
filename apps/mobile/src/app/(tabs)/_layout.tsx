import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme';
import { t } from '../../i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, active, color, focused }: { name: IconName; active: IconName; color: ColorValue; focused: boolean }) {
  return <Ionicons name={focused ? active : name} size={22} color={color as string} />;
}

function icon(name: IconName, active: IconName) {
  function Icon(props: { color: ColorValue; focused: boolean }) {
    return <TabIcon name={name} active={active} {...props} />;
  }
  return Icon;
}

export default function TabLayout() {
  const s = t().tabs;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: -0.2 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: s.home, tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="search" options={{ title: s.search, tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen name="scholarships" options={{ title: s.scholarships, tabBarIcon: icon('ribbon-outline', 'ribbon') }} />
      <Tabs.Screen name="applications" options={{ title: s.applications, tabBarLabel: s.applicationsShort, tabBarAccessibilityLabel: s.applications, tabBarIcon: icon('heart-outline', 'heart') }} />
      <Tabs.Screen name="profile" options={{ title: s.profile, tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
