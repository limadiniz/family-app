import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@family-app/ui';

/** Main navigation (§80): Hoje, Filhos, Agenda, Assistente, Família + FAB quick-add (§81) inside each screen. */
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 11, color: focused ? colors.primary : colors.inkMuted }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoje', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="children" options={{ title: 'Filhos', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="calendar" options={{ title: 'Agenda', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistente', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="family" options={{ title: 'Família', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="emergency" options={{ title: 'Emergência', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
    </Tabs>
  );
}
