## Why

A etapa 1 (`evoluir-processo-obras`) levou planejamento, programação, apontamento web e medições para o sistema, mas a execução
continua sendo informada pelo backoffice. Para o ciclo da obra ficar completo e confiável, a equipe de campo precisa registrar no
app, mesmo sem sinal, o que executou em cada ponto e vão, com evidência fotográfica e localização.

O app é desenhado a partir do **dia real da equipe** (sair da base → abrir turno → ir à obra → APR → executar → fotografar →
imprevistos → fechar o turno), não das entidades do backend. Diretriz do produto: tudo o que puder ser facilitado para a equipe
de campo deve ser facilitado — o app diz o próximo passo, pré-preenche o que o sistema já sabe, agrupa por ponto e nunca trava por
falta de rede.

Depende da change `identidade-visual-app-campo` (base técnica, shell e componentes do app) e da etapa 1.

## What Changes

**Equipe de campo (app, 100% offline)**
- Pacote offline automático: ao abrir com sinal, o app baixa sozinho a agenda da equipe (dia + próximos 7 dias), obras, projeto em
  PDF, pontos, vãos, kits, modelos de APR e de fotos e o saldo do caminhão; mostra "pronto para trabalhar sem sinal" e limpa
  obras concluídas.
- Perfil de Obras com abas próprias (Hoje, Obras, Material, Frota, Conta), separado das equipes comerciais.
- **Hoje** guiado: turno, obras do dia na ordem da programação com condições (turno da intervenção, linha viva, desligamento com
  horário e manobra, finaliza obra), material faltando no caminhão e um botão único com o próximo passo.
- Turno de Obras: abrir com composição/veículo do último turno pré-preenchidos, fechar com **relatório diário montado** do que foi
  lançado.
- Chegada e saída da obra registradas ao abrir/sair da obra no app (GPS no momento da ação); "Como chegar" abre o app de navegação.
- APR em passos curtos, pré-preenchida (obra, serviço, data, responsável, participantes), riscos e medidas sugeridos pelas
  condições da programação e do ponto, assinatura dos participantes na tela do encarregado, e "Sem condição de executar".
- Execução sobre o projeto: pontos coloridos por situação; **"Tudo feito" por ponto** com um toque, parcial sob demanda; GPS e
  hora gravados automaticamente.
- Fotos pela lista do modelo (antes/durante/depois) com carimbo de obra, ponto, data e GPS; foto faltando **avisa e vira
  pendência**, sem bloquear.
- Ocorrências tipadas com foto (inclusive falta de material), obra não programada, ficha As Built e
  equipamentos com leitura de série/QR.
- Avisos de reprogramação/cancelamento (Web Push com o app instalado e, sempre, ao abrir o app).

**Supervisor/administrativo (app)**
- Visita prévia, As Built e book no app.
- Acompanhar equipes: situação em tempo real, agenda, APR pendente e ocorrências que impedem execução.

**Backend**
- Contrato offline de Obras: pacote da equipe com download incremental; ids gerados no aparelho e reenvio idempotente para APR,
  ocorrência, atividade, apontamento, chegada/saída e evidência; cadeia offline APR → conclusão → apontamento; tipos de Obras no
  envio durável; GPS (com precisão) e hora do aparelho + do servidor; respostas de conflito com motivo.
- Apontamento "ponto inteiro" (todos os itens programados do ponto em um comando).
- Endereço/referência da obra e horário/número de manobra do desligamento na programação.
- Registro de chegada/saída da obra; perfil da equipe de Obras (`obras:turno:write`, `obras:execucao:write`); material
  complementar com `idProgramacao`; consulta "programações da minha equipe".

**Web**
- Revisão de fotos (aprovar/reprovar com motivo), inconformidades, ranking de qualidade por equipe; relatório detalhado só com
  fotos aprovadas.
- Status em tempo real das equipes; aviso de obra sem coordenada/endereço na programação.

**Fora do app de campo**: a equipe não solicita material. O material vem da programação dos pontos (kits) ou de solicitação
manual feita pelo web; o app mostra o previsto e o que falta no caminhão.

**Fica para etapas futuras**
- Empacotamento nativo (Capacitor) — só para Android e só se o PWA mostrar problema real.
- Login individual de cada membro da equipe e sincronização entre aparelhos da mesma equipe.
- Mapa offline (tiles); cerca geográfica em segundo plano; edição de planejamento no app; valoração em US.

## Capabilities

### New Capabilities
- `execucao-campo-app`: pacote offline, Hoje guiado, chegada/saída, projeto offline e marcação de execução no app.
- `contrato-offline-obras`: contrato de sincronização de Obras entre app e backend (pacote, idempotência, cadeia, conflitos).
- `evidencias-fotograficas-obra`: captura, anexação, revisão, inconformidades e ranking de fotos.
- `turno-campo-obras`: turno de Obras operado no app (APR, ocorrências, relatório, obra não programada, visita prévia, material).
- `supervisao-campo-app`: telas do supervisor/administrativo no app.
- `status-tempo-real-equipes`: status operacional da equipe combinando turno, app e telemetria.

### Modified Capabilities
<!-- Depende das capabilities da change evoluir-processo-obras (turnos-obras, planejamento-pdf-obra, medicoes-obras),
     que serão MODIFIED quando a etapa 1 for arquivada e as specs principais existirem. -->

## Impact

- App `mobile/`: perfil e abas de Obras, novas tabelas offline (programações, obras, planejamento, APR, ocorrências,
  apontamentos, evidências), armazenamento de PDFs/fotos em arquivo, notificações.
- Backend: módulo `obras` (comandos idempotentes, pacote da equipe, ponto inteiro, chegada/saída, endereço, desligamento), módulo
  `sincronizacao` (tipos e adaptadores de Obras), IAM (perfil da equipe).
- Web: revisão de fotos, ranking, status de equipe, avisos de cadastro na programação.
- Pré-requisitos: `evoluir-processo-obras` (frentes A–D) e `identidade-visual-app-campo` (fundação e shell).
