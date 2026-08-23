# Publicação de produção ZELII — 22/08/2026

## Resultado

A fundação das fases 1–4 da IA foi publicada tecnicamente em produção. As capacidades avançadas continuam
desativadas por gates de segurança até existirem fornecedor, política LGPD, métricas e avaliações aprovadas.

## Banco de dados

- Supabase remoto estava sincronizado até a migração 33.
- O `dry-run` indicou exclusivamente as migrações 34, 35 e 36.
- As três migrações aditivas foram aplicadas com sucesso.
- O histórico remoto foi verificado e está sincronizado até a migração 36.
- Os 47 testes reais de PostgreSQL/RLS haviam sido aprovados no banco local isolado antes da aplicação.

Um backup com dados pessoais não foi exportado para o computador, para evitar cópia indevida de informações de
famílias. O dump apenas estrutural não pôde ser gerado pela CLI porque o Docker Desktop não está instalado. A
publicação prosseguiu após revisão das migrações aditivas e validação integral local.

## API

- Aplicação: `family-app-api-production` no Fly.io.
- Estratégia: rolling deploy.
- Build remoto: 11 de 11 pacotes aprovados.
- Máquina atualizada e considerada saudável pelo Fly.
- `GET /health`: HTTP 200.
- Swagger confirma as novas rotas `ai/capabilities`, `ai/agent/run`, `ai/ask` e `ai/memory`.
- Rotas familiares continuam protegidas por autenticação.
- CORS permite a origem `https://www.zelii.com.br`.

## Web

- `https://www.zelii.com.br` respondeu HTTP 200.
- Título validado: `ZELII — Todo o cuidado da família em sintonia`.
- O envio do commit para `main` aciona a integração de produção da Vercel.

## Pendência bloqueante antes da comercialização

Antes de comercializar a aplicação, criar e homologar um ambiente totalmente separado de produção. No momento
desta publicação, as APIs de staging e produção ainda apontam para o mesmo Supabase. A pendência foi adicionada
como critério obrigatório em `docs/checklists/infra-checklist.md` e o pipeline agora recusa ambientes com refs
Supabase iguais.
