# Arquitetura de IA da ZELII

## Estado atual

A ZELII possui um assistente de decisão familiar com recuperação autorizada, memória confirmada pelo usuário,
sinais determinísticos, respostas com fontes e ações supervisionadas. A flag canônica é `FF_AI_ENABLED`
(`AI_ENABLED` permanece apenas como alias de compatibilidade). Sem provedor configurado, o produto continua
funcionando em modo determinístico e não inventa uma resposta.

| Capacidade | Estado | Implementação / limite |
| --- | --- | --- |
| RAG estruturado | Ativo | Agenda, escola, saúde, medicamentos, documentos, atividades e memória autorizada |
| Busca lexical | Ativa | PostgreSQL full-text em português para capturas e memórias |
| Busca vetorial | Desativada | Depende de provedor de embeddings aprovado, reindexação e propagação de exclusão |
| Multi-index | Parcial | Combina índices transacionais e textuais; falta o índice vetorial |
| Cache semântico | Desativado | Falta versionamento/invalidação segura por fonte e política |
| Memória | Ativa e governada | Opt-in, por pessoa/domínio, corrigível, revogável e auditável |
| Uso de ferramentas | Ativo e supervisionado | Registro fechado; toda escrita nasce como proposta e exige confirmação |
| Agentes autônomos / reflection loops | Desativados | Ações familiares não podem ser executadas em loops autônomos |
| MCP externo | Desativado | Nenhum conector ou credencial foi aprovado/configurado |
| Fine-tuning | Não utilizado | Primeiro devem existir avaliações, consentimento e dataset anonimizado |
| Voz | Ativa no web compatível | Web Speech API; a API da ZELII recebe somente o texto reconhecido |

## Caminho obrigatório de uma pergunta

```text
Pergunta por texto ou transcrição de voz
        │
        ▼
API autenticada
        ├── limite atômico por usuário no PostgreSQL
        ├── recompõe todas as pessoas visíveis da família no servidor
        ├── resolve intenção e janela temporal
        ├── autoriza cada par pessoa + domínio no Family Policy Engine
        ├── recupera somente campos mínimos de fontes estruturadas/textuais
        ├── gera sinais determinísticos (conflito, transporte, preparação)
        ├── chama o provedor com timeout e contrato JSON, se configurado
        ├── valida IDs de fontes e conteúdo de risco
        ├── usa fallback determinístico em falha ou saída inválida
        └── registra telemetria sem pergunta, prompt ou resposta bruta
```

O navegador não seleciona nem envia IDs de pessoas para `/ai/ask`. A API calcula o escopo de toda a família a
cada pergunta, aplica RLS e revalida `VIEW/PROFILE`; depois o Gateway autoriza novamente o domínio específico
antes da recuperação. Assim, considerar toda a família não significa ampliar permissões.

## Recuperação, fontes e minimização

Cada fato possui identidade estável (`tipo:id`), pessoa, domínio, proveniência, estado de verificação e data da
fonte. Consultas temporais como “hoje”, “amanhã” e “esta semana” limitam a janela lida. O contexto é limitado por
pessoa e no total antes de chegar ao modelo.

A busca atual é híbrida em dois níveis:

1. filtros estruturados nos registros operacionais;
2. full-text search em português nas capturas e memórias autorizadas.

O índice vetorial só deve ser adicionado quando houver:

- embeddings aprovados para dados potencialmente sensíveis;
- separação obrigatória por tenant, pessoa e domínio antes da similaridade;
- versionamento da fonte e reindexação;
- exclusão/revogação propagada ao índice e ao cache;
- avaliações de recuperação, vazamento e relevância.

## Modelo e proteção contra prompt injection

O provedor recebe somente fatos já autorizados e minimizados dentro de um bloco marcado como conteúdo não
confiável. A saída deve obedecer ao contrato JSON `answer + supportedFactIds`; IDs desconhecidos, JSON inválido,
respostas médicas perigosas, falha de rede ou timeout acionam o resumo determinístico. Quando há fatos, pelo
menos uma fonte recebida deve sustentar a resposta.

## Memória

A conversa não vira memória automaticamente. Uma memória exige confirmação explícita, pessoa, domínio,
finalidade e, quando aplicável, validade. Ela pode ser inspecionada, exportada, corrigida por substituição ou
revogada. A recuperação falha de modo fechado quando não é possível validar a preferência de memória.

## Ferramentas e ações

`packages/ai/src/tool-registry.ts` é o registro fechado das ferramentas de ação. Cada definição possui risco,
autorizações exigidas e `PROPOSAL_ONLY`. O fluxo é:

```text
sugestão → proposta revisável → confirmação explícita → nova autorização → serviço de domínio → auditoria
```

O modelo não escolhe permissões e nunca chama diretamente tabelas ou serviços de escrita. Operações sensíveis,
como passagem de cuidado, resumo de saúde e atribuição de responsabilidade, são classificadas como tal.

## Voz e privacidade

O site usa o mecanismo de reconhecimento de fala oferecido pelo navegador, em `pt-BR`. A transcrição aparece no
campo para revisão e só é enviada ao tocar em **Perguntar**. A ZELII não recebe nem armazena o áudio neste fluxo;
o processamento do áudio pelo navegador ou seu fornecedor depende do dispositivo e das políticas desse
fornecedor. Se o recurso ou a permissão de microfone não estiver disponível, a entrada por texto permanece.

## Observabilidade e governança

`ai_runs` registra provedor, modelo, versão do prompt, resultado, latência, quantidade de pessoas, domínios e
referências das fontes. Pergunta, prompt, resposta e conteúdo médico bruto são deliberadamente excluídos. O
limite de uso é compartilhado entre réplicas da API por uma função atômica no banco e falha de modo fechado.

## Próximas etapas condicionadas

1. Criar conjunto de avaliações de relevância, groundedness, autorização e segurança médica com dados sintéticos.
2. Aprovar um provedor de embeddings e política LGPD antes de ativar `pgvector`.
3. Implementar cache somente com fingerprint de política e versões das fontes, invalidando em alteração/revogação.
4. Conectar MCP apenas por adaptadores allowlisted, credenciais de menor privilégio e proposta obrigatória para writes.
5. Considerar fine-tuning apenas se as avaliações provarem que prompt + RAG não atendem, usando dataset consentido e anonimizado.
6. Manter qualquer planejamento iterativo com limite rígido de passos e sem execução autônoma de efeitos externos.
