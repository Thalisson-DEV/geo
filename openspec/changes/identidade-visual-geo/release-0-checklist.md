# Release 0: troca do prefixo `ces` por `geo`

Este release só renomeia. Nenhuma tela muda de aparência.

## Antes do deploy (backend)

O backend **não sobe** se encontrar qualquer variável `CES_*` ou propriedade `ces.*`. O log lista cada chave antiga e a nova. Renomeie no Railway (serviço `ces-backend`, cujo nome não muda) **no mesmo deploy**:

| Antes | Depois |
|---|---|
| `CES_URL_BASE` | `GEO_URL_BASE` |
| `CES_URL_PUBLICA` | `GEO_URL_PUBLICA` |
| `CES_AUDITORIA_SOLICITACAO_VERSAO_ATIVA` | `GEO_AUDITORIA_SOLICITACAO_VERSAO_ATIVA` |
| `CES_AUDITORIA_SOLICITACAO_CHAVE_V1` | `GEO_AUDITORIA_SOLICITACAO_CHAVE_V1` |
| `CES_ESTOQUE_SOLICITACOES_TECNICAS_ENABLED` | `GEO_ESTOQUE_SOLICITACOES_TECNICAS_ENABLED` |
| `CES_LOOKUP_RATE_LIMIT_ENABLED` | `GEO_LOOKUP_RATE_LIMIT_ENABLED` |
| `CES_LOOKUP_RATE_LIMIT_REQUESTS_PER_MINUTE` | `GEO_LOOKUP_RATE_LIMIT_REQUESTS_PER_MINUTE` |
| `CES_LOOKUP_RATE_LIMIT_WINDOW` | `GEO_LOOKUP_RATE_LIMIT_WINDOW` |
| `CES_MCP_CHAMADAS_POR_MINUTO` | `GEO_MCP_CHAMADAS_POR_MINUTO` |
| `CES_OBSERVABILITY_TECHNICAL_TOKEN` | `GEO_OBSERVABILITY_TECHNICAL_TOKEN` |
| `CES_TURNO_ENCERRAMENTO_AUTOMATICO_HABILITADO` | `GEO_TURNO_ENCERRAMENTO_AUTOMATICO_HABILITADO` |
| `CES_TURNO_ENCERRAMENTO_CRON` | `GEO_TURNO_ENCERRAMENTO_CRON` |
| `CES_TURNO_HORARIO_CORTE` | `GEO_TURNO_HORARIO_CORTE` |
| `CES_TURNO_ZONA` | `GEO_TURNO_ZONA` |
| `CES_RATE_LIMIT_*` (habilitado, modo padrão, pausa, timeout e cada balde: login, sessão, OAuth, MCP, Bússola, upload, usuário, WebSocket, público…) | `GEO_RATE_LIMIT_*` |
| qualquer outra `CES_<X>` (ex.: `CES_EMAIL_PROVEDOR`, `CES_R2_*`) | `GEO_<X>` |

A mesma troca vale para o `backend/.env` de cada máquina de desenvolvimento e para quem sobe com `-Dces.<x>=…` (use `-Dgeo.<x>=…`).

## Ordem

1. Renomear as variáveis do backend no Railway.
2. Subir o backend. Ele aceita o cookie `ces_sessao` (30 dias), as credenciais de IA `ces_*` já emitidas e os escopos `ces.leitura`/`ces.escrita`.
3. Subir o frontend. Na primeira abertura, ele copia as chaves `ces_*`, `ces.*` e `ces:*` do navegador para `geo_*`. Ninguém precisa entrar de novo e a fila offline não é afetada.

## Sem ação

- O nome do serviço no Railway (`ces-backend`) e o hostname interno (`ces-backend.railway.internal`) continuam os mesmos.
- O banco do aparelho (`CesDatabase`) e os bancos locais `ces-db`/`ces-postgres` continuam os mesmos.
- As migrações Flyway antigas não são alteradas.
- As métricas do Micrometer passam de `ces.*` para `geo.*`. Atualize os painéis que as usam.
- O nó MCP aparece para os clientes como `geo`, e o prompt passa de `cadastrar_no_ces` para `cadastrar_no_geo`.

## Depois de 30 dias

- Remover a leitura do cookie `ces_sessao` (`AuthController.COOKIE_SESSAO_LEGADO`).
- Remover a migração de chaves do navegador (`core/migracao/migrar-chaves-geo*`) e o fallback de `ces_theme_mode` no `index.html`.
- Avaliar o fim do aceite de credenciais `ces_*` e de escopos `ces.*`, depois de os clientes conectados renovarem as credenciais.

## Branches abertas

Antes do merge com a principal, rode na branch:

```bash
node tools/renomear-geo.mjs --aplicar   # troca tudo, idempotente
node tools/renomear-geo.mjs --check     # confirma que não sobrou nada
```

Depois rode o build e os testes normalmente.
