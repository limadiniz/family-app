import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Hoje</Text>
          <Text style={{ color: colors.inkMuted, marginTop: spacing.xs }}>
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
          </Text>
        </View>
        {/* Emergência não tem mais aba própria (§6.4) — este é o atalho que a substitui, sempre visível em Hoje. */}
        <Link
          href="/emergency"
          accessibilityLabel="Emergência"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: colors.critical + '1A',
          }}
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.critical} />
          <Text style={{ color: colors.critical, fontSize: 13, fontWeight: '600' }}>Emergência</Text>
        </Link>
      </View>
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
