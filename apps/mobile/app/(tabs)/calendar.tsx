import { Text, View } from 'react-native';
import { colors, spacing } from '@family-app/ui';

export default function AgendaScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Agenda</Text>
      <Text style={{ marginTop: spacing.md, color: colors.inkMuted }}>
        Em breve por aqui: visualização diária e semanal por pessoa, cuidador e residência.
      </Text>
    </View>
  );
}
