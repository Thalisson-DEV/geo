<!-- Pré-requisitos: evoluir-processo-obras (frentes A–D) e identidade-visual-app-campo (frentes 0 e 1).
     Dependências: A antes de C/D/E; B depois da fundação do app; C depende de A e B; D depende de C; E e F em paralelo a C/D. -->

## A. Backend: contrato offline de Obras

- [ ] A.1 Ids gerados no aparelho e idempotência em APR, conclusão de APR, ocorrência, atividade e apontamento (reenvio igual devolve o registro; conteúdo diferente com o mesmo id é recusado)
- [ ] A.2 Avaliação da liberação pela data/hora de origem do aparelho, aceitando a cadeia APR → conclusão → apontamento enviada de uma vez
- [ ] A.3 Comando "ponto inteiro": aponta o restante programado de todos os itens do ponto na programação
- [ ] A.4 Data/hora do aparelho e do servidor, latitude, longitude e precisão em apontamento, APR, ocorrência e evidência
- [ ] A.5 Chegada/saída da equipe na obra (entidade, comando idempotente, consulta por turno)
- [ ] A.6 Pacote da equipe `GET /v1/obras/campo/pacote?desde=` (programações hoje + 7 dias, obras, planejamento compacto, kits, modelos de APR/foto, versões de PDF) restrito à equipe do usuário; download do PDF por hash
- [ ] A.7 Tipos `OBRA_*` no envio durável e adaptadores no módulo de Obras, com diagnósticos traduzidos
- [ ] A.8 Evidência por ponto/vão com id do aparelho, vínculo ao apontamento, etapa e carimbo; pendências de foto calculadas por modelo
- [ ] A.9 Endereço/referência da obra; horário previsto e número da manobra na programação com desligamento (migração + web)
- [ ] A.10 `idProgramacao` na solicitação técnica de material
- [ ] A.11 Perfil da equipe de Obras com `obras:turno:write` e `obras:execucao:write`; composição (líder e substitutos) ao abrir o turno (`Turno.informarComposicao`)
- [ ] A.12 Eventos de mudança de programação para aviso à equipe (Web Push com chave VAPID e assinatura por aparelho)

## B. App: base de Obras (depende da fundação do app)

- [ ] B.1 Perfil de Obras e abas Hoje, Obras, Material, Frota, Conta
- [ ] B.2 Tabelas offline de Obras (programações, obras, planejamento, kits, modelos, APR, ocorrências, apontamentos, chegadas, evidências) e migração do Dexie
- [ ] B.3 Armazenamento de PDFs e fotos em arquivo (OPFS com reserva em IndexedDB), `navigator.storage.persist()`, aviso de espaço e limpeza de obras concluídas
- [ ] B.4 Sincronização do pacote automática (ao abrir, ao voltar a rede, a cada lançamento) e "Pronto para trabalhar sem sinal"
- [ ] B.5 Fila de Obras com ordem por obra, dependência APR → apontamento e estados (no aparelho, enviando, enviado, conflito)

## C. App: dia da equipe (depende de A e B)

- [ ] C.1 Hoje guiado com próximo passo, obras do dia, condições da intervenção, material faltando e pendências
- [ ] C.2 Abrir turno com composição e veículo pré-preenchidos; checklist do veículo
- [ ] C.3 Ficha da obra em campo: endereço, "Como chegar", contato, programação, material previsto × saldo, anexos
- [ ] C.4 Chegada/saída com sugestão por GPS
- [ ] C.5 APR guiada em passos, com sugestões por condição, assinatura dos participantes e "Sem condição de executar". Opções sugeridas, a validar com o SST: riscos (choque elétrico, arco elétrico, queda de altura, queda de materiais ou ferramentas, movimentação de carga, tráfego, escavação, animais peçonhentos, clima, calor ou esforço físico); medidas (desenergização, bloqueio e aterramento, linha viva, sinalização e isolamento, inspeção de escada e cinto, plano de içamento, EPI e EPC, revezamento e hidratação); verificações (conversa sobre riscos, EPI em bom estado, ferramentas e veículo inspecionados, área sinalizada, clima permite, desligamento confirmado)
- [ ] C.6 Execução sobre o projeto: pontos coloridos por situação, "Tudo feito" por ponto, parcial por item; tablet em duas colunas, celular com folha
- [ ] C.7 Fotos do modelo por ponto/vão com câmera direta, carimbo e pendências
- [ ] C.8 Ocorrências com foto e ditado por voz; obra não programada; material complementar a partir do serviço
- [ ] C.9 As Built do ponto pré-preenchido e equipamentos por leitura de série/QR
- [ ] C.10 Fechar turno com relatório diário montado
- [ ] C.11 Avisos de reprogramação/cancelamento (notificação e ao abrir)

## D. App: supervisor (depende de C.3, C.7)

- [ ] D.1 Visita prévia, As Built e book no app usando `DocumentacaoTecnicaController` e os modelos de `/v1/obras/checklists`
- [ ] D.2 Acompanhamento das equipes (status, obra atual, agenda, APR pendente, ocorrências impeditivas)

## E. Web: revisão de fotos (em paralelo a C)

- [ ] E.1 Anexação manual de evidências a pontos/vãos
- [ ] E.2 Revisão (aprovar/reprovar com motivo), inconformidades e retorno da pendência à equipe
- [ ] E.3 Ranking de qualidade por equipe
- [ ] E.4 Relatório de medição detalhado usando só fotos aprovadas

## F. Status em tempo real (em paralelo a C)

- [ ] F.1 Cálculo de status a partir de turno, chegada/saída, apontamentos e telemetria com regras configuráveis
- [ ] F.2 Exibição na central de operações, dashboard de turnos, telemetria e no app do supervisor

## G. Fechamento

- [ ] G.1 Testes offline em tablet e celular reais, Android (Chrome) e iPhone (Safari instalado na tela inicial): sem sinal o dia todo, reconexão, conflito, app fechado com pendências
- [ ] G.2 Build/testes do app, backend e web; roteiro do sistema e documentação
