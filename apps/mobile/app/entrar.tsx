import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { supabase } from '@/lib/supabase-client';
import { colors, spacing, radius } from '@family-app/ui';

export default function EntrarScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError('E-mail ou senha incorretos.');
      return;
    }
    router.replace('/(tabs)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Entrar</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="E-mail"
        value={email}
        onChangeText={setEmail}
        style={{
          marginTop: spacing.lg,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          backgroundColor: colors.surface,
        }}
      />
      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{
          marginTop: spacing.sm,
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
        <Text style={{ color: '#fff', fontWeight: '600' }}>Entrar</Text>
      </TouchableOpacity>
      <Link href="/cadastro" style={{ marginTop: spacing.lg, color: colors.primary, textAlign: 'center' }}>
        Criar conta
      </Link>
    </View>
  );
}
