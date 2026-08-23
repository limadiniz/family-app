# Ambientes locais da ZELII

## 1. PostgreSQL para desenvolvimento e testes

O instalador interativo usa o PostgreSQL 17 já instalado, detecta as portas 5432/5433, não grava a senha e mantém bancos existentes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-databases.ps1
```

Ele cria e prepara:

- `zelii_dev`: migrations e seed fictício Família Silva;
- `zelii_test`: migrations e execução das suítes RLS reais.

Opções úteis:

```powershell
.\scripts\setup-local-databases.ps1 -SkipSeed
.\scripts\setup-local-databases.ps1 -SkipTests
.\scripts\setup-local-databases.ps1 -CandidatePorts 5433
```

O PostgreSQL puro não fornece Auth, API, Realtime, Storage ou Studio do Supabase. Ele serve para migrations, seed, API/policy diagnostics e testes RLS.

## 2. Supabase local completo

Pré-requisitos ainda necessários nesta máquina:

1. habilitar WSL 2;
2. reiniciar o Windows;
3. instalar e iniciar Docker Desktop com backend WSL 2.

Depois:

```powershell
npx --yes supabase@latest start
npx --yes supabase@latest db reset --local
npx --yes supabase@latest status
```

Portas definidas em `supabase/config.toml`:

- API: `http://localhost:54321`;
- PostgreSQL: `localhost:54322`;
- Studio: `http://localhost:54323`.

Copie URL e chaves retornadas por `supabase status` para os arquivos locais de API, web e mobile. Nunca use `db reset --linked`: este repositório também está vinculado ao projeto de produção.
