import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api-client';
import { colors, spacing } from '@family-app/ui';

interface Person {
  id: string;
  display_name: string;
}

interface EmergencyProfile {
  blood_type: string | null;
  allergies: string[];
  conditions: string[];
  critical_medications: string[];
  pediatrician_name: string | null;
  preferred_hospital: string | null;
  emergency_contacts: Array<{ name: string; phone: string; relationship?: string }>;
}

/**
 * Emergency Profile quick access (§41-44). Same endpoint as the web app
 * (GET /persons/:id/emergency-profile) — every load is audited
 * server-side regardless of the outcome, so this screen intentionally
 * does not attempt to cache/store the response beyond component state.
 */
export default function EmergencyScreen() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmergencyProfile | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      apiFetch<Person[]>('/persons')
        .then((list) => {
          setPeople(list);
          if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
        })
        .catch(() => undefined);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedId) return;
      setProfile(undefined);
      apiFetch<EmergencyProfile | null>(`/persons/${selectedId}/emergency-profile`)
        .then(setProfile)
        .catch(() => setProfile(null));
    }, [selectedId]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Emergência</Text>

      <FlatList
        horizontal
        style={{ marginTop: spacing.md, flexGrow: 0 }}
        data={people}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <Text
            onPress={() => setSelectedId(item.id)}
            style={{
              marginRight: spacing.sm,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: item.id === selectedId ? colors.primary : colors.surface,
              color: item.id === selectedId ? '#fff' : colors.ink,
              fontSize: 13,
            }}
          >
            {item.display_name}
          </Text>
        )}
      />

      {profile === undefined && <Text style={{ marginTop: spacing.lg, color: colors.inkMuted }}>Carregando...</Text>}
      {profile === null && (
        <Text style={{ marginTop: spacing.lg, color: colors.inkMuted }}>Nenhuma informação de emergência cadastrada.</Text>
      )}
      {profile && (
        <View style={{ marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
          <Text style={{ color: colors.ink }}>Tipo sanguíneo: {profile.blood_type ?? '—'}</Text>
          <Text style={{ color: colors.ink, marginTop: 6 }}>
            Alergias: {profile.allergies?.length ? profile.allergies.join(', ') : '—'}
          </Text>
          <Text style={{ color: colors.ink, marginTop: 6 }}>
            Condições: {profile.conditions?.length ? profile.conditions.join(', ') : '—'}
          </Text>
          <Text style={{ color: colors.ink, marginTop: 6 }}>Pediatra: {profile.pediatrician_name ?? '—'}</Text>
          <Text style={{ color: colors.ink, marginTop: 6 }}>Hospital: {profile.preferred_hospital ?? '—'}</Text>
        </View>
      )}
    </View>
  );
}
