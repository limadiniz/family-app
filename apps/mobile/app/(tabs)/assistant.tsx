import { Text, View } from 'react-native';
import { colors, spacing } from '@family-app/ui';

export default function AssistenteScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Pergunte à ZELII</Text>
      <Text style={{ marginTop: spacing.md, color: colors.inkMuted }}>
        Em breve por aqui. Nenhuma pergunta chega até a ZELII sem passar antes pela mesma checagem de permissão
        que protege o resto do app.
      </Text>
    </View>
  );
}
