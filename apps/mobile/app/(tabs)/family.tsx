import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api-client';
import { colors, spacing } from '@family-app/ui';

interface FamilyUnit {
  family_unit_id: string;
  role: string;
  family_units: { name: string };
}

export default function FamiliaScreen() {
  const [units, setUnits] = useState<FamilyUnit[]>([]);

  useFocusEffect(
    useCallback(() => {
      apiFetch<FamilyUnit[]>('/family-units').then(setUnits).catch(() => undefined);
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Família</Text>
      <FlatList
        style={{ marginTop: spacing.lg }}
        data={units}
        keyExtractor={(u) => u.family_unit_id}
        renderItem={({ item }) => (
          <View style={{ padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.ink, fontWeight: '500' }}>{item.family_units?.name}</Text>
            <Text style={{ color: colors.inkMuted, fontSize: 12 }}>Seu papel: {item.role}</Text>
          </View>
        )}
      />
    </View>
  );
}
