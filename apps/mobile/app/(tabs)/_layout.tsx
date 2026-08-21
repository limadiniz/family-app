import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@family-app/ui';

/**
 * Main navigation (§6.4/§80): 5 tabs — Hoje, Filhos, Agenda, Assistente,
 * Família — ícones reais via @expo/vector-icons (já vem empacotado com
 * o Expo, sem dependência nova). Emergência continua existindo como
 * rota (screen `emergency`, ver `href: null` abaixo) mas sai da barra
 * de abas visível — fica acessível por um atalho dentro de Hoje, não
 * removida.
 */
type IoniconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  return <Ionicons name={name} size={22} color={focused ? colors.primary : colors.inkMuted} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Hoje', tabBarIcon: ({ focused }) => <TabIcon name="sunny-outline" focused={focused} /> }}
      />
      <Tabs.Screen
        name="children"
        options={{ title: 'Filhos', tabBarIcon: ({ focused }) => <TabIcon name="happy-outline" focused={focused} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Agenda', tabBarIcon: ({ focused }) => <TabIcon name="calendar-outline" focused={focused} /> }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: 'Assistente', tabBarIcon: ({ focused }) => <TabIcon name="sparkles-outline" focused={focused} /> }}
      />
      <Tabs.Screen
        name="family"
        options={{ title: 'Família', tabBarIcon: ({ focused }) => <TabIcon name="people-outline" focused={focused} /> }}
      />
      {/* href: null — mantém a rota navegável (link a partir de Hoje), mas tira o botão da tab bar (§6.4: 5 abas). */}
      <Tabs.Screen name="emergency" options={{ title: 'Emergência', href: null }} />
    </Tabs>
  );
}
