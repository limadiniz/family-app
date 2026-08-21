import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api-client';
import { colors, spacing } from '@family-app/ui';

interface Person {
  id: string;
  display_name: string;
  person_type: string;
}

export default function HojeScreen() {
  const [people, setPeople] = useState<Person[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    apiFetch<Person[]>('/persons')
      .then(setPeople)
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Hoje</Text>
      <Text style={{ color: colors.inkMuted, marginTop: spacing.xs }}>
        {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
      </Text>
      <FlatList
        style={{ marginTop: spacing.lg }}
        data={people}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.ink }}>{item.display_name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: colors.inkMuted }}>Sua família ainda não tem ninguém cadastrado.</Text>}
      />
    </View>
  );
}
