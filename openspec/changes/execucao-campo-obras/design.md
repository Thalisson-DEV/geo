## Context

Etapa 2 do processo de Obras. Depende da change `evoluir-processo-obras` (planejamento, programação, ApontamentoExecucao,
turnos de Obras, medições) e da `identidade-visual-app-campo` (app no Angular 22, tokens GEO, shell e componentes de toque).
O app `mobile/` já é offline-first: Dexie, fila de envio (`OutboxService`), troca de ids provisórios (`ids-trocados`), retomada de
sessão/rascunhos, envio durável (`POST /v1/sincronizacao/operacoes`, idempotente por `idOperacaoLocal`), visor de PDF (pdf.js),
leitor de código, assinatura e fotos de evidência.

Levantamento do backend (20/11/2026):
- `TurnoObraController`: atividades, relatório, ocorrências (`impedeExecucao`), APR (rascunho/conclusão) e anexos; apontamento por
  programação item a item. Nenhum comando aceita id gerado no cliente.
- `SituacaoLiberacao` exige APR concluída do serviço no dia para apontar; ocorrência que impede bloqueia até APR concluída depois.
- `DocumentacaoTecnicaController`: visita prévia, ficha As Built, evidências por ponto com etapa e GPS, equipamentos, book.
- `Programacao`: `idEquipe`, período, `turno`, `linhaViva`, `desligamento` (sem horário/manobra), `finalizaObra`.
- `Obra`: latitude/longitude e município, **sem endereço em texto**.
- Envio durável conhece só `TURNO, EXECUCAO, SOLICITACAO, TRANSFERENCIA, INSPECAO, ANEXO`.
- Solicitação técnica de material tem `idObra`, não `idProgramacao`.
- Turno aberto/fechado por `/v1/turnos` (módulo `execucao`), o mesmo usado pelo comercial.

Público e aparelhos: só o encarregado entra no app (um aparelho por equipe); ~70% tablet, também celular; Android e iPhone.
Equipes de Obras são separadas das comerciais.

## Goals / Non-Goals

**Goals:**
- O dia inteiro da equipe sem sinal, guiado, com o mínimo de digitação.
- Mesmo modelo de apontamento da etapa 1, sem duplicar em reenvio e sem sobrescrever o web.
- Evidências confiáveis (ponto/vão/apontamento, GPS, horário) e revisão antes da medição.

**Non-Goals:**
- Edição de planejamento no app; valoração em US.
- Capacitor/loja, login por membro, mapa offline, cerca geográfica em segundo plano (etapas futuras).

## Decisions

- **PWA, sem loja.** Não há como publicar na App Store e há iPhones na frota. Contornos: `navigator.storage.persist()` no
  primeiro acesso; PDFs e fotos em arquivos (OPFS, com reserva em IndexedDB) e só metadados no Dexie; envio ao abrir, ao voltar a
  rede e a cada lançamento (iOS não tem background sync); GPS só no momento da ação; Web Push com o app instalado e verificação de
  mudanças ao abrir. Alternativa (Capacitor) fica para Android, se aparecer perda de dados real.
- **Tablet primeiro.** Execução em duas colunas no tablet (projeto à esquerda, ponto/itens à direita); no celular, projeto em tela
  cheia e ponto numa folha que sobe de baixo.
- **Ids do aparelho em todos os comandos de campo.** APR, ocorrência, atividade, apontamento, chegada/saída e evidência recebem
  UUID gerado no app; o backend usa esse id como chave (reenvio devolve o mesmo resultado). Alternativa (chave composta item+data)
  rejeitada por perder parciais do mesmo dia.
- **Cadeia offline.** A fila envia por obra, em ordem de criação: APR → conclusão da APR → apontamentos. Como os ids são do
  aparelho, o apontamento já referencia a APR sem esperar troca de id. Uma falha na APR retém os apontamentos dependentes com o
  motivo "aguardando a APR".
- **Envio durável primeiro, escrita depois.** Cada comando de Obras entra também como operação durável (`OBRA_*`), para que nada
  se perca se a escrita falhar; o adaptador do tipo aplica no módulo `obras` e o reprocessamento do backoffice funciona igual.
- **Ponto inteiro.** Novo comando que aponta, para um ponto, o restante programado de todos os itens da programação. Parcial
  continua item a item.
- **Pacote da equipe.** `GET /v1/obras/campo/pacote?desde=` devolve programações da equipe (hoje + 7 dias), obras, planejamento
  compacto, kits, modelos de APR/foto e versões dos PDFs; PDFs baixados à parte por hash. Limpeza local de obras concluídas e de
  programações fora da janela; aviso quando faltar espaço.
- **Fotos não bloqueiam.** Foto exigida que falta vira pendência no ponto, no Hoje e no fechamento do turno; o web vê a pendência.
  Carimbo (obra, ponto, data/hora, GPS) desenhado no aparelho; arquivo comprimido; galeria permitida só onde o modelo permitir.
- **Conflitos.** O servidor valida programação, saldo e liberação no recebimento; recusa vira estado "conflito" com motivo
  traduzido e ação sugerida (refazer, conferir, descartar), sem alterar o web.
- **Chegada/saída.** Registradas ao tocar "Cheguei" (sugerido quando o GPS está perto da obra) e "Saí"; alimentam o status da
  equipe e as horas na obra.
- **Relatório montado.** O relatório diário é pré-preenchido com obras, pontos feitos, ocorrências e pendências; o encarregado
  revisa e completa.
- **Status da equipe**: cálculo no backend a partir de eventos (turno, chegada/saída, apontamento, telemetria) com regras
  configuráveis (raio da base, raio da obra, minutos de inatividade).

## Risks / Trade-offs

- [Armazenamento com PDFs grandes / iOS limpando dados] → armazenamento persistente, só obras programadas, limpeza automática,
  aviso de espaço e reenvio do pacote ao abrir.
- [GPS impreciso] → guardar a precisão; não georreferenciar ponto com precisão acima do limite.
- [Relógio do aparelho errado] → guardar hora do dispositivo e do servidor; relatórios usam a do servidor quando divergirem.
- [App fechado com envios pendentes no iPhone] → selo de pendentes no ícone e no Hoje; pedido de abrir o app ao chegar com sinal.
- [Reprogramação durante o dia sem sinal] → apontamento de item retirado vira conflito com motivo; o web decide.
