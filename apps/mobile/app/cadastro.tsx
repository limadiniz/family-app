import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';
import { colors, spacing, radius } from '@family-app/ui';

export default function CadastroScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    try {
      await apiFetch('/onboarding/bootstrap', { method: 'POST', body: JSON.stringify({ displayName }) });
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir cadastro.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Criar conta</Text>
      {[
        { value: displayName, set: setDisplayName, placeholder: 'Seu nome' },
        { value: email, set: setEmail, placeholder: 'E-mail' },
      ].map((f) => (
        <TextInput
          key={f.placeholder}
          placeholder={f.placeholder}
          value={f.value}
          onChangeText={f.set}
          style={{
            marginTop: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.md,
            backgroundColor: colors.surface,
          }}
        />
      ))}
      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{
          marginTop: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          backgroundColor: colors.surface,
        }}
      />
      {error && <Text style={{ color: colors.critical, marginTop: spacing.sm }}>{error}</Text>}
      <TouchableOpacity
        onPress={handleSubmit}
        style={{ marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Criar conta</Text>
      </TouchableOpacity>
    </View>
  );
}
