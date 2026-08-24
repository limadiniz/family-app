import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { colors, spacing } from '@family-app/ui';
import { apiFetch } from '@/lib/api-client';

type Turn = { id: string; question: string; answer?: string; error?: string };

function answerText(answer: { text?: string; decision?: { situation?: string; suggestion?: { text?: string } } }) {
  if (answer.decision?.situation) {
    return `${answer.decision.situation}${answer.decision.suggestion?.text ? `\n\nSugestão da ZELII: ${answer.decision.suggestion.text}` : ''}`;
  }
  return answer.text ?? 'Não encontrei uma resposta segura com as informações autorizadas.';
}

export default function AssistenteScreen() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  async function ask() {
    const prompt = question.trim();
    if (!prompt || loading) return;
    const id = `${Date.now()}`;
    setQuestion('');
    setTurns((current) => [...current, { id, question: prompt }]);
    setLoading(true);
    try {
      const response = await apiFetch<{ text?: string; decision?: { situation?: string; suggestion?: { text?: string } } }>('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: prompt }),
      });
      const answer = answerText(response);
      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
      Speech.stop();
      Speech.speak(answer, { language: 'pt-BR', rate: 0.96 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível consultar a ZELII agora.';
      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, error: message } : turn)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.ink }}>Pergunte à ZELII</Text>
        <Text style={{ marginTop: spacing.xs, color: colors.inkMuted }}>
          A ZELII considera a rotina autorizada de toda a família. Você decide antes de qualquer ação.
        </Text>
      </View>
      <FlatList
        data={turns}
        keyExtractor={(turn) => turn.id}
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md }}
        ListEmptyComponent={<Text style={{ color: colors.inkMuted }}>Experimente: “O que temos amanhã?” ou “Há algo de saúde para preparar?”</Text>}
        renderItem={({ item }) => (
          <View style={{ gap: spacing.sm }}>
            <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: colors.primary, borderRadius: 16, padding: spacing.md }}>
              <Text style={{ color: colors.surface }}>{item.question}</Text>
            </View>
            <View style={{ maxWidth: '92%', backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              {item.answer && <Text style={{ color: colors.ink }}>{item.answer}</Text>}
              {item.error && <Text style={{ color: colors.critical }}>{item.error}</Text>}
              {!item.answer && !item.error && <ActivityIndicator color={colors.primary} />}
            </View>
          </View>
        )}
      />
      <View style={{ borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm, padding: spacing.md }}>
        <Text style={{ color: colors.inkMuted, fontSize: 12 }}>Use o ditado do teclado para falar sua pergunta. A resposta pode ser lida em voz alta.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <TextInput
            ref={inputRef}
            value={question}
            onChangeText={setQuestion}
            placeholder="Pergunte sobre agenda, escola ou saúde…"
            placeholderTextColor={colors.inkMuted}
            multiline
            maxLength={1000}
            editable={!loading}
            style={{ flex: 1, minHeight: 46, maxHeight: 112, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar pergunta à ZELII"
            disabled={loading || !question.trim()}
            onPress={ask}
            style={{ borderRadius: 12, backgroundColor: loading || !question.trim() ? colors.border : colors.primary, paddingHorizontal: spacing.md, paddingVertical: 14 }}
          >
            <Text style={{ color: colors.surface, fontWeight: '600' }}>Enviar</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
