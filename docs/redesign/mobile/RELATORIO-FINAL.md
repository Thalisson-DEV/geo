# Relatório final — app de campo e Obras offline (20–21/11/2026)

Branch `feat/app-campo`, só commits locais (sem push, deploy ou banco remoto).

| Commit | O quê |
|---|---|
| `61a1eff7` | Backend: contrato offline de campo (frente A) + campos de endereço/desligamento no web |
| `ddd34a4f` | Backend: revisão de fotos, status das equipes, fechamento do turno na hora do aparelho (E/F) |
| `f1cdc890` | App: Obras offline (frentes B, C, D) |
| `20cb8ba8` | Web: revisão de fotos e status das equipes no boletim (E/F) |
| `779b9454` | App: componentes de toque que faltavam, lint de estilos, correções da revisão visual; capturas, OpenSpec e roteiro |

## 1. Backend — frente A (`execucao-campo-obras`)

- **Comandos de campo idempotentes** (APR, conclusão, ocorrência, atividade, apontamento, chegada/saída, evidência, relatório):
  id do aparelho em `id_local` + `hash_campo`; reenvio igual devolve o registro; mesmo id com outro conteúdo → 409
  `ID_LOCAL_REUTILIZADO`. Hora do aparelho, hora do servidor, GPS e precisão (`RegistroCampo`). Migração **V263**.
- **Liberação no instante de origem**: APR das 08:10 libera o apontamento das 10:30 mesmo enviados juntos à noite; impedimento
  da tarde não retroage. Conclusão vinda do app grava a hora do aparelho (nunca no futuro).
- **"Ponto inteiro"** (`Programacao.apontarLocalInteiro`), **chegada/saída** (`PresencaObra`).
- **Pacote** `GET /v1/obras/campo/pacote?desde=` (hoje + 7 dias, obras com endereço, projeto por hash, pontos, vãos, itens,
  modelos de APR e de fotos, avisos; 403 para outra equipe) e `GET /v1/obras/campo/obras/{id}/projeto`.
- **Envio durável `OBRA_*`** aplicado na hora pelo adaptador de Obras; recusa vira caso no backoffice com diagnóstico próprio
  (`OBRA_SEM_APR`, `OBRA_PROGRAMACAO_ALTERADA`…) e o motivo volta ao app.
- **Endereço/referência** na obra e **horário/manobra** do desligamento (backend + formulários do web, aviso de obra sem
  localização ao programar).
- **Perfil `EQUIPE_OBRAS`** (`obras:turno:read/write`, `obras:execucao:write`, `obras:campo:read`); abertura do turno com hora do
  aparelho, líder e substitutos; fechamento com `dataFim`.
- **Web Push** (VAPID + aes128gcm com o JDK, sem biblioteca nova): assinatura por aparelho, aviso a cada mudança de programação.
  Desligado sem `PUSH_VAPID_PUBLICA/PRIVADA` (os avisos chegam pelo pacote ao abrir).

Testado também contra o Postgres local (`nexo-db`): a V263 aplicou e o pacote respondeu com a massa fictícia.

## 2. App — frentes B, C, D

- Abas de Obras (Hoje, Obras, Material, Frota, Conta) e do supervisor (aba Obras).
- Banco local v14; PDFs/fotos em OPFS com reserva no IndexedDB (ArrayBuffer); `storage.persist()`.
- Pacote automático, "Pronto para trabalhar sem sinal", limpeza de obras que saíram da agenda.
- Fila de Obras pelo envio durável, na ordem, apontamento dependente da APR, conflito com motivo e "Refazer".
- Hoje guiado (próximo passo), turno de Obras sem sinal, ficha da obra (Como chegar, Cheguei/Saí, material previsto × saldo),
  APR em passos com sugestões por condição e assinaturas, "Sem condição de executar", execução sobre o projeto (pontos
  coloridos, Tudo feito, parcial, duas colunas no tablet), fotos do modelo com carimbo e pendências, série por QR,
  ocorrências, obra não programada, relatório do dia montado, avisos (Web Push na Conta + ao abrir).
- Supervisor: status das equipes agora, visita prévia pelo modelo de checklist, pedido de As Built e de book.
- e2e novos (`e2e/fase4/obras.spec.ts`): dia inteiro sem sinal enviando uma vez só e na ordem; conflito por programação
  cancelada; app morto no meio da APR volta no mesmo passo; aviso de cancelamento; supervisor.

## 3. Web — frentes E e F

- **Revisão de Fotos** (`Execução → Medição e Fechamento`): fila paginada (`geo-data-table` server), aprovar/reprovar com
  inconformidade, ranking por equipe; reprovada volta como pendência no app; relatório detalhado só com aprovadas (V264).
- **Status agora** das equipes no Boletim, calculado no servidor (`StatusOperacionalEquipe`, inatividade configurável).
- E.1 (anexar foto a ponto pelo web) já existia.

## 4. Redesign — `identidade-visual-app-campo`

- 1.5: puxar para atualizar e ação por arrasto. 1.8: botão flutuante na barra lateral. 3.1: `npm run lint:estilos` (roda antes
  do build). 3.4: `mobile/CLAUDE.md` atualizado. Toast sobe para o topo com folha aberta.

## Decisões tomadas sozinho

Registradas nos `design.md` das changes (seção "Decisões tomadas na implementação"). As principais: `id_local` em coluna
própria; turno fora do hash; envio durável aplica na hora; hash do PDF = chave + tamanho; opções da APR servidas pelo pacote;
Web Push sem dependência; série do equipamento na legenda da foto (a ficha As Built fica com o supervisor); obra não programada
busca entre as obras do pacote; próximo passo começa no turno (o checklist é cobrado pela tela do turno); toast no topo com
folha aberta; caixa de seleção na APR; tokens de papel/câmera.

## O que ficou de fora, e por quê

- **G.1 / 3.3 — teste em aparelho real** (tablet/celular Android, iPhone instalado): precisa de gente com os aparelhos.
- **2.1, 2.3–2.6 — migração das telas existentes**: elas já usam as primitivas unificadas; faltam lista + detalhe no tablet
  deitado (Transferências, Inspeções, Almoxarifado) e trocar o quadro de assinatura próprio da transferência pelo
  `geo-assinatura`. Adiado para não mexer nas garantias de retomada, que usam a transferência como fluxo.
- **3.2 — baselines visuais das telas novas**: as capturas foram geradas e revisadas, mas não entraram em `e2e/visual`.
- **F.2 na central de operações/telemetria** e uso da posição da telemetria no cálculo do status.
- **Artifact do roteiro** não foi republicado (a sessão não publica em serviço externo): republicar a partir do `.md`.
- **Chaves VAPID**: gerar (`npx web-push generate-vapid-keys`) e configurar `PUSH_VAPID_*` no ambiente para ligar o push.

## Resultado dos testes

- **App**: build ok (com o lint de estilos); unitários **54/54 arquivos** verdes; e2e completo
  (`characterization piloto fase4 sw a11y visual`, Android + iOS) **142 passaram, 4 pulados de propósito**, 0 falhas.
  Observação: `e2e/piloto/retomada.spec.ts` ("abrir o detalhe e voltar mantém o mesmo item no topo") é instável no WebKit sob
  carga da máquina — falhou 3 de 6 vezes **também no código-base** sem as mudanças desta sessão (as leituras do IndexedDB com
  300 transferências chegam a 4 s no WebKit do Playwright no Windows). Não é regressão; passou na bateria final.
- **Backend**: testes novos e tocados verdes (Campo*, PacoteCampoObras, SincronizacaoObras, WebPushService, RevisaoFoto,
  StatusOperacionalEquipe, TurnoUseCases, ObraUseCases, Programacao, Liberacao, PermissoesObras). Suíte completa final:
  **2.382 testes, 2.375 ok**. As falhas: 3 erros pré-existentes em `RenderizacaoAtaDocxServiceTest` (o `.docx` de referência
  que o teste lê não está no repositório); 1 em `AbastecimentoAppUseCasesTest` (frota, não tocado; passa isolado — instável); 2
  em `CampoOfflineObrasTest` causadas pela hora em que a suíte rodou (00:04, "08:10 de hoje" ainda no futuro) — teste corrigido
  para usar o dia anterior, verde.
- **Web**: build ok; `condicoes-programacao.component.spec`, `obra-form.component.spec`, `boletim-obra.logic.spec`,
  `revisao-fotos.logic.spec` e os specs de programação verdes; capturas pelo `playwright.obras.config.ts` (8/8).

## Capturas

- App: `docs/redesign/mobile/obras/{celular,tablet-retrato,tablet-paisagem}/30…40-*-{claro,escuro}.png`
  (`ETAPA=obras npx playwright test e2e/support/redesign-shots.spec.ts --project=android -g obras`).
- Web: `docs/redesign/screenshots/obras-campo/*` (`npx playwright test -c playwright.obras.config.ts`).
- Revisão do `ui-reviewer`: primeira passada reprovou com 3 bloqueantes (fotos sem margem/título, textarea, caixas da APR) e
  vários importantes; todos corrigidos. Na segunda passada os 3 bloqueantes antigos foram confirmados
  como resolvidos e apareceu 1 novo (tela do supervisor descida no tablet deitado), corrigido e recapturado; e2e visual, a11y e
  Obras verdes depois disso.

## Teste no navegador com o backend real (21/11/2026)

App (4300) e web (4200) no Chrome contra o backend local (8092, `nexo-db`), com o armazenamento apontado para um MinIO
descartável (nada foi gravado no bucket real). Usuários de teste criados pela API: `CAMPOOBRA` (perfil EQUIPE_OBRAS,
responsável pela equipe CON-BNF-01) e `ADMTESTE` (ADMINISTRADOR).

Roteiro feito pela equipe: abrir turno → Cheguei → APR (4 assinaturas) → "Tudo feito" → foto do modelo com carimbo e GPS →
modo sem internet: mais 2 pontos, ocorrência de falta de material, Saí, relatório e fechamento do turno → volta da rede:
cada registro chegou uma vez só (APR, 2 presenças, 3 apontamentos com 14 itens, foto, ocorrência, relatório) e o turno fechou.
Administrador: aba Obras do app (status das equipes, visita prévia, pedido de book) e, no web, Revisão de Fotos (reprovação
volta como pendência no pacote da equipe), ranking e Boletim.

Falhas encontradas e corrigidas nessa rodada:
- Perfil EQUIPE_OBRAS sem permissão para equipe, frota, materiais e saldos (V265) e cache de permissões por perfil com versão
  nova (`permissoes-perfil-v7`), para o deploy não reaproveitar a lista antiga do Redis.
- Download do projeto com `Content-Length` do cadastro: o app ficava esperando bytes; agora vale o tamanho do arquivo, e o
  app tem tempo limite no download (um download pendurado travava todas as sincronizações do pacote).
- Ponto "desmarcava" depois do "Tudo feito" enviado com sinal (o pacote só traz a execução na próxima sincronização).
- App reaberto direto na execução recusava foto com "Abra o turno"; o guard de Obras carrega o turno do aparelho.
- "Fechar o dia" aberto direto mostrava "Sem lançamentos no dia"; o texto espera os dados do aparelho.
- Depois de fechar o dia, o próximo passo voltava a sugerir "Abrir turno".
- Administrador completo (com almoxarifado/encerramento) não via a aba Obras; o supervisor pedia o pacote da equipe (422).
- Visita prévia: faltava o responsável (o servidor exige), a escolha única ia em `valor` em vez de `selecionadas`, a fila
  não saía na hora, campos sem nome acessível e "registrada(s)".
- Web: Revisão de Fotos dava erro 500 com fotos antigas sem equipe; o ranking não se atualizava depois de uma revisão.

Fora do código: `e2e/fase4/desvios.spec.ts` ("sem internet explica…") é instável também no código anterior (2 de 24).
