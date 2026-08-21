import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api-client';
import { colors, spacing } from '@family-app/ui';

interface Person {
  id: string;
  display_name: string;
  is_minor: boolean;
}

export default function FilhosScreen() {
  const [children, setChildren] = useState<Person[]>([]);

  useFocusEffect(
    useCallback(() => {
      apiFetch<Person[]>('/persons')
        .then((p) => setChildren(p.filter((x) => x.is_minor)))
        .catch(() => undefined);
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Filhos</Text>
      <FlatList
        style={{ marginTop: spacing.lg }}
        data={children}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <View style={{ padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.ink, fontWeight: '500' }}>{item.display_name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: colors.inkMuted }}>Adicione o primeiro dependente pelo app web durante o cadastro.</Text>}
      />
    </View>
  );
}
