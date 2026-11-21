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

## Decisões tomadas na implementação (20/11/2026)

- **Id do aparelho em coluna própria (`id_local`)**, não como chave primária: a `BaseEntity` gera o UUID pelo Hibernate.
  Cada registro de campo guarda também `hash_campo` (SHA-256 do comando sem o turno), `data_origem`, `recebido_em`, GPS e
  precisão (`RegistroCampo`, embutido). O apontamento usa o par (`id_local`, item), porque um comando gera um apontamento por
  item. Reuso do id com outro conteúdo responde 409 `ID_LOCAL_REUTILIZADO`.
- **O turno não entra no hash** e pode vir vazio ou com o id provisório do aparelho: o servidor usa o turno que a equipe tinha
  aberto no instante do registro. Assim o reenvio depois da troca de ids não vira conflito.
- **Liberação no instante de origem** (`SituacaoLiberacao.avaliar(..., ate)`): só contam APR concluída e ocorrência impeditiva
  até a hora do apontamento. A conclusão vinda do app grava a hora do aparelho (nunca no futuro). Relógio do aparelho adiantado
  mais de 10 min vira a hora do servidor (`RegistroCampo.momentoConfiavel`).
- **Envio durável aplica na hora.** Os tipos `OBRA_*` são gravados como operação durável e aplicados em transação própria pelo
  `CampoObrasApi`; deu certo → `RESOLVIDO`, sem caso; recusou → caso no backoffice com o motivo, devolvido ao app em
  `motivo`. O reprocessamento do backoffice usa o mesmo adaptador. Diagnósticos próprios (`OBRA_SEM_APR`,
  `OBRA_PROGRAMACAO_ALTERADA`, `OBRA_SEM_TURNO`…). Também há a API direta `/v1/obras/campo/*`.
- **Hash do PDF** = SHA-256 da chave do armazenamento + tamanho (a chave muda a cada envio do arquivo); o PDF é baixado por
  `/v1/obras/campo/obras/{id}/projeto` (só obras na agenda da equipe).
- **Pacote**: o encarregado recebe a própria equipe (outra → 403); supervisor/backoffice informam `idEquipe`. Com `desde`, vão
  as programações criadas/alteradas, com evento ou com item executado depois disso; canceladas, excluídas e passadas a outra
  equipe vão em `programacoesRemovidas`. Avisos = eventos de programação da equipe.
- **Opções da APR no servidor** (`modeloApr` no pacote), com sugestões por condição (`SEMPRE`, `DESLIGAMENTO`, `LINHA_VIVA`,
  `PODA`, `ATERRAMENTO`), a validar com o SST.
- **Pendência de foto** = item obrigatório do modelo do ponto (ficha As Built ou o primeiro modelo usado na obra) sem foto,
  em ponto com algum item executado. Calculada no servidor (pacote e `/obras/{id}/pendencias-foto`) e no app.
- **Web Push sem biblioteca**: aes128gcm e VAPID com a criptografia do JDK (`WebPushService`). Sem `PUSH_VAPID_*`, fica
  desligado e os avisos chegam pelo pacote ao abrir. A assinatura guarda a equipe do usuário; os avisos saem depois do commit
  da mudança de programação.
- **Perfil `EQUIPE_OBRAS`** com `obras:turno:read/write`, `obras:execucao:write` e `obras:campo:read` (nova, também para
  administrador e supervisor, só leitura do pacote). Os perfis do web continuam sem escrita de turno/execução (V205).
- **Execução avulsa** (pedido do usuário em 21/11/2026, substitui o "registrar obra não programada" só com motivo): a equipe
  busca a obra no servidor (`GET /v1/obras/campo/obras/avulsa?numero=`), que devolve a obra como no pacote e os itens que ela
  pode executar. O app monta uma programação local `avulsa-<idObra>` e a equipe trabalha com as mesmas telas. O
  apontamento vai sem `idProgramacao` e com `idObra`; o servidor cria ou reaproveita a programação avulsa da equipe no dia
  (`programacoes.avulsa`, V266) e inclui nela só os itens apontados, com o valor vigente — nada fica preso como programado e
  o valor entra na medição. A programação avulsa do servidor não volta ao app (ele usa a local). Sem sinal na hora da busca,
  não há execução avulsa (o app explica); com a obra já buscada, tudo funciona sem sinal.
- **Avaliação no Chrome com o backend real (21/11/2026)**:
  - A liberação do dia vem também do servidor (`liberacaoDoDia` no pacote): APR feita em outro aparelho, ou antes de sair e
    entrar, não é pedida de novo.
  - **Além do programado**: o pacote traz, por obra da agenda, os itens pendentes fora de qualquer programação
    (`itensExtras`); a equipe executa pontos extras da mesma obra sem sinal ("Ir além do programado" → avulsa local com
    motivo "Além do programado"). Mesmo mecanismo da avulsa no servidor; o supervisor vê como programação avulsa.
  - **Avulsa sem sinal**: o pacote traz as obras em aberto da base da equipe (`obrasAbertas`: número, título, município).
    Sem sinal, a equipe acha a obra e começa (chegada, APR, ocorrências); os pontos, os itens e o projeto chegam sozinhos
    quando o sinal volta (`completarAvulsas`). Obra de outra base sem sinal: o app explica e pede o sinal.
  - Foto de avulsa aceita pelo servidor em obra em aberto (antes era recusada por "não está na agenda"). Registro recusado:
    "Enviar de novo" (nova operação com o mesmo id do aparelho) ou "Descartar" — antes só "Refazer", que apagava a foto.
  - **Checklist do veículo**: continua obrigatório na abertura do turno quando a frota cadastrou checklist para o veículo;
    veículo sem checklist cadastrado (sem ficha ou sem tipo) e catálogo não baixado agora aparecem com aviso, em vez de
    passarem em silêncio. A tela de abrir turno atualiza o catálogo da frota quando há sinal.
- **Clareza para a equipe** (revisão de 21/11/2026): cada ponto diz os serviços ("Instalar poste · Lançar cabo (faltam 20 M)")
  em vez de contagens; o próximo ponto é destacado; barra de progresso; ficha com "O que fazer" (serviços somados); projeto
  com zoom (botões e pinça), tela cheia e marcadores de 40 px com contorno; na ficha, o passo antes de chegar é "Cheguei na obra".
- **APR vale pelo dia** (revisão do usuário em 21/11/2026, substitui a de 01/11 "cada APR libera o seu serviço"): a APR é a
  análise preliminar de riscos feita antes do serviço; uma concluída no dia libera todos os serviços da equipe no dia, e outras
  podem ser feitas ao longo do dia. "Sem condição de executar" continua por obra: bloqueia aquela obra até uma APR dessa obra
  concluída depois (decisão minha: a condição que mudou é a daquela obra). O apontamento na fila depende da última APR da obra,
  ou da última do dia.
- **Abertura do turno** aceita `dataInicio` (hora do aparelho, até 24 h atrás), `idLider` e `idsSubstitutos`; o fechamento aceita
  `dataFim`. No app, o turno de Obras abre/fecha sem sinal com id `local-…`, trocado pelo do servidor quando a abertura sai da fila
  (o fechamento espera a abertura).
- **Revisão de fotos** (V264): situação na própria `EvidenciaPonto` (pendente/aprovada/reprovada, inconformidade, motivo, quem e
  quando) e a equipe que tirou (para o ranking). Reprovada nunca entra no As Built/book e volta como pendência no pacote do app
  com o motivo; o relatório de medição detalhado usa só aprovadas.
- **Status das equipes** (`StatusOperacionalEquipe`): sem turno, encerrado, a caminho, na obra, executando, parada (sem
  apontamento há `geo.obras.status.minutos-inatividade`, padrão 90), sem condição, sem obra. Calculado de turno, chegada/saída,
  apontamentos e "sem condição"; a posição da telemetria (raio da base/obra) fica para quando houver integração no cálculo.
- **C.9 no app da equipe**: a série do equipamento (QR ou teclado) vai na legenda da foto da placa; a ficha As Built por ponto
  continua com o supervisor/web, que tem `obras:documentacao:write` (a equipe não tem).
- **Obra não programada** busca entre as obras do pacote: a equipe não tem leitura do cadastro de obras.
- **Arquivos no aparelho**: OPFS quando há escrita (Chrome); no Safari a reserva grava ArrayBuffer + tipo no IndexedDB (Blob no
  IndexedDB falha em alguns WebKit).

## Risks / Trade-offs

- [Armazenamento com PDFs grandes / iOS limpando dados] → armazenamento persistente, só obras programadas, limpeza automática,
  aviso de espaço e reenvio do pacote ao abrir.
- [GPS impreciso] → guardar a precisão; não georreferenciar ponto com precisão acima do limite.
- [Relógio do aparelho errado] → guardar hora do dispositivo e do servidor; relatórios usam a do servidor quando divergirem.
- [App fechado com envios pendentes no iPhone] → selo de pendentes no ícone e no Hoje; pedido de abrir o app ao chegar com sinal.
- [Reprogramação durante o dia sem sinal] → apontamento de item retirado vira conflito com motivo; o web decide.
