# Fase 2 da IA — cache governado

**Início:** 22 de agosto de 2026
**Estado:** implementação concluída; ativação bloqueada por privacidade, provedor e avaliações.

## O que foi implementado

- cache exato por hash, sem persistir a pergunta bruta;
- cache semântico opcional com embedding, limiar conservador e o mesmo escopo rígido;
- chave vinculada a tenant, ator, política, pessoas, domínios, fontes, prompt e modelo;
- TTL entre 30 e 900 segundos;
- exclusão inicial de saúde, medicamentos, emergência, finanças e perguntas relativas a tempo;
- uso restrito a capturas e memórias autorizadas com versão conhecida;
- revalidação dos IDs de fatos antes de servir uma resposta;
- invalidação síncrona quando captura ou memória referenciada muda ou é revogada;
- armazenamento acessível somente por `service_role`;
- telemetria de hit/miss/rejeição sem pergunta ou resposta bruta;
- fallback transparente: erro de cache nunca impede a resposta normal.

## Ordem de consulta

```text
contexto recuperado e autorizado
  → cache exato
  → cache semântico (se aprovado)
  → provedor de linguagem
  → validação de segurança
  → armazenamento descartável
```

O cache nunca substitui a recuperação nem a autorização. A cada pergunta, a API primeiro reconstrói o contexto autorizado atual; por isso mudanças de fonte ou política alteram o fingerprint e impedem reutilização indevida.

## Gates restantes

- [ ] concluir RIPD específico de cache e embeddings;
- [ ] aprovar provedor e adapter de embeddings;
- [x] validar invalidação em PostgreSQL com pgvector local;
- [ ] medir precisão, falso hit, latência, custo e isolamento;
- [ ] aprovar limiar por modelo de embedding;
- [ ] executar rollout interno com kill switches separados;
- [ ] somente então marcar `PRIVACY_APPROVED`, `PROVIDER_APPROVED` e `SAFETY_EVALUATED`.

Flags: `FF_AI_EXACT_CACHE` e `FF_AI_SEMANTIC_CACHE`. Ativá-las hoje resulta em `BLOCKED` e não acessa o armazenamento.

## Evidência local

A suíte real confirmou isolamento service-only, invalidação de cache após alteração da fonte e ausência de conteúdo bruto nas tabelas de telemetria. A ativação continua bloqueada porque validação local não substitui RIPD, provedor aprovado e avaliação de falso hit.
