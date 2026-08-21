import { Text, View } from 'react-native';
import { colors, spacing } from '@family-app/ui';

export default function AssistenteScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Family Copilot</Text>
      <Text style={{ marginTop: spacing.md, color: colors.inkMuted }}>
        Chega na Fase 6 (AI). O AI Gateway já garante, desde agora, que nenhuma pergunta chega ao modelo de
        linguagem sem passar pelo Family Policy Engine.
      </Text>
    </View>
  );
}
