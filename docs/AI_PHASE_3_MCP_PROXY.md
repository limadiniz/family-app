# Fase 3 da IA — MCP por proxy governado

**Início:** 22 de agosto de 2026
**Estado:** proxy e contrato interno concluídos; conectores externos desativados.

## O que foi implementado

- registro local fechado para calendário, comunicados escolares e metadados de documentos;
- somente ferramentas `READ_ONLY`;
- conector e método remoto definidos pelo servidor, nunca pelo modelo;
- `subjectPersonId` obrigatório e autorização por pessoa/domínio antes da chamada;
- saída identificada como `UNTRUSTED_EXTERNAL_CONTENT`;
- limite de tamanho por ferramenta;
- telemetria sem argumentos, tokens ou resultados;
- endpoint externo de MCP deliberadamente inexistente: o proxy é um limite interno da API.

## O que falta para conectar um fornecedor

- [ ] selecionar o primeiro conector e revisar seu DPA, retenção e suboperadores;
- [ ] implementar OAuth/audiência/rotação em cofre de segredos;
- [ ] criar adapter para o token `MCP_CONNECTOR_EXECUTOR`;
- [ ] adicionar timeout, retry restrito, rate limit e circuit breaker no adapter;
- [ ] definir schemas fechados de entrada e saída para a versão do conector;
- [ ] executar testes de prompt injection, exfiltração, SSRF e confusão de tenant;
- [ ] iniciar com dados sintéticos e um tenant interno;
- [ ] habilitar `FF_AI_MCP_READ` apenas após aprovação dos gates.

Ferramentas de escrita continuam fora desta fase. `FF_AI_MCP_PROPOSALS` permanece sem implementação pronta e qualquer efeito futuro deverá passar por proposta, confirmação e nova autorização.

## Evidência local

Os testes confirmaram rejeição de ferramentas fora da allowlist, autorização antes do adapter, marcação de conteúdo externo como não confiável, `subjectPersonId` obrigatório e rejeição de argumentos não previstos pelo schema. Nenhuma chamada externa foi realizada.
